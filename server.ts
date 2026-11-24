import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInitialSeedDatabase } from './src/utils/seedData.ts';
import {
  SERVER_DEFAULT_USERS,
  authenticateServerUserWithMeta,
  createSession,
  getSessionByToken,
  revokeSession,
  revokeSessionsForUsername,
  createStreamTicket,
  consumeStreamTicket,
  checkLoginRateLimit,
  recordFailedLogin,
  clearLoginFailures,
  checkApiRateLimit,
  sanitizeDbForRole,
  sanitizeStateForRole,
  isMutationAllowedForRole,
  hasForbiddenPrototypeKeys,
  hasDangerousControlChars,
  isValidStaffUsername,
  recordSecurityEvent,
  getRecentSecurityEvents,
  getActiveSessionCount,
} from './serverAuth.ts';
import {
  RUNTIME_DATA_DIR,
  hashPassword,
  isPasswordHash,
  verifyPassword,
  ensureUsersHashed,
  decryptRemoteSheetPayload,
  encryptStateFileEnvelope,
  decryptStateFileEnvelope,
  getCryptoPosture,
} from './serverCrypto.ts';
import {
  ALLOWED_EXCEL_TABS,
  generateEncryptedExcelWorkbook,
  type ClinicalExcelTab,
} from './serverExcel.ts';
import type { AuthRole, AuthUser } from './src/utils/auth.ts';
import {
  normalizeSectionName,
  sanitizeClassSectionName,
  getAllClassSections,
  normalizeSheetSyncPayload,
  isPlaceholderSheetPassword,
  normalizeDatetimeString,
  normalizeDateOnlyString,
  normalizeTimeOnlyString,
  normalizeDosageString,
  normalizeSlashTextString,
  isOrphanedEncryptedVisit,
  isUnreadableEncryptedPlaceholder,
  normalizeHHMM,
  classifyVisitShift,
  resolveVisitShiftPeriod,
  generatePermanentId,
  calculateBmi,
  getCurrentAcademicYear,
  DEFAULT_INFIRMARY_SETTINGS,
  PURGED_TEST_VISIT_IDS,
  PURGED_TEST_MEASUREMENT_IDS,
  PURGED_TEST_HEALTH_PROFILE_IDS,
  type NurseDatabase,
  type StudentRecord,
  type VisitRecord,
  type MeasurementRecord,
  type HealthProfileRecord,
  type AppUserRecord,
  type MedicineInventoryRecord,
  type ItemInventoryRecord,
  type StockTransactionRecord,
  type BillRecord,
  type DoctorVisitSession,
  type DoctorVisitCase,
  type OpdRecord,
  type OpdStatus,
  type MedicalCampRecord,
  type CampScreeningRecord,
  type AnnualCheckupRecord,
  type AnnualCheckupFitness,
  type MenstrualLogRecord,
  type InfirmarySettings,
} from './src/utils/nurseLogic.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = RUNTIME_DATA_DIR;
const STATE_FILE = path.join(DATA_DIR, 'school-nurse-state.json');

// Kept strictly on the server — NEVER bundled into public frontend JavaScript
const DEFAULT_APPS_SCRIPT_URL =
  (process.env.APPS_SCRIPT_URL || '').trim() ||
  'https://script.google.com/macros/s/AKfycbxpB8pHEpmaZwnp6Zgzksl5xpFRi55EdE_srVOC7STWHcwiWp-lN-t4R1Zt207diPaLqQ/exec';

interface ServerState {
  db: NurseDatabase;
  appsScriptUrl: string;
  autoSyncEnabled: boolean;
  updatedAt: string;
  adminStudentOverrides?: Record<string, StudentRecord>;
  adminUserOverrides?: Record<string, AppUserRecord>;
  deletedUsernames?: string[];
  classRenames?: Record<string, string>;
}

function normalizeDbSections(db: NurseDatabase): NurseDatabase {
  const seenStudentSlots = new Set<string>();
  const seenStudentIds = new Set<string>();
  const students: StudentRecord[] = [];
  for (const s of db.students || []) {
    const rawRoll = String(s.roll_number || '').trim();
    if (/^\d+\.\d+$/.test(rawRoll)) continue;
    const section = normalizeSectionName(s.section);
    const roll_number = /^\d+$/.test(rawRoll) ? rawRoll.padStart(2, '0') : rawRoll;
    const slotKey = `${section.toLowerCase()}|${roll_number.toLowerCase()}`;
    if (seenStudentSlots.has(slotKey) || seenStudentIds.has(s.student_id)) continue;
    seenStudentSlots.add(slotKey);
    seenStudentIds.add(s.student_id);
    students.push({ ...s, section, roll_number });
  }

  const seenVisitIds = new Set<string>();
  const visits: VisitRecord[] = [];
  for (const v of db.visits || []) {
    if (
      !v.visit_id ||
      PURGED_TEST_VISIT_IDS.has(v.visit_id) ||
      seenVisitIds.has(v.visit_id) ||
      isOrphanedEncryptedVisit(v)
    ) {
      continue;
    }
    seenVisitIds.add(v.visit_id);
    const matched = students.find((s) => s.student_id === v.student_id);
    const stuName = v.student_name || matched?.full_name || '';
    const stuSec = normalizeSectionName(v.section || v.class || matched?.section || '');
    const rawR = String(v.roll_no || v.roll_number || matched?.roll_number || '').trim();
    const stuR = /^\d+$/.test(rawR) ? rawR.padStart(2, '0') : rawR;
    const normalizedDt = normalizeDatetimeString(v.visit_datetime);
    const settingsForShift: InfirmarySettings = {
      school_hours_start: normalizeHHMM(
        db.settings?.school_hours_start,
        DEFAULT_INFIRMARY_SETTINGS.school_hours_start
      ),
      school_hours_end: normalizeHHMM(
        db.settings?.school_hours_end,
        DEFAULT_INFIRMARY_SETTINGS.school_hours_end
      ),
      updated_at: db.settings?.updated_at,
    };
    visits.push({
      ...v,
      student_name: stuName,
      section: stuSec,
      class: stuSec,
      roll_number: stuR,
      roll_no: stuR,
      visit_datetime: normalizedDt,
      shift_period: resolveVisitShiftPeriod(
        {
          visit_datetime: normalizedDt,
          shift_period: v.shift_period,
          shift_overridden: v.shift_overridden,
        },
        settingsForShift
      ),
      reason: isUnreadableEncryptedPlaceholder(v.reason) ? 'Archived entry' : v.reason,
      observations: isUnreadableEncryptedPlaceholder(v.observations) ? '' : v.observations,
      action_taken: isUnreadableEncryptedPlaceholder(v.action_taken) ? '' : v.action_taken,
      dosage: isUnreadableEncryptedPlaceholder(v.dosage) ? '' : normalizeDosageString(v.dosage),
      notes: isUnreadableEncryptedPlaceholder(v.notes) ? '' : v.notes,
      administration_time: normalizeTimeOnlyString(v.administration_time),
    });
  }

  const seenMeasIds = new Set<string>();
  const measurements: MeasurementRecord[] = [];
  for (const m of db.measurements || []) {
    if (
      !m.measurement_id ||
      PURGED_TEST_MEASUREMENT_IDS.has(m.measurement_id) ||
      seenMeasIds.has(m.measurement_id)
    ) {
      continue;
    }
    seenMeasIds.add(m.measurement_id);
    measurements.push({
      ...m,
      measurement_date: normalizeDateOnlyString(m.measurement_date),
    });
  }

  const seenProfileIds = new Set<string>();
  const healthProfiles: HealthProfileRecord[] = [];
  for (const h of db.healthProfiles || []) {
    if (
      !h.health_record_id ||
      PURGED_TEST_HEALTH_PROFILE_IDS.has(h.health_record_id) ||
      seenProfileIds.has(h.health_record_id)
    ) {
      continue;
    }
    seenProfileIds.add(h.health_record_id);
    healthProfiles.push({
      ...h,
      date_recorded: normalizeDateOnlyString(h.date_recorded),
      last_reviewed: normalizeDateOnlyString(h.last_reviewed),
    });
  }

  const dispatches = Array.isArray(db.dispatches) ? db.dispatches : [];
  let users = Array.isArray(db.users) && db.users.length > 0 ? [...db.users] : [...SERVER_DEFAULT_USERS];
  const hasActiveAdmin = users.some(
    (u) => u.role === 'admin' && u.active_status !== 'Inactive' && Boolean(u.username)
  );
  if (!hasActiveAdmin) {
    const defaultAdmin = SERVER_DEFAULT_USERS.find((u) => u.role === 'admin');
    if (defaultAdmin && !users.some((u) => u.username.toLowerCase() === defaultAdmin.username.toLowerCase())) {
      users = [defaultAdmin, ...users];
    }
  }

  const classes = getAllClassSections(students, db.classes);
  const medicines = Array.isArray(db.medicines) ? db.medicines : [];
  const items = Array.isArray(db.items) ? db.items : [];
  const stockTransactions = Array.isArray(db.stockTransactions) ? db.stockTransactions : [];
  const bills = Array.isArray(db.bills) ? db.bills : [];
  const doctorVisits = Array.isArray(db.doctorVisits) ? db.doctorVisits : [];
  const doctorVisitCases = Array.isArray(db.doctorVisitCases) ? db.doctorVisitCases : [];
  const opdRecords = Array.isArray(db.opdRecords) ? db.opdRecords : [];
  const medicalCamps = Array.isArray(db.medicalCamps) ? db.medicalCamps : [];
  const campScreenings = Array.isArray(db.campScreenings) ? db.campScreenings : [];
  const settings: InfirmarySettings = {
    school_hours_start: normalizeHHMM(
      db.settings?.school_hours_start,
      DEFAULT_INFIRMARY_SETTINGS.school_hours_start
    ),
    school_hours_end: normalizeHHMM(
      db.settings?.school_hours_end,
      DEFAULT_INFIRMARY_SETTINGS.school_hours_end
    ),
    updated_at: db.settings?.updated_at,
  };

  return {
    students,
    visits,
    measurements,
    healthProfiles,
    dispatches,
    users,
    classes,
    medicines,
    items,
    stockTransactions,
    bills,
    doctorVisits,
    doctorVisitCases,
    opdRecords,
    medicalCamps,
    campScreenings,
    settings,
  };
}

function applyAdminOverridesToDb(
  baseDb: NurseDatabase,
  state: Pick<ServerState, 'adminStudentOverrides' | 'adminUserOverrides' | 'deletedUsernames' | 'classRenames'>
): NurseDatabase {
  const classRenames = state.classRenames || {};
  const mapClass = (sec: string): string => {
    let curr = normalizeSectionName(sec);
    const seen = new Set<string>();
    while (curr && !seen.has(curr.toLowerCase())) {
      seen.add(curr.toLowerCase());
      const next = classRenames[curr.toLowerCase()];
      if (!next) break;
      curr = next;
    }
    return curr;
  };

  const studentOverrides = state.adminStudentOverrides || {};
  const studentMap = new Map<string, StudentRecord>();
  for (const s of baseDb.students) {
    const mappedSec = mapClass(s.section);
    studentMap.set(s.student_id, { ...s, section: mappedSec });
  }
  for (const [sid, overrideStu] of Object.entries(studentOverrides)) {
    const mappedSec = mapClass(overrideStu.section);
    studentMap.set(sid, { ...overrideStu, section: mappedSec });
  }
  const mergedStudents = Array.from(studentMap.values());

  const deletedSet = new Set((state.deletedUsernames || []).map((u) => u.toLowerCase()));
  const userOverrides = state.adminUserOverrides || {};
  const userMap = new Map<string, AppUserRecord>();
  for (const u of baseDb.users || []) {
    const key = u.username.toLowerCase();
    if (!deletedSet.has(key)) {
      userMap.set(key, u);
    }
  }
  for (const [uname, overrideUser] of Object.entries(userOverrides)) {
    const key = uname.toLowerCase();
    if (!deletedSet.has(key)) {
      userMap.set(key, overrideUser);
    }
  }
  const mergedUsers = Array.from(userMap.values());

  const mergedClasses = getAllClassSections(
    mergedStudents,
    (baseDb.classes || []).map(mapClass)
  );

  const mergedVisits = baseDb.visits.map((v) => {
    const stu = studentMap.get(v.student_id);
    if (!stu) return { ...v, section: mapClass(v.section || v.class || ''), class: mapClass(v.class || v.section || '') };
    return {
      ...v,
      student_name: stu.full_name,
      section: stu.section,
      class: stu.section,
      roll_number: stu.roll_number,
      roll_no: stu.roll_number,
    };
  });

  const mergedDispatches = (baseDb.dispatches || []).map((d) => {
    const stu = studentMap.get(d.student_id);
    if (!stu) return { ...d, section: mapClass(d.section) };
    return {
      ...d,
      student_name: stu.full_name,
      section: stu.section,
      roll_number: stu.roll_number,
    };
  });

  return {
    ...baseDb,
    students: mergedStudents,
    visits: mergedVisits,
    dispatches: mergedDispatches,
    users: mergedUsers,
    classes: mergedClasses,
  };
}

const KNOWN_PLACEHOLDER_PASSWORDS = [
  'CHANGE_ADMIN_PASSWORD',
  'CHANGE_NURSE_PASSWORD',
  'CHANGE_WARDEN_PASSWORD',
];

function isPoisonedPlaceholderPassword(storedPassword: string): boolean {
  if (isPlaceholderSheetPassword(storedPassword)) return true;
  if (isPasswordHash(storedPassword)) {
    return KNOWN_PLACEHOLDER_PASSWORDS.some(
      (placeholder) => verifyPassword(placeholder, storedPassword).valid
    );
  }
  return false;
}

function healPoisonedPlaceholderUsers(users: AppUserRecord[]): AppUserRecord[] {
  let hadPoisoned = false;
  const cleaned: AppUserRecord[] = [];
  for (const u of users || []) {
    if (isPoisonedPlaceholderPassword(String(u.password || ''))) {
      hadPoisoned = true;
      const defaultMatch = SERVER_DEFAULT_USERS.find(
        (d) => d.username.toLowerCase() === String(u.username || '').trim().toLowerCase()
      );
      if (defaultMatch) {
        cleaned.push({ ...defaultMatch });
      }
      // Drop synthetic placeholder rows (e.g. 'warden' seeded with CHANGE_WARDEN_PASSWORD)
      continue;
    }
    cleaned.push(u);
  }

  if (hadPoisoned) {
    const present = new Set(cleaned.map((u) => u.username.toLowerCase()));
    for (const defUser of SERVER_DEFAULT_USERS) {
      if (!present.has(defUser.username.toLowerCase())) {
        cleaned.push({ ...defUser });
      }
    }
  }

  return ensureUsersHashed(cleaned.length > 0 ? cleaned : [...SERVER_DEFAULT_USERS]).users;
}

function mergePreservingHashedPasswords(
  incomingUsers: AppUserRecord[],
  existingUsers: AppUserRecord[]
): AppUserRecord[] {
  const existingMap = new Map<string, AppUserRecord>();
  for (const u of existingUsers || []) {
    existingMap.set(u.username.toLowerCase(), u);
  }
  const merged = (incomingUsers || [])
    .filter((u) => !isPlaceholderSheetPassword(u.password))
    .map((u) => {
      const prev = existingMap.get(u.username.toLowerCase());
      if (prev && isPasswordHash(prev.password) && !isPasswordHash(u.password)) {
        if (!u.password || verifyPassword(u.password, prev.password).valid) {
          return { ...u, password: prev.password };
        }
      }
      return u;
    });
  const baseList = merged.length > 0 ? merged : existingUsers;
  return healPoisonedPlaceholderUsers(baseList);
}

function loadServerState(): ServerState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    }
    if (fs.existsSync(STATE_FILE)) {
      const rawFile = fs.readFileSync(STATE_FILE, 'utf-8');
      const decryptedJson = decryptStateFileEnvelope(rawFile);
      const parsed = JSON.parse(decryptedJson) as Partial<ServerState>;
      if (parsed && parsed.db && Array.isArray(parsed.db.students)) {
        const savedUrl =
          typeof parsed.appsScriptUrl === 'string' && parsed.appsScriptUrl.trim()
            ? parsed.appsScriptUrl.trim()
            : DEFAULT_APPS_SCRIPT_URL;
        const loaded: ServerState = {
          db: normalizeDbSections(parsed.db),
          appsScriptUrl: savedUrl,
          autoSyncEnabled: parsed.autoSyncEnabled !== false,
          updatedAt: parsed.updatedAt || new Date().toISOString(),
          adminStudentOverrides: parsed.adminStudentOverrides || {},
          adminUserOverrides: parsed.adminUserOverrides || {},
          deletedUsernames: Array.isArray(parsed.deletedUsernames) ? parsed.deletedUsernames : [],
          classRenames: parsed.classRenames || {},
        };
        loaded.db = normalizeDbSections(applyAdminOverridesToDb(loaded.db, loaded));
        // Automatically heal any accounts poisoned by Google Sheet placeholder passwords & hash with salted scrypt
        loaded.db.users = healPoisonedPlaceholderUsers(loaded.db.users || []);
        if (loaded.adminUserOverrides) {
          for (const [uname, override] of Object.entries(loaded.adminUserOverrides)) {
            if (override.password && !isPasswordHash(override.password)) {
              loaded.adminUserOverrides[uname] = {
                ...override,
                password: hashPassword(override.password),
              };
            }
          }
        }
        saveServerState(loaded, true);
        return loaded;
      }
    }
  } catch (err) {
    console.error('Failed to read server state file, initializing fresh seed database:', err);
  }

  const initialDb = normalizeDbSections(createInitialSeedDatabase());
  initialDb.users = ensureUsersHashed(initialDb.users || SERVER_DEFAULT_USERS).users;

  const initial: ServerState = {
    db: initialDb,
    appsScriptUrl: DEFAULT_APPS_SCRIPT_URL,
    autoSyncEnabled: true,
    updatedAt: new Date().toISOString(),
    adminStudentOverrides: {},
    adminUserOverrides: {},
    deletedUsernames: [],
    classRenames: {},
  };
  saveServerState(initial, true);
  return initial;
}

let lastSavedDbSignature = '';

function computeDbSignature(db: NurseDatabase): string {
  return JSON.stringify({
    students: db.students,
    visits: db.visits,
    measurements: db.measurements,
    healthProfiles: db.healthProfiles,
    dispatches: db.dispatches || [],
    users: db.users || [],
    classes: db.classes || [],
    medicines: db.medicines || [],
    items: db.items || [],
    stockTransactions: db.stockTransactions || [],
    bills: db.bills || [],
    doctorVisits: db.doctorVisits || [],
    doctorVisitCases: db.doctorVisitCases || [],
    opdRecords: db.opdRecords || [],
    medicalCamps: db.medicalCamps || [],
    campScreenings: db.campScreenings || [],
    annualCheckups: db.annualCheckups || [],
    menstrualLogs: db.menstrualLogs || [],
    settings: db.settings || DEFAULT_INFIRMARY_SETTINGS,
  });
}

function saveServerState(state: ServerState, force: boolean = false): boolean {
  const sig = computeDbSignature(state.db);
  if (!force && sig === lastSavedDbSignature && fs.existsSync(STATE_FILE)) {
    return false;
  }
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    }
    state.updatedAt = new Date().toISOString();
    const encryptedEnvelope = encryptStateFileEnvelope(JSON.stringify(state));
    fs.writeFileSync(STATE_FILE, encryptedEnvelope, { encoding: 'utf-8', mode: 0o600 });
    try {
      fs.chmodSync(STATE_FILE, 0o600);
    } catch {
      // Ignore chmod on non-POSIX filesystems
    }
    lastSavedDbSignature = sig;
    return true;
  } catch (err) {
    console.error('Failed to persist server state:', err);
    return false;
  }
}

let serverState: ServerState = loadServerState();
lastSavedDbSignature = computeDbSignature(serverState.db);

// Track authenticated SSE clients with their role so non-admins NEVER receive staff passwords or Apps Script URL
interface SseClientEntry {
  res: express.Response;
  role: AuthRole;
  username: string;
}
const sseClients = new Set<SseClientEntry>();

function broadcastStateUpdate(sourceDeviceId: string = '') {
  const payloadCache = new Map<AuthRole, string>();
  const getPayloadForRole = (role: AuthRole): string => {
    const cached = payloadCache.get(role);
    if (cached) return cached;
    const safe = sanitizeStateForRole(serverState, role, DEFAULT_APPS_SCRIPT_URL);
    const serialized = JSON.stringify({
      type: 'state-update',
      sourceDeviceId,
      ...safe,
    });
    payloadCache.set(role, serialized);
    return serialized;
  };

  for (const client of sseClients) {
    try {
      client.res.write(`data: ${getPayloadForRole(client.role)}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 12000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function safeParseJsonObject(rawText: string): Record<string, unknown> | null {
  const trimmed = (rawText || '').trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function forwardToAppsScriptWithData(
  payload: Record<string, unknown>,
  timeoutMs: number = 15000
): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const url = serverState.appsScriptUrl.trim();
  if (!url) return { ok: false, data: null };
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
      },
      timeoutMs
    );
    if (!res.ok) return { ok: false, data: null };
    const rawText = await res.text();
    const data = safeParseJsonObject(rawText);
    if (!data) return { ok: false, data: null };
    if (data.status === 'error') {
      const msg = String(data.message || '');
      if (msg.toLowerCase().includes('duplicate')) {
        return { ok: true, data };
      }
      console.error('Google Apps Script error for action', payload.action, ':', msg);
      return { ok: false, data };
    }
    return { ok: true, data };
  } catch (err) {
    console.error('Background Google Sheets forward error:', err instanceof Error ? err.message : err);
    return { ok: false, data: null };
  }
}

async function forwardToAppsScript(payload: Record<string, unknown>): Promise<boolean> {
  const result = await forwardToAppsScriptWithData(payload, 12000);
  return result.ok;
}

async function pushMissingToAppsScript(remoteData: {
  students?: Array<Partial<StudentRecord>>;
  visits?: Array<Partial<VisitRecord>>;
  measurements?: Array<Partial<Record<keyof MeasurementRecord, string | number>>>;
  healthProfiles?: Array<Partial<HealthProfileRecord>>;
}): Promise<number> {
  const url = serverState.appsScriptUrl.trim();
  if (!url) return 0;

  let pushedCount = 0;

  const remoteVisitIds = new Set(
    (Array.isArray(remoteData.visits) ? remoteData.visits : [])
      .map((v) => String(v?.visit_id || '').trim())
      .filter(Boolean)
  );
  // Push visits in chronological order so older visits appear first in the sheet
  const missingVisits = [...serverState.db.visits]
    .filter((v) => v.visit_id && !remoteVisitIds.has(v.visit_id))
    .reverse();

  for (const visit of missingVisits) {
    const ok = await forwardToAppsScript({
      action: 'createVisit',
      visit,
    });
    if (ok) {
      remoteVisitIds.add(visit.visit_id);
      pushedCount++;
    }
  }

  const remoteMeasIds = new Set(
    (Array.isArray(remoteData.measurements) ? remoteData.measurements : [])
      .map((m) => String(m?.measurement_id || '').trim())
      .filter(Boolean)
  );
  const missingMeasurements = [...serverState.db.measurements]
    .filter((m) => m.measurement_id && !remoteMeasIds.has(m.measurement_id))
    .reverse();

  for (const measurement of missingMeasurements) {
    const ok = await forwardToAppsScript({
      action: 'addMeasurement',
      measurement,
    });
    if (ok) {
      remoteMeasIds.add(measurement.measurement_id);
      pushedCount++;
    }
  }

  const remoteProfileIds = new Set(
    (Array.isArray(remoteData.healthProfiles) ? remoteData.healthProfiles : [])
      .map((h) => String(h?.health_record_id || '').trim())
      .filter(Boolean)
  );
  const missingProfiles = [...serverState.db.healthProfiles]
    .filter((h) => h.health_record_id && !remoteProfileIds.has(h.health_record_id))
    .reverse();

  for (const healthProfile of missingProfiles) {
    const ok = await forwardToAppsScript({
      action: 'addHealthProfile',
      healthProfile,
    });
    if (ok) {
      remoteProfileIds.add(healthProfile.health_record_id);
      pushedCount++;
    }
  }

  return pushedCount;
}

let inFlightSyncPromise: Promise<{ ok: boolean; message: string }> | null = null;
let isPushingMissing = false;

async function pushMissingInBackground(remotePayload: {
  students?: Array<Partial<StudentRecord>>;
  visits?: Array<Partial<VisitRecord>>;
  measurements?: Array<Partial<Record<keyof MeasurementRecord, string | number>>>;
  healthProfiles?: Array<Partial<HealthProfileRecord>>;
}): Promise<void> {
  if (isPushingMissing) return;
  isPushingMissing = true;
  try {
    await pushMissingToAppsScript(remotePayload);
  } catch (err) {
    console.error('Background backfill error:', err instanceof Error ? err.message : err);
  } finally {
    isPushingMissing = false;
  }
}

let lastSheetsSyncAt: string | null = null;
let lastSheetsSyncMessage: string | null = null;

async function pullFromAppsScript(waitForPush: boolean = false): Promise<{ ok: boolean; message: string }> {
  const url = serverState.appsScriptUrl.trim();
  if (!url) {
    return { ok: false, message: 'No Google Apps Script URL configured yet.' };
  }
  if (inFlightSyncPromise) {
    return inFlightSyncPromise;
  }

  inFlightSyncPromise = (async () => {
    try {
      const separator = url.includes('?') ? '&' : '?';
      const response = await fetchWithTimeout(
        `${url}${separator}action=getAll&t=${Date.now()}`,
        {
          method: 'GET',
          redirect: 'follow',
        },
        12000
      );
      if (!response.ok) {
        return { ok: false, message: `Google Sheets returned status ${response.status}.` };
      }
      const rawText = await response.text();
      const data = safeParseJsonObject(rawText);
      if (!data || data.status !== 'ok') {
        return {
          ok: false,
          message: String(data?.message || 'Google Sheets returned an unexpected response.'),
        };
      }

      const rawRemotePayload = {
        students: data.students as Array<Partial<StudentRecord>>,
        visits: data.visits as Array<Partial<VisitRecord>>,
        measurements: data.measurements as Array<
          Partial<Record<keyof MeasurementRecord, string | number>>
        >,
        healthProfiles: data.healthProfiles as Array<Partial<HealthProfileRecord>>,
        users: data.users as Array<Record<string, unknown>>,
        medicines: data.medicines as Array<Partial<MedicineInventoryRecord>>,
        items: data.items as Array<Partial<ItemInventoryRecord>>,
        stockTransactions: data.stockTransactions as Array<Partial<StockTransactionRecord>>,
        bills: data.bills as Array<Partial<BillRecord>>,
        doctorVisits: data.doctorVisits as Array<Partial<DoctorVisitSession>>,
        doctorVisitCases: data.doctorVisitCases as Array<Partial<DoctorVisitCase>>,
        opdRecords: data.opdRecords as Array<Partial<OpdRecord>>,
        medicalCamps: data.medicalCamps as Array<Partial<MedicalCampRecord>>,
        campScreenings: data.campScreenings as Array<Partial<CampScreeningRecord>>,
        annualCheckups: data.annualCheckups as Array<Partial<AnnualCheckupRecord>>,
        menstrualLogs: data.menstrualLogs as Array<Partial<MenstrualLogRecord>>,
        settings: data.settings as
          | Partial<InfirmarySettings>
          | Array<{ setting_key?: string; setting_value?: string }>,
      };

      // Transparently decrypt any AES-256-GCM encrypted clinical fields from Google Sheets
      const remotePayload = {
        ...decryptRemoteSheetPayload(rawRemotePayload),
        medicines: rawRemotePayload.medicines,
        items: rawRemotePayload.items,
        stockTransactions: rawRemotePayload.stockTransactions,
        bills: rawRemotePayload.bills,
        doctorVisits: rawRemotePayload.doctorVisits,
        doctorVisitCases: rawRemotePayload.doctorVisitCases,
        opdRecords: rawRemotePayload.opdRecords,
        medicalCamps: rawRemotePayload.medicalCamps,
        campScreenings: rawRemotePayload.campScreenings,
        annualCheckups: rawRemotePayload.annualCheckups,
        menstrualLogs: rawRemotePayload.menstrualLogs,
        settings: rawRemotePayload.settings,
      };

      const previousUsers = serverState.db.users || [];
      const mergedFromRemote = normalizeSheetSyncPayload(remotePayload, serverState.db);
      const nextDb = normalizeDbSections(applyAdminOverridesToDb(mergedFromRemote, serverState));
      nextDb.users = mergePreservingHashedPasswords(nextDb.users || [], previousUsers);
      serverState.db = nextDb;
      const changed = saveServerState(serverState);
      if (changed) {
        broadcastStateUpdate('sheets-sync');
      }

      // Push any local records missing from the Sheet without blocking UI sync checks
      if (waitForPush) {
        await pushMissingInBackground(remotePayload);
      } else {
        void pushMissingInBackground(remotePayload);
      }

      const successMsg = `Synced with Google Sheets (${serverState.db.students.length} students, ${serverState.db.visits.length} visits).`;
      lastSheetsSyncAt = new Date().toISOString();
      lastSheetsSyncMessage = successMsg;

      return {
        ok: true,
        message: successMsg,
      };
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? 'Google Sheets sync timed out; shared school records remain active.'
          : err instanceof Error
            ? err.message
            : 'Could not reach Google Sheets.';
      lastSheetsSyncAt = new Date().toISOString();
      lastSheetsSyncMessage = msg;
      return {
        ok: false,
        message: msg,
      };
    } finally {
      inFlightSyncPromise = null;
    }
  })();

  return inFlightSyncPromise;
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  // Global defense-in-depth HTTP security headers (iframe-compatible CSP + HSTS on HTTPS)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
    );
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
    );
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  });

  app.use(express.json({ limit: '6mb' }));

  // Global API defense layer: rate limiting, CSRF Origin check, prototype pollution & control-char guard
  app.use('/api', (req, res, next) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const apiLimit = checkApiRateLimit(`api:${clientIp}`);
    if (!apiLimit.allowed) {
      res.setHeader('Retry-After', String(apiLimit.retryAfterSeconds));
      recordSecurityEvent('rate_limited', 'anonymous', `API rate limit exceeded on ${req.path}`, clientIp);
      return res.status(429).json({
        status: 'error',
        message: 'Too many requests. Please wait a moment and try again.',
      });
    }

    // Strict same-origin check on state-changing requests (proxy-aware: honors Host & X-Forwarded-Host)
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      const origin = req.headers.origin;
      if (origin) {
        const candidateHosts = new Set<string>();
        const addHostCandidate = (rawVal?: string | string[]) => {
          if (!rawVal) return;
          const rawStr = Array.isArray(rawVal) ? rawVal.join(',') : rawVal;
          for (const part of rawStr.split(',')) {
            const cleaned = part.trim().toLowerCase();
            if (cleaned) {
              candidateHosts.add(cleaned);
              const hostOnly = cleaned.replace(/:\d+$/, '');
              if (hostOnly) candidateHosts.add(hostOnly);
            }
          }
        };
        addHostCandidate(req.headers.host);
        addHostCandidate(req.headers['x-forwarded-host']);
        addHostCandidate(req.hostname);

        if (candidateHosts.size > 0) {
          try {
            const parsedOrigin = new URL(origin);
            const originHost = parsedOrigin.host.toLowerCase();
            const originHostname = parsedOrigin.hostname.toLowerCase();
            if (!candidateHosts.has(originHost) && !candidateHosts.has(originHostname)) {
              return res.status(403).json({
                status: 'error',
                message: 'Cross-origin request blocked.',
              });
            }
          } catch {
            return res.status(403).json({ status: 'error', message: 'Invalid origin header.' });
          }
        }
      }
    }

    if (req.body && (hasForbiddenPrototypeKeys(req.body) || hasDangerousControlChars(req.body))) {
      return res.status(400).json({ status: 'error', message: 'Invalid request payload.' });
    }
    next();
  });

  type AuthedRequest = express.Request & { authUser?: AuthUser; authToken?: string };

  const extractBearerToken = (req: express.Request): string | null => {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    return null;
  };

  const requireAuth = (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
    const token = extractBearerToken(req);
    const ua = req.headers['user-agent'] || '';
    const session = getSessionByToken(token, ua);
    if (!session) {
      // Detect if token itself was valid but User-Agent didn't match (possible token theft)
      if (token && getSessionByToken(token, undefined)) {
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        recordSecurityEvent(
          'session_hijack_blocked',
          'unknown',
          `Token replay blocked due to mismatched client fingerprint on ${req.path}`,
          clientIp
        );
      }
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required. Please log in again.',
      });
    }
    req.authUser = session.user;
    req.authToken = token || undefined;
    next();
  };

  const requireAdmin = (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
    if (!req.authUser || req.authUser.role !== 'admin') {
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      recordSecurityEvent(
        'rbac_blocked',
        req.authUser?.username || 'anonymous',
        `Non-admin attempted ${req.method} ${req.path}`,
        clientIp
      );
      return res.status(403).json({
        status: 'error',
        message: 'Administrator privileges are required for this action.',
      });
    }
    next();
  };

  // Minimal health check (contains zero school or student data)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // 0. Server-side login with salted scrypt KDF, brute-force rate limiting & UA-bound cryptographic sessions
  app.post('/api/auth/login', async (req, res) => {
    const body = req.body || {};
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    const ipKey = `ip:${clientIp}:${username || 'unknown'}`;
    const userKey = username ? `user:${username}` : '';

    const ipLimit = checkLoginRateLimit(ipKey);
    if (!ipLimit.allowed) {
      recordSecurityEvent('login_lockout', username || 'anonymous', 'IP login lockout active', clientIp);
      return res.status(429).json({
        status: 'error',
        message: `Too many failed login attempts. Please try again in ${ipLimit.retryAfterSeconds} seconds.`,
        retryAfterSeconds: ipLimit.retryAfterSeconds,
      });
    }
    if (userKey) {
      const userLimit = checkLoginRateLimit(userKey);
      if (!userLimit.allowed) {
        recordSecurityEvent('login_lockout', username, 'Account login lockout active', clientIp);
        return res.status(429).json({
          status: 'error',
          message: `This account is temporarily locked due to failed attempts. Try again in ${userLimit.retryAfterSeconds} seconds.`,
          retryAfterSeconds: userLimit.retryAfterSeconds,
        });
      }
    }

    const authResult = authenticateServerUserWithMeta(username, password, serverState.db.users);
    if (!authResult) {
      recordFailedLogin(ipKey);
      if (userKey) recordFailedLogin(userKey);
      recordSecurityEvent('login_failed', username || 'anonymous', 'Invalid credentials submitted', clientIp);
      // Uniform slight delay to slow down automated credential stuffing
      await new Promise((resolve) => setTimeout(resolve, 250));
      return res.status(401).json({
        status: 'error',
        message: 'Incorrect username or password. Please try again.',
      });
    }

    const { user, needsRehash } = authResult;

    // Transparently upgrade any legacy plaintext password to a salted scrypt hash
    if (needsRehash) {
      const hashed = hashPassword(password);
      serverState.db.users = (serverState.db.users || []).map((u) =>
        u.username.toLowerCase() === user.username.toLowerCase()
          ? { ...u, password: hashed, updated_at: new Date().toISOString() }
          : u
      );
      const updatedUser = serverState.db.users.find(
        (u) => u.username.toLowerCase() === user.username.toLowerCase()
      );
      if (updatedUser) {
        serverState.adminUserOverrides = {
          ...(serverState.adminUserOverrides || {}),
          [updatedUser.username.toLowerCase()]: updatedUser,
        };
        saveServerState(serverState, true);
        void forwardToAppsScript({ action: 'upsertUser', user: updatedUser });
        recordSecurityEvent('password_rehashed', user.username, 'Upgraded legacy password to scrypt hash', clientIp);
      }
    }

    clearLoginFailures(ipKey);
    if (userKey) clearLoginFailures(userKey);

    const { token, expiresAt } = createSession(user, userAgent);
    const safeState = sanitizeStateForRole(serverState, user.role, DEFAULT_APPS_SCRIPT_URL);
    recordSecurityEvent('login_success', user.username, `Authenticated as ${user.role}`, clientIp);

    return res.json({
      status: 'ok',
      token,
      expiresAt,
      user,
      ...safeState,
      ...(user.role === 'admin'
        ? { lastSheetsSyncAt, lastSheetsSyncMessage }
        : {}),
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = extractBearerToken(req);
    const session = getSessionByToken(token, undefined);
    revokeSession(token);
    if (session) {
      recordSecurityEvent('logout', session.user.username, 'Session revoked on sign-out', req.ip);
    }
    res.json({ status: 'ok' });
  });

  // Issues a short-lived (30s) single-use UA-bound ticket for SSE EventSource so session tokens never appear in URLs
  app.post('/api/auth/stream-ticket', requireAuth, (req: AuthedRequest, res) => {
    const ticket = createStreamTicket(req.authUser!, req.headers['user-agent'] || '');
    res.json({ status: 'ok', ticket });
  });

  // Admin-only live cryptographic & security posture overview
  app.get('/api/security/status', requireAuth, requireAdmin, (_req: AuthedRequest, res) => {
    const users = serverState.db.users || [];
    const hashedUsersCount = users.filter((u) => isPasswordHash(u.password)).length;
    res.json({
      status: 'ok',
      crypto: getCryptoPosture(),
      activeSessions: getActiveSessionCount(),
      hashedUsersCount,
      totalUsersCount: users.length,
      appsScriptEncryption: false,
      recentEvents: getRecentSecurityEvents().slice(0, 20),
    });
  });

  // 1. Get shared school state (STRICTLY authenticated & role-sanitized)
  app.get('/api/state', requireAuth, (req: AuthedRequest, res) => {
    const safeState = sanitizeStateForRole(serverState, req.authUser!.role, DEFAULT_APPS_SCRIPT_URL);
    res.json({
      status: 'ok',
      ...safeState,
      ...(req.authUser!.role === 'admin'
        ? { lastSheetsSyncAt, lastSheetsSyncMessage }
        : {}),
      connectedDevices: sseClients.size,
    });
  });

  // 2. Real-time Server-Sent Events (SSE) stream (STRICTLY authenticated via single-use UA-bound ticket)
  app.get('/api/stream', (req, res) => {
    const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
    const ua = req.headers['user-agent'] || '';
    let user = consumeStreamTicket(ticket, ua);
    if (!user) {
      const bearer = extractBearerToken(req);
      user = getSessionByToken(bearer, ua)?.user || null;
    }
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized stream connection.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const entry: SseClientEntry = {
      res,
      role: user.role,
      username: user.username,
    };
    sseClients.add(entry);

    // Send initial connected event
    res.write(
      `data: ${JSON.stringify({
        type: 'connected',
        connectedDevices: sseClients.size,
        updatedAt: serverState.updatedAt,
      })}\n\n`
    );

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(entry);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(entry);
    });
  });

  // 3. Apply idempotent mutations from any authenticated school device with strict server-side RBAC
  app.post('/api/mutate', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const body = req.body || {};
      const action = String(body.action || '');
      const deviceId = String(body.deviceId || '');
      const role = req.authUser!.role;

      if (!isMutationAllowedForRole(action, role, body)) {
        recordSecurityEvent(
          'rbac_blocked',
          req.authUser!.username,
          `Blocked ${role} mutation: ${action}`,
          req.ip
        );
        return res.status(403).json({
          status: 'error',
          message: 'You do not have permission to perform this action.',
        });
      }

      const safeDb = () => sanitizeDbForRole(serverState.db, role);

      if ((action === 'recordVisit' || action === 'createVisit') && body.visit) {
        const rawVisit = body.visit as VisitRecord;
        const matched = serverState.db.students.find((s) => s.student_id === rawVisit.student_id);
        const stuName = rawVisit.student_name || matched?.full_name || '';
        const stuSec = normalizeSectionName(rawVisit.section || rawVisit.class || matched?.section || '');
        const rawR = String(rawVisit.roll_no || rawVisit.roll_number || matched?.roll_number || '').trim();
        const stuR = /^\d+$/.test(rawR) ? rawR.padStart(2, '0') : rawR;
        const normalizedDt = normalizeDatetimeString(rawVisit.visit_datetime);
        const shiftOverridden = Boolean(rawVisit.shift_overridden);
        const shiftPeriod =
          shiftOverridden && (rawVisit.shift_period === 'school_hours' || rawVisit.shift_period === 'night')
            ? rawVisit.shift_period
            : classifyVisitShift(normalizedDt, serverState.db.settings);

        const medQty =
          rawVisit.medicine_status === 'given' && rawVisit.medicine_id
            ? Math.max(0, Number(rawVisit.medicine_qty) || 0)
            : 0;
        const itemQty = rawVisit.item_id ? Math.max(0, Number(rawVisit.item_qty) || 0) : 0;

        const visit: VisitRecord = {
          ...rawVisit,
          student_name: stuName,
          section: stuSec,
          class: stuSec,
          roll_number: stuR,
          roll_no: stuR,
          visit_datetime: normalizedDt,
          shift_period: shiftPeriod,
          shift_overridden: shiftOverridden,
          medicine_id: rawVisit.medicine_status === 'given' && rawVisit.medicine_id ? String(rawVisit.medicine_id).trim() : undefined,
          medicine_qty: medQty > 0 ? medQty : undefined,
          item_id: rawVisit.item_id ? String(rawVisit.item_id).trim() : undefined,
          item_name: rawVisit.item_name ? String(rawVisit.item_name).trim() : undefined,
          item_qty: itemQty > 0 ? itemQty : undefined,
          dosage: normalizeDosageString(rawVisit.dosage),
          administration_time: normalizeTimeOnlyString(rawVisit.administration_time),
        };
        const exists = serverState.db.visits.some((v) => v.visit_id === visit.visit_id);
        const generatedTxns: StockTransactionRecord[] = [];
        let updatedMedForSheet: MedicineInventoryRecord | null = null;
        let updatedItemForSheet: ItemInventoryRecord | null = null;

        if (!exists) {
          const nowIso = new Date().toISOString();
          serverState.db.visits = [visit, ...serverState.db.visits];

          // Atomic stock deduction for dispensed medicine from Medicines Inventory
          if (visit.medicine_id && medQty > 0) {
            const meds = serverState.db.medicines || [];
            const medIdx = meds.findIndex((m) => m.medicine_id === visit.medicine_id);
            if (medIdx !== -1) {
              const prevMed = meds[medIdx];
              const nextStock = Math.max(0, Number((prevMed.current_stock - medQty).toFixed(2)));
              const updatedMed: MedicineInventoryRecord = {
                ...prevMed,
                current_stock: nextStock,
                updated_at: nowIso,
              };
              serverState.db.medicines = meds.map((m, idx) => (idx === medIdx ? updatedMed : m));
              updatedMedForSheet = updatedMed;
              const txnId = generatePermanentId('TXN', [
                ...(serverState.db.stockTransactions || []).map((t) => t.txn_id),
                ...generatedTxns.map((t) => t.txn_id),
              ]);
              generatedTxns.push({
                txn_id: txnId,
                target_type: 'medicine',
                target_id: prevMed.medicine_id,
                target_name: prevMed.name,
                change_qty: -medQty,
                balance_after: nextStock,
                reason: 'visit',
                reference_id: visit.visit_id,
                notes: `Dispensed to ${stuName || visit.student_id}`,
                recorded_by: visit.recorded_by || req.authUser!.displayName,
                created_at: nowIso,
              });
            }
          }

          // Atomic stock deduction for infirmary item used during visit
          if (visit.item_id && itemQty > 0) {
            const items = serverState.db.items || [];
            const itemIdx = items.findIndex((it) => it.item_id === visit.item_id);
            if (itemIdx !== -1) {
              const prevItem = items[itemIdx];
              const nextStock = Math.max(0, Number((prevItem.current_stock - itemQty).toFixed(2)));
              const updatedItem: ItemInventoryRecord = {
                ...prevItem,
                current_stock: nextStock,
                updated_at: nowIso,
              };
              serverState.db.items = items.map((it, idx) => (idx === itemIdx ? updatedItem : it));
              updatedItemForSheet = updatedItem;
              if (!visit.item_name) visit.item_name = prevItem.name;
              const txnId = generatePermanentId('TXN', [
                ...(serverState.db.stockTransactions || []).map((t) => t.txn_id),
                ...generatedTxns.map((t) => t.txn_id),
              ]);
              generatedTxns.push({
                txn_id: txnId,
                target_type: 'item',
                target_id: prevItem.item_id,
                target_name: prevItem.name,
                change_qty: -itemQty,
                balance_after: nextStock,
                reason: 'visit',
                reference_id: visit.visit_id,
                notes: `Used for ${stuName || visit.student_id}`,
                recorded_by: visit.recorded_by || req.authUser!.displayName,
                created_at: nowIso,
              });
            }
          }

          if (generatedTxns.length > 0) {
            serverState.db.stockTransactions = [
              ...generatedTxns,
              ...(serverState.db.stockTransactions || []),
            ];
          }

          saveServerState(serverState, true);
          broadcastStateUpdate(deviceId);
        }

        // Prefix slash/hyphen/leading-zero text values with ' so Google Sheets stores them as literal Plain Text (never auto-parsed as Dates)
        const protectSheetText = (val: string | undefined): string => {
          const clean = String(val || '').trim();
          if (!clean) return '';
          if (/[/\-]/.test(clean) || /^0\d+$/.test(clean)) {
            return `'${clean}`;
          }
          return clean;
        };

        const sheetSynced = await forwardToAppsScript({
          action: 'createVisit',
          visit: {
            ...visit,
            dosage: protectSheetText(visit.dosage),
            student_name: stuName,
            full_name: stuName,
            class: stuSec,
            section: stuSec,
            roll_no: protectSheetText(stuR),
            roll_number: protectSheetText(stuR),
          },
        });
        if (updatedMedForSheet) {
          void forwardToAppsScript({ action: 'upsertMedicine', medicine: updatedMedForSheet });
        }
        if (updatedItemForSheet) {
          void forwardToAppsScript({ action: 'upsertItem', item: updatedItemForSheet });
        }
        for (const txn of generatedTxns) {
          void forwardToAppsScript({ action: 'addStockTransaction', transaction: txn });
        }

        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'createStudent' && body.student) {
        const rawStudent = body.student as StudentRecord;
        const cleanSection = sanitizeClassSectionName(rawStudent.section) || normalizeSectionName(rawStudent.section);
        const rawRoll = String(rawStudent.roll_number || '').trim();
        const student: StudentRecord = {
          ...rawStudent,
          full_name: String(rawStudent.full_name || '').trim(),
          section: cleanSection,
          roll_number: /^\d+$/.test(rawRoll) ? rawRoll.padStart(2, '0') : rawRoll,
          active_status: rawStudent.active_status === 'Inactive' ? 'Inactive' : 'Active',
        };
        const exists = serverState.db.students.some((s) => s.student_id === student.student_id);
        if (!exists) {
          serverState.db.students = [...serverState.db.students, student];
          serverState.db.classes = getAllClassSections(serverState.db.students, [
            ...(serverState.db.classes || []),
            student.section,
          ]);
          serverState.adminStudentOverrides = {
            ...(serverState.adminStudentOverrides || {}),
            [student.student_id]: student,
          };
          saveServerState(serverState, true);
          broadcastStateUpdate(deviceId);
        }
        const sheetSynced = await forwardToAppsScript({ action: 'createStudent', student });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'updateStudent' && body.student && body.student.student_id) {
        const rawStudent = body.student as StudentRecord;
        const cleanSection = sanitizeClassSectionName(rawStudent.section) || normalizeSectionName(rawStudent.section);
        const rawRoll = String(rawStudent.roll_number || '').trim();
        const updatedStudent: StudentRecord = {
          ...rawStudent,
          full_name: String(rawStudent.full_name || '').trim(),
          section: cleanSection,
          roll_number: /^\d+$/.test(rawRoll) ? rawRoll.padStart(2, '0') : rawRoll,
          active_status: rawStudent.active_status === 'Inactive' ? 'Inactive' : 'Active',
          updated_at: new Date().toISOString(),
        };
        const exists = serverState.db.students.some((s) => s.student_id === updatedStudent.student_id);
        if (exists) {
          serverState.db.students = serverState.db.students.map((s) =>
            s.student_id === updatedStudent.student_id ? { ...s, ...updatedStudent } : s
          );
        } else {
          serverState.db.students = [...serverState.db.students, updatedStudent];
        }
        serverState.db.visits = serverState.db.visits.map((v) =>
          v.student_id === updatedStudent.student_id
            ? {
                ...v,
                student_name: updatedStudent.full_name,
                section: updatedStudent.section,
                class: updatedStudent.section,
                roll_number: updatedStudent.roll_number,
                roll_no: updatedStudent.roll_number,
              }
            : v
        );
        serverState.db.dispatches = (serverState.db.dispatches || []).map((d) =>
          d.student_id === updatedStudent.student_id
            ? {
                ...d,
                student_name: updatedStudent.full_name,
                section: updatedStudent.section,
                roll_number: updatedStudent.roll_number,
              }
            : d
        );
        serverState.db.doctorVisitCases = (serverState.db.doctorVisitCases || []).map((c) =>
          c.student_id === updatedStudent.student_id
            ? {
                ...c,
                student_name: updatedStudent.full_name,
                section: updatedStudent.section,
                roll_number: updatedStudent.roll_number,
              }
            : c
        );
        serverState.db.opdRecords = (serverState.db.opdRecords || []).map((o) =>
          o.student_id === updatedStudent.student_id
            ? {
                ...o,
                student_name: updatedStudent.full_name,
                section: updatedStudent.section,
                roll_number: updatedStudent.roll_number,
              }
            : o
        );
        serverState.db.campScreenings = (serverState.db.campScreenings || []).map((sc) =>
          sc.student_id === updatedStudent.student_id
            ? {
                ...sc,
                student_name: updatedStudent.full_name,
                section: updatedStudent.section,
                roll_number: updatedStudent.roll_number,
              }
            : sc
        );
        serverState.db.annualCheckups = (serverState.db.annualCheckups || []).map((chk) =>
          chk.student_id === updatedStudent.student_id
            ? {
                ...chk,
                student_name: updatedStudent.full_name,
                section: updatedStudent.section,
                roll_number: updatedStudent.roll_number,
              }
            : chk
        );
        serverState.db.menstrualLogs = (serverState.db.menstrualLogs || []).map((m) =>
          m.student_id === updatedStudent.student_id
            ? {
                ...m,
                student_name: updatedStudent.full_name,
                section: updatedStudent.section,
                roll_number: updatedStudent.roll_number,
              }
            : m
        );
        serverState.db.classes = getAllClassSections(serverState.db.students, [
          ...(serverState.db.classes || []),
          updatedStudent.section,
        ]);
        serverState.adminStudentOverrides = {
          ...(serverState.adminStudentOverrides || {}),
          [updatedStudent.student_id]: updatedStudent,
        };
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({
          action: 'updateStudent',
          student: updatedStudent,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'bulkImportStudents' && Array.isArray(body.students)) {
        const incoming = (body.students as StudentRecord[]).map((s) => ({
          ...s,
          section: normalizeSectionName(s.section),
        }));
        const replaceAll = Boolean(body.replaceAll);
        let newlyAdded: StudentRecord[] = [];
        if (replaceAll) {
          newlyAdded = incoming;
          serverState.db.students = incoming;
        } else {
          const existingIds = new Set(serverState.db.students.map((s) => s.student_id));
          newlyAdded = incoming.filter((s) => !existingIds.has(s.student_id));
          serverState.db.students = [...serverState.db.students, ...newlyAdded];
        }
        serverState.db.classes = getAllClassSections(serverState.db.students, serverState.db.classes);
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        if (newlyAdded.length > 0) {
          void (async () => {
            for (const student of newlyAdded) {
              await forwardToAppsScript({ action: 'createStudent', student });
            }
          })();
        }
        return res.json({ status: 'ok', db: safeDb(), updatedAt: serverState.updatedAt });
      }

      if (action === 'addMeasurement' && body.measurement) {
        const rawMeas = body.measurement as MeasurementRecord;
        const measurement: MeasurementRecord = {
          ...rawMeas,
          measurement_date: normalizeDateOnlyString(rawMeas.measurement_date),
        };
        const exists = serverState.db.measurements.some(
          (m) => m.measurement_id === measurement.measurement_id
        );
        if (!exists) {
          serverState.db.measurements = [measurement, ...serverState.db.measurements];
          saveServerState(serverState, true);
          broadcastStateUpdate(deviceId);
        }
        const sheetSynced = await forwardToAppsScript({
          action: 'addMeasurement',
          measurement,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'addHealthProfile' && body.healthProfile) {
        const rawProfile = body.healthProfile as HealthProfileRecord;
        const healthProfile: HealthProfileRecord = {
          ...rawProfile,
          date_recorded: normalizeDateOnlyString(rawProfile.date_recorded),
          last_reviewed: normalizeDateOnlyString(rawProfile.last_reviewed),
        };
        const exists = serverState.db.healthProfiles.some(
          (h) => h.health_record_id === healthProfile.health_record_id
        );
        if (!exists) {
          serverState.db.healthProfiles = [healthProfile, ...serverState.db.healthProfiles];
          saveServerState(serverState, true);
          broadcastStateUpdate(deviceId);
        }
        const sheetSynced = await forwardToAppsScript({
          action: 'addHealthProfile',
          healthProfile,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'dispatchStudent' && body.dispatch && body.dispatch.dispatch_id) {
        const dispatch = {
          ...body.dispatch,
          // Server-enforced attribution so staff identity cannot be forged
          dispatched_by: req.authUser!.displayName || body.dispatch.dispatched_by || 'Hostel Warden',
        };
        const current = serverState.db.dispatches || [];
        const exists = current.some((d) => d.dispatch_id === dispatch.dispatch_id);
        if (!exists) {
          serverState.db.dispatches = [dispatch, ...current];
          saveServerState(serverState, true);
          broadcastStateUpdate(deviceId);
        }
        return res.json({
          status: 'ok',
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'updateDispatchStatus' && body.dispatch_id && body.status) {
        const current = serverState.db.dispatches || [];
        serverState.db.dispatches = current.map((d) =>
          d.dispatch_id === body.dispatch_id
            ? {
                ...d,
                status: body.status,
                acknowledged_at: body.acknowledged_at || d.acknowledged_at || new Date().toISOString(),
              }
            : d
        );
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        return res.json({
          status: 'ok',
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'createClass' && body.className) {
        const cleanName = sanitizeClassSectionName(String(body.className));
        if (!cleanName) {
          return res.status(400).json({
            status: 'error',
            message: 'Please enter a valid section name without grade numbers.',
          });
        }
        serverState.db.classes = getAllClassSections(serverState.db.students, [
          ...(serverState.db.classes || []),
          cleanName,
        ]);
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        return res.json({
          status: 'ok',
          className: cleanName,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'renameClass' && body.oldName && body.newName) {
        const oldName = String(body.oldName).trim();
        const newName = sanitizeClassSectionName(String(body.newName));
        if (!newName) {
          return res.status(400).json({
            status: 'error',
            message: 'Please enter a valid section name without grade numbers.',
          });
        }
        const oldLower = oldName.toLowerCase();
        const nowIso = new Date().toISOString();
        const updatedOverrides = { ...(serverState.adminStudentOverrides || {}) };
        serverState.db.students = serverState.db.students.map((s) => {
          if (s.section.toLowerCase() === oldLower) {
            const updated = { ...s, section: newName, updated_at: nowIso };
            updatedOverrides[s.student_id] = updated;
            return updated;
          }
          return s;
        });
        serverState.adminStudentOverrides = updatedOverrides;
        serverState.db.visits = serverState.db.visits.map((v) =>
          (v.section || v.class || '').toLowerCase() === oldLower
            ? { ...v, section: newName, class: newName }
            : v
        );
        serverState.db.dispatches = (serverState.db.dispatches || []).map((d) =>
          d.section.toLowerCase() === oldLower ? { ...d, section: newName } : d
        );
        const existingClasses = (serverState.db.classes || []).map((c) =>
          c.toLowerCase() === oldLower ? newName : c
        );
        serverState.db.classes = getAllClassSections(serverState.db.students, [
          ...existingClasses,
          newName,
        ]);
        if (oldLower !== newName.toLowerCase()) {
          serverState.classRenames = {
            ...(serverState.classRenames || {}),
            [oldLower]: newName,
          };
        }
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        void forwardToAppsScript({ action: 'renameClass', oldName, newName });
        return res.json({
          status: 'ok',
          oldName,
          newName,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'deleteClass' && body.className) {
        const targetLower = String(body.className).trim().toLowerCase();
        const hasStudents = serverState.db.students.some(
          (s) => s.section.toLowerCase() === targetLower
        );
        if (hasStudents) {
          return res.status(400).json({
            status: 'error',
            message: 'Move or reassign students out of this class before deleting it.',
          });
        }
        serverState.db.classes = (serverState.db.classes || []).filter(
          (c) => c.toLowerCase() !== targetLower
        );
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        return res.json({
          status: 'ok',
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'upsertUser' && body.user) {
        const raw = body.user as Partial<AppUserRecord>;
        const username = String(raw.username || '').trim().toLowerCase();
        const rawPassword = String(raw.password || '').trim();
        if (!username || !isValidStaffUsername(username)) {
          return res.status(400).json({
            status: 'error',
            message: 'User ID must be 2–40 characters (letters, numbers, dot, hyphen, underscore).',
          });
        }
        const currentUsers = serverState.db.users || [];
        const existingUser = currentUsers.find((u) => u.username.toLowerCase() === username);

        // Allow Admin to edit role/display name/status without re-typing password; require strong password for new accounts or resets
        let storedPasswordHash = '';
        let passwordChanged = false;
        if (rawPassword) {
          if (rawPassword.length < 6 || rawPassword.length > 128) {
            return res.status(400).json({
              status: 'error',
              message: 'Password must be between 6 and 128 characters.',
            });
          }
          storedPasswordHash = hashPassword(rawPassword);
          passwordChanged = true;
        } else if (existingUser && existingUser.password) {
          storedPasswordHash = isPasswordHash(existingUser.password)
            ? existingUser.password
            : hashPassword(existingUser.password);
        } else {
          return res.status(400).json({
            status: 'error',
            message: 'A password (at least 6 characters) is required for a new user account.',
          });
        }

        const role: 'admin' | 'nurse' | 'warden' =
          raw.role === 'admin' ? 'admin' : raw.role === 'nurse' ? 'nurse' : 'warden';
        const userRecord: AppUserRecord = {
          username,
          password: storedPasswordHash,
          role,
          display_name:
            String(raw.display_name || '').trim().slice(0, 80) ||
            (role === 'admin'
              ? 'Infirmary Administrator'
              : role === 'nurse'
                ? 'School Nurse'
                : `${username} (Hostel Warden)`),
          badge_title:
            String(raw.badge_title || '').trim().slice(0, 60) ||
            (role === 'admin'
              ? 'System Admin'
              : role === 'nurse'
                ? 'Infirmary Nurse'
                : 'Hostel Warden'),
          active_status: raw.active_status === 'Inactive' ? 'Inactive' : 'Active',
          updated_at: new Date().toISOString(),
        };

        serverState.db.users = existingUser
          ? currentUsers.map((u) => (u.username.toLowerCase() === username ? userRecord : u))
          : [...currentUsers, userRecord];
        serverState.deletedUsernames = (serverState.deletedUsernames || []).filter(
          (u) => u.toLowerCase() !== username
        );
        serverState.adminUserOverrides = {
          ...(serverState.adminUserOverrides || {}),
          [username]: userRecord,
        };
        saveServerState(serverState, true);

        // Revoke active sessions if password, role, or account status changed (except self password edit keeps current session only if active admin)
        const roleChanged = Boolean(existingUser && existingUser.role !== role);
        if (
          userRecord.active_status === 'Inactive' ||
          roleChanged ||
          (passwordChanged && username !== req.authUser!.username.toLowerCase())
        ) {
          revokeSessionsForUsername(username);
        }
        recordSecurityEvent(
          'user_updated',
          req.authUser!.username,
          `${existingUser ? 'Updated' : 'Created'} account "${username}" (${role})${passwordChanged ? ' + hashed password' : ''}`,
          req.ip
        );
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({ action: 'upsertUser', user: userRecord });
        return res.json({
          status: 'ok',
          sheetSynced,
          user: { ...userRecord, password: '' },
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'deleteUser' && body.username) {
        const target = String(body.username).trim().toLowerCase();
        if (target === req.authUser!.username.toLowerCase()) {
          return res.status(400).json({
            status: 'error',
            message: 'You cannot delete the currently signed-in admin account.',
          });
        }
        serverState.db.users = (serverState.db.users || []).filter(
          (u) => u.username.toLowerCase() !== target
        );
        const nextOverrides = { ...(serverState.adminUserOverrides || {}) };
        delete nextOverrides[target];
        serverState.adminUserOverrides = nextOverrides;
        const deletedSet = new Set((serverState.deletedUsernames || []).map((u) => u.toLowerCase()));
        deletedSet.add(target);
        serverState.deletedUsernames = Array.from(deletedSet);
        revokeSessionsForUsername(target);
        recordSecurityEvent('user_deleted', req.authUser!.username, `Deleted account "${target}"`, req.ip);
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({ action: 'deleteUser', username: target });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'updateSchoolHours') {
        const start = normalizeHHMM(body.school_hours_start, '');
        const end = normalizeHHMM(body.school_hours_end, '');
        if (!start || !end) {
          return res.status(400).json({
            status: 'error',
            message: 'Please provide valid 24-hour times (HH:MM) for school hours start and end.',
          });
        }
        const nextSettings: InfirmarySettings = {
          school_hours_start: start,
          school_hours_end: end,
          updated_at: new Date().toISOString(),
        };
        serverState.db.settings = nextSettings;
        // Reclassify non-overridden visits using the updated school timing window
        serverState.db.visits = (serverState.db.visits || []).map((v) =>
          v.shift_overridden
            ? v
            : { ...v, shift_period: classifyVisitShift(v.visit_datetime, nextSettings) }
        );
        saveServerState(serverState, true);
        recordSecurityEvent(
          'config_changed',
          req.authUser!.username,
          `Updated School Hours window to ${start}–${end}`,
          req.ip
        );
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({
          action: 'updateSettings',
          settings: nextSettings,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          settings: nextSettings,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'upsertMedicine' && body.medicine) {
        const raw = body.medicine as Partial<MedicineInventoryRecord>;
        const name = String(raw.name || '').trim().slice(0, 120);
        if (!name) {
          return res.status(400).json({ status: 'error', message: 'Medicine name is required.' });
        }
        const nowIso = new Date().toISOString();
        const existingList = serverState.db.medicines || [];
        const medId =
          String(raw.medicine_id || '').trim() ||
          generatePermanentId('MED', existingList.map((m) => m.medicine_id));
        const existingMed = existingList.find((m) => m.medicine_id === medId);
        const record: MedicineInventoryRecord = {
          medicine_id: medId,
          name,
          category: String(raw.category || 'General').trim().slice(0, 60) || 'General',
          form_strength: String(raw.form_strength || '').trim().slice(0, 80),
          unit: String(raw.unit || 'tablets').trim().slice(0, 30) || 'tablets',
          batch_number: String(raw.batch_number || '').trim().slice(0, 50),
          expiry_date: raw.expiry_date ? normalizeDateOnlyString(String(raw.expiry_date), '') : '',
          current_stock: Math.max(0, Number(raw.current_stock) || 0),
          min_stock_alert: Math.max(0, Number(raw.min_stock_alert) || 0),
          notes: String(raw.notes || '').trim().slice(0, 240) || undefined,
          updated_at: nowIso,
        };
        serverState.db.medicines = existingMed
          ? existingList.map((m) => (m.medicine_id === medId ? record : m))
          : [record, ...existingList];

        let openingTxn: StockTransactionRecord | null = null;
        if (!existingMed && record.current_stock > 0) {
          const txnId = generatePermanentId(
            'TXN',
            (serverState.db.stockTransactions || []).map((t) => t.txn_id)
          );
          openingTxn = {
            txn_id: txnId,
            target_type: 'medicine',
            target_id: record.medicine_id,
            target_name: record.name,
            change_qty: record.current_stock,
            balance_after: record.current_stock,
            reason: 'adjustment',
            notes: 'Opening stock',
            recorded_by: req.authUser!.displayName,
            created_at: nowIso,
          };
          serverState.db.stockTransactions = [
            openingTxn,
            ...(serverState.db.stockTransactions || []),
          ];
        }
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({ action: 'upsertMedicine', medicine: record });
        if (openingTxn) {
          void forwardToAppsScript({ action: 'addStockTransaction', transaction: openingTxn });
        }
        return res.json({
          status: 'ok',
          sheetSynced,
          medicine: record,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'deleteMedicine' && body.medicine_id) {
        const medId = String(body.medicine_id).trim();
        serverState.db.medicines = (serverState.db.medicines || []).filter(
          (m) => m.medicine_id !== medId
        );
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({ action: 'deleteMedicine', medicine_id: medId });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'upsertItem' && body.item) {
        const raw = body.item as Partial<ItemInventoryRecord>;
        const name = String(raw.name || '').trim().slice(0, 120);
        if (!name) {
          return res.status(400).json({ status: 'error', message: 'Item name is required.' });
        }
        const nowIso = new Date().toISOString();
        const existingList = serverState.db.items || [];
        const itemId =
          String(raw.item_id || '').trim() ||
          generatePermanentId('ITM', existingList.map((it) => it.item_id));
        const existingItem = existingList.find((it) => it.item_id === itemId);
        const record: ItemInventoryRecord = {
          item_id: itemId,
          name,
          category: String(raw.category || 'First Aid').trim().slice(0, 60) || 'First Aid',
          unit: String(raw.unit || 'pcs').trim().slice(0, 30) || 'pcs',
          current_stock: Math.max(0, Number(raw.current_stock) || 0),
          min_stock_alert: Math.max(0, Number(raw.min_stock_alert) || 0),
          notes: String(raw.notes || '').trim().slice(0, 240) || undefined,
          updated_at: nowIso,
        };
        serverState.db.items = existingItem
          ? existingList.map((it) => (it.item_id === itemId ? record : it))
          : [record, ...existingList];

        let openingTxn: StockTransactionRecord | null = null;
        if (!existingItem && record.current_stock > 0) {
          const txnId = generatePermanentId(
            'TXN',
            (serverState.db.stockTransactions || []).map((t) => t.txn_id)
          );
          openingTxn = {
            txn_id: txnId,
            target_type: 'item',
            target_id: record.item_id,
            target_name: record.name,
            change_qty: record.current_stock,
            balance_after: record.current_stock,
            reason: 'adjustment',
            notes: 'Opening stock',
            recorded_by: req.authUser!.displayName,
            created_at: nowIso,
          };
          serverState.db.stockTransactions = [
            openingTxn,
            ...(serverState.db.stockTransactions || []),
          ];
        }
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({ action: 'upsertItem', item: record });
        if (openingTxn) {
          void forwardToAppsScript({ action: 'addStockTransaction', transaction: openingTxn });
        }
        return res.json({
          status: 'ok',
          sheetSynced,
          item: record,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'deleteItem' && body.item_id) {
        const itemId = String(body.item_id).trim();
        serverState.db.items = (serverState.db.items || []).filter((it) => it.item_id !== itemId);
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({ action: 'deleteItem', item_id: itemId });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'adjustStock') {
        const targetType = body.target_type === 'item' ? 'item' : 'medicine';
        const targetId = String(body.target_id || '').trim();
        const delta = Number(body.change_qty);
        if (!targetId || Number.isNaN(delta) || delta === 0) {
          return res.status(400).json({
            status: 'error',
            message: 'Select an inventory entry and enter a non-zero quantity adjustment.',
          });
        }
        const nowIso = new Date().toISOString();
        const rawReason = String(body.reason || 'adjustment');
        const reason =
          rawReason === 'bill_restock' || rawReason === 'visit' || rawReason === 'menstrual'
            ? rawReason
            : 'adjustment';
        const notes = String(body.notes || '').trim().slice(0, 240);
        const referenceId = String(body.reference_id || '').trim() || undefined;

        let targetName = '';
        let nextBalance = 0;
        let updatedMed: MedicineInventoryRecord | null = null;
        let updatedItem: ItemInventoryRecord | null = null;

        if (targetType === 'medicine') {
          const list = serverState.db.medicines || [];
          const found = list.find((m) => m.medicine_id === targetId);
          if (!found) {
            return res.status(404).json({ status: 'error', message: 'Medicine not found.' });
          }
          targetName = found.name;
          nextBalance = Math.max(0, Number((found.current_stock + delta).toFixed(2)));
          updatedMed = { ...found, current_stock: nextBalance, updated_at: nowIso };
          serverState.db.medicines = list.map((m) => (m.medicine_id === targetId ? updatedMed! : m));
        } else {
          const list = serverState.db.items || [];
          const found = list.find((it) => it.item_id === targetId);
          if (!found) {
            return res.status(404).json({ status: 'error', message: 'Item not found.' });
          }
          targetName = found.name;
          nextBalance = Math.max(0, Number((found.current_stock + delta).toFixed(2)));
          updatedItem = { ...found, current_stock: nextBalance, updated_at: nowIso };
          serverState.db.items = list.map((it) => (it.item_id === targetId ? updatedItem! : it));
        }

        const txn: StockTransactionRecord = {
          txn_id: generatePermanentId(
            'TXN',
            (serverState.db.stockTransactions || []).map((t) => t.txn_id)
          ),
          target_type: targetType,
          target_id: targetId,
          target_name: targetName,
          change_qty: delta,
          balance_after: nextBalance,
          reason,
          reference_id: referenceId,
          notes: notes || undefined,
          recorded_by: req.authUser!.displayName,
          created_at: nowIso,
        };
        serverState.db.stockTransactions = [txn, ...(serverState.db.stockTransactions || [])];
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);

        let sheetSynced = false;
        if (updatedMed) {
          sheetSynced = await forwardToAppsScript({ action: 'upsertMedicine', medicine: updatedMed });
        } else if (updatedItem) {
          sheetSynced = await forwardToAppsScript({ action: 'upsertItem', item: updatedItem });
        }
        void forwardToAppsScript({ action: 'addStockTransaction', transaction: txn });

        return res.json({
          status: 'ok',
          sheetSynced,
          transaction: txn,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'createBill' && body.bill) {
        const raw = body.bill as Partial<BillRecord> & {
          image_base64?: string;
          image_mime?: string;
          image_filename?: string;
        };
        const vendorName = String(raw.vendor_name || '').trim().slice(0, 120);
        if (!vendorName) {
          return res.status(400).json({ status: 'error', message: 'Vendor or pharmacy name is required.' });
        }
        const rawAmount = raw.total_amount;
        const totalAmount =
          rawAmount === undefined || rawAmount === null || String(rawAmount).trim() === ''
            ? 0
            : Number(rawAmount);
        if (Number.isNaN(totalAmount) || totalAmount < 0) {
          return res.status(400).json({ status: 'error', message: 'Enter a valid bill amount (or leave blank).' });
        }
        const nowIso = new Date().toISOString();
        const existingBills = serverState.db.bills || [];
        const billId =
          String(raw.bill_id || '').trim() ||
          generatePermanentId('BIL', existingBills.map((b) => b.bill_id));

        const rawCat = String(raw.category || 'Medicines').trim();
        const category =
          rawCat === 'Items' || rawCat === 'Equipment' || rawCat === 'Camp' || rawCat === 'Other'
            ? rawCat
            : 'Medicines';
        const rawPay = String(raw.payment_status || 'Recorded').trim();
        const paymentStatus =
          rawPay === 'Paid' || rawPay === 'Pending' || rawPay === 'Reimbursed'
            ? rawPay
            : 'Recorded';

        // Validate optional uploaded photo payload (JPEG/PNG/WebP data URL)
        const imageDataUrl =
          typeof raw.image_data_url === 'string' &&
          /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw.image_data_url) &&
          raw.image_data_url.length <= 2_500_000
            ? raw.image_data_url
            : undefined;

        let driveFileId = String(raw.drive_file_id || '').trim() || undefined;
        let imageUrl = String(raw.image_url || '').trim() || undefined;

        // Upload compressed bill photo to Google Drive via Apps Script (if provided)
        if (imageDataUrl && !imageUrl) {
          const commaIdx = imageDataUrl.indexOf(',');
          const header = imageDataUrl.slice(0, commaIdx);
          const mimeMatch = header.match(/data:(image\/[a-z+]+);base64/i);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          const base64Data = imageDataUrl.slice(commaIdx + 1);
          const safeVendorSlug = vendorName.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 28) || 'Bill';
          const filename = `${billId}_${safeVendorSlug}.${mimeType.includes('png') ? 'png' : 'jpg'}`;
          const driveUpload = await forwardToAppsScriptWithData(
            {
              action: 'uploadBillImage',
              bill_id: billId,
              filename,
              mimeType,
              base64Data,
            },
            20000
          );
          if (driveUpload.ok && driveUpload.data) {
            if (typeof driveUpload.data.drive_file_id === 'string' && driveUpload.data.drive_file_id) {
              driveFileId = driveUpload.data.drive_file_id;
            }
            if (typeof driveUpload.data.image_url === 'string' && driveUpload.data.image_url) {
              imageUrl = driveUpload.data.image_url;
            }
          }
        }

        const billRecord: BillRecord = {
          bill_id: billId,
          bill_number: String(raw.bill_number || '').trim().slice(0, 60),
          vendor_name: vendorName,
          bill_date: normalizeDateOnlyString(String(raw.bill_date || ''), nowIso.slice(0, 10)),
          category,
          total_amount: Number(totalAmount.toFixed(2)),
          payment_status: paymentStatus,
          notes: String(raw.notes || '').trim().slice(0, 300) || undefined,
          drive_file_id: driveFileId,
          image_url: imageUrl,
          image_data_url: imageDataUrl,
          recorded_by: req.authUser!.displayName,
          created_at: nowIso,
        };

        serverState.db.bills = [billRecord, ...existingBills.filter((b) => b.bill_id !== billId)];

        // Optional linked stock restock lines (add purchased quantities directly to Medicines/Items)
        const restockLines = Array.isArray(body.restockLines)
          ? (body.restockLines as Array<{ target_type?: string; target_id?: string; qty?: number }>)
          : [];
        const createdTxns: StockTransactionRecord[] = [];
        const touchedMeds: MedicineInventoryRecord[] = [];
        const touchedItems: ItemInventoryRecord[] = [];

        for (const line of restockLines) {
          const qty = Number(line?.qty);
          const tId = String(line?.target_id || '').trim();
          if (!tId || Number.isNaN(qty) || qty <= 0) continue;
          if (line.target_type === 'item') {
            const list = serverState.db.items || [];
            const found = list.find((it) => it.item_id === tId);
            if (!found) continue;
            const nextStock = Number((found.current_stock + qty).toFixed(2));
            const updated: ItemInventoryRecord = { ...found, current_stock: nextStock, updated_at: nowIso };
            serverState.db.items = list.map((it) => (it.item_id === tId ? updated : it));
            touchedItems.push(updated);
            const txnId = generatePermanentId('TXN', [
              ...(serverState.db.stockTransactions || []).map((t) => t.txn_id),
              ...createdTxns.map((t) => t.txn_id),
            ]);
            createdTxns.push({
              txn_id: txnId,
              target_type: 'item',
              target_id: found.item_id,
              target_name: found.name,
              change_qty: qty,
              balance_after: nextStock,
              reason: 'bill_restock',
              reference_id: billId,
              notes: `Restocked via ${vendorName}${billRecord.bill_number ? ` (#${billRecord.bill_number})` : ''}`,
              recorded_by: req.authUser!.displayName,
              created_at: nowIso,
            });
          } else {
            const list = serverState.db.medicines || [];
            const found = list.find((m) => m.medicine_id === tId);
            if (!found) continue;
            const nextStock = Number((found.current_stock + qty).toFixed(2));
            const updated: MedicineInventoryRecord = { ...found, current_stock: nextStock, updated_at: nowIso };
            serverState.db.medicines = list.map((m) => (m.medicine_id === tId ? updated : m));
            touchedMeds.push(updated);
            const txnId = generatePermanentId('TXN', [
              ...(serverState.db.stockTransactions || []).map((t) => t.txn_id),
              ...createdTxns.map((t) => t.txn_id),
            ]);
            createdTxns.push({
              txn_id: txnId,
              target_type: 'medicine',
              target_id: found.medicine_id,
              target_name: found.name,
              change_qty: qty,
              balance_after: nextStock,
              reason: 'bill_restock',
              reference_id: billId,
              notes: `Restocked via ${vendorName}${billRecord.bill_number ? ` (#${billRecord.bill_number})` : ''}`,
              recorded_by: req.authUser!.displayName,
              created_at: nowIso,
            });
          }
        }

        if (createdTxns.length > 0) {
          serverState.db.stockTransactions = [
            ...createdTxns,
            ...(serverState.db.stockTransactions || []),
          ];
        }

        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);

        // Send bill metadata (without large base64 data URL) to Google Sheets
        const { image_data_url: _omitDataUrl, ...billForSheet } = billRecord;
        const sheetSynced = await forwardToAppsScript({
          action: 'upsertBill',
          bill: billForSheet,
        });
        for (const m of touchedMeds) {
          void forwardToAppsScript({ action: 'upsertMedicine', medicine: m });
        }
        for (const it of touchedItems) {
          void forwardToAppsScript({ action: 'upsertItem', item: it });
        }
        for (const txn of createdTxns) {
          void forwardToAppsScript({ action: 'addStockTransaction', transaction: txn });
        }

        return res.json({
          status: 'ok',
          sheetSynced,
          driveUploaded: Boolean(driveFileId || imageUrl),
          bill: billRecord,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'updateBill' && body.bill && body.bill.bill_id) {
        const raw = body.bill as Partial<BillRecord>;
        const billId = String(raw.bill_id).trim();
        const existing = (serverState.db.bills || []).find((b) => b.bill_id === billId);
        if (!existing) {
          return res.status(404).json({ status: 'error', message: 'Bill record not found.' });
        }
        const rawCat = String(raw.category || existing.category).trim();
        const category =
          rawCat === 'Items' || rawCat === 'Equipment' || rawCat === 'Camp' || rawCat === 'Other'
            ? rawCat
            : 'Medicines';
        const rawPay = String(raw.payment_status || existing.payment_status || 'Recorded').trim();
        const paymentStatus =
          rawPay === 'Paid' || rawPay === 'Pending' || rawPay === 'Reimbursed'
            ? rawPay
            : 'Recorded';
        const vendorName = raw.vendor_name
          ? String(raw.vendor_name).trim().slice(0, 120)
          : existing.vendor_name;

        let driveFileId = existing.drive_file_id;
        let imageUrl = existing.image_url;
        let imageDataUrl = existing.image_data_url;

        // Allow attaching or replacing the bill receipt photo while editing
        const incomingImageDataUrl =
          typeof raw.image_data_url === 'string' &&
          /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw.image_data_url) &&
          raw.image_data_url.length <= 2_500_000
            ? raw.image_data_url
            : undefined;

        if (incomingImageDataUrl && incomingImageDataUrl !== existing.image_data_url) {
          imageDataUrl = incomingImageDataUrl;
          const commaIdx = incomingImageDataUrl.indexOf(',');
          const header = incomingImageDataUrl.slice(0, commaIdx);
          const mimeMatch = header.match(/data:(image\/[a-z+]+);base64/i);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          const base64Data = incomingImageDataUrl.slice(commaIdx + 1);
          const safeVendorSlug = vendorName.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 28) || 'Bill';
          const filename = `${billId}_${safeVendorSlug}.${mimeType.includes('png') ? 'png' : 'jpg'}`;
          const driveUpload = await forwardToAppsScriptWithData(
            {
              action: 'uploadBillImage',
              bill_id: billId,
              filename,
              mimeType,
              base64Data,
            },
            20000
          );
          if (driveUpload.ok && driveUpload.data) {
            if (typeof driveUpload.data.drive_file_id === 'string' && driveUpload.data.drive_file_id) {
              driveFileId = driveUpload.data.drive_file_id;
            }
            if (typeof driveUpload.data.image_url === 'string' && driveUpload.data.image_url) {
              imageUrl = driveUpload.data.image_url;
            }
          }
        }

        const parsedAmount =
          raw.total_amount === undefined || raw.total_amount === null || String(raw.total_amount).trim() === ''
            ? existing.total_amount || 0
            : Math.max(0, Number(raw.total_amount) || 0);

        const updated: BillRecord = {
          ...existing,
          bill_number: raw.bill_number !== undefined ? String(raw.bill_number).trim().slice(0, 60) : existing.bill_number,
          vendor_name: vendorName,
          bill_date: raw.bill_date ? normalizeDateOnlyString(String(raw.bill_date), existing.bill_date) : existing.bill_date,
          category,
          total_amount: Number(parsedAmount.toFixed(2)),
          payment_status: paymentStatus,
          drive_file_id: driveFileId,
          image_url: imageUrl,
          image_data_url: imageDataUrl,
          notes: raw.notes !== undefined ? String(raw.notes).trim().slice(0, 300) || undefined : existing.notes,
        };
        serverState.db.bills = (serverState.db.bills || []).map((b) =>
          b.bill_id === billId ? updated : b
        );
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const { image_data_url: _omitDataUrl, ...billForSheet } = updated;
        const sheetSynced = await forwardToAppsScript({ action: 'upsertBill', bill: billForSheet });
        return res.json({
          status: 'ok',
          sheetSynced,
          bill: updated,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'deleteBill' && body.bill_id) {
        const billId = String(body.bill_id).trim();
        serverState.db.bills = (serverState.db.bills || []).filter((b) => b.bill_id !== billId);
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({ action: 'deleteBill', bill_id: billId });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      // ---- PHASE 2: WEEKLY DOCTOR VISITS, EXTERNAL OPD & MEDICAL CAMPS (NURSE + ADMIN ONLY) ----
      if (action === 'upsertDoctorVisit' && body.doctorVisit) {
        const raw = body.doctorVisit as Partial<DoctorVisitSession>;
        const doctorName = String(raw.doctor_name || '').trim().slice(0, 120);
        if (!doctorName) {
          return res.status(400).json({ status: 'error', message: 'Doctor name is required.' });
        }
        const nowIso = new Date().toISOString();
        const existingList = serverState.db.doctorVisits || [];
        const incomingId = String(raw.doctor_visit_id || '').trim();
        const existing = incomingId
          ? existingList.find((d) => d.doctor_visit_id === incomingId)
          : undefined;
        const visitId =
          existing?.doctor_visit_id ||
          generatePermanentId(
            'DOC',
            existingList.map((d) => d.doctor_visit_id)
          );
        const sessionRecord: DoctorVisitSession = {
          doctor_visit_id: visitId,
          visit_date: normalizeDateOnlyString(
            String(raw.visit_date || existing?.visit_date || ''),
            nowIso.slice(0, 10)
          ),
          session_time: String(raw.session_time || '').trim().slice(0, 60) || undefined,
          doctor_name: doctorName,
          specialization: String(raw.specialization || '').trim().slice(0, 80) || undefined,
          campus_notes: String(raw.campus_notes || '').trim().slice(0, 500) || undefined,
          recorded_by: existing?.recorded_by || req.authUser!.displayName,
          created_at: existing?.created_at || nowIso,
        };
        serverState.db.doctorVisits = existing
          ? existingList.map((d) => (d.doctor_visit_id === visitId ? sessionRecord : d))
          : [sessionRecord, ...existingList];
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({
          action: 'upsertDoctorVisit',
          doctorVisit: sessionRecord,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          doctorVisit: sessionRecord,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'deleteDoctorVisit' && body.doctor_visit_id) {
        const visitId = String(body.doctor_visit_id).trim();
        serverState.db.doctorVisits = (serverState.db.doctorVisits || []).filter(
          (d) => d.doctor_visit_id !== visitId
        );
        serverState.db.doctorVisitCases = (serverState.db.doctorVisitCases || []).filter(
          (c) => c.doctor_visit_id !== visitId
        );
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({
          action: 'deleteDoctorVisit',
          doctor_visit_id: visitId,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'upsertDoctorVisitCase' && body.doctorVisitCase) {
        const raw = body.doctorVisitCase as Partial<DoctorVisitCase>;
        const doctorVisitId = String(raw.doctor_visit_id || '').trim();
        const studentId = String(raw.student_id || '').trim();
        const complaint = String(raw.complaint || '').trim().slice(0, 240);
        if (!doctorVisitId || !studentId || !complaint) {
          return res.status(400).json({
            status: 'error',
            message: 'Doctor session, student, and complaint are required.',
          });
        }
        const parentSession = (serverState.db.doctorVisits || []).find(
          (d) => d.doctor_visit_id === doctorVisitId
        );
        if (!parentSession) {
          return res.status(404).json({ status: 'error', message: 'Doctor visit session not found.' });
        }
        const student = serverState.db.students.find((s) => s.student_id === studentId);
        if (!student) {
          return res.status(404).json({ status: 'error', message: 'Selected student not found.' });
        }
        const nowIso = new Date().toISOString();
        const existingList = serverState.db.doctorVisitCases || [];
        const incomingId = String(raw.case_id || '').trim();
        const existing = incomingId ? existingList.find((c) => c.case_id === incomingId) : undefined;
        const caseId =
          existing?.case_id ||
          generatePermanentId(
            'DC',
            existingList.map((c) => c.case_id)
          );
        const caseRecord: DoctorVisitCase = {
          case_id: caseId,
          doctor_visit_id: doctorVisitId,
          student_id: student.student_id,
          student_name: student.full_name,
          section: student.section,
          roll_number: student.roll_number,
          complaint,
          findings: String(raw.findings || '').trim().slice(0, 400) || undefined,
          prescription_or_advice:
            String(raw.prescription_or_advice || '').trim().slice(0, 400) || undefined,
          follow_up_needed: Boolean(raw.follow_up_needed),
          notes: String(raw.notes || '').trim().slice(0, 300) || undefined,
          recorded_by: existing?.recorded_by || req.authUser!.displayName,
          created_at: existing?.created_at || nowIso,
        };
        serverState.db.doctorVisitCases = existing
          ? existingList.map((c) => (c.case_id === caseId ? caseRecord : c))
          : [caseRecord, ...existingList];
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({
          action: 'upsertDoctorVisitCase',
          doctorVisitCase: caseRecord,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          doctorVisitCase: caseRecord,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'deleteDoctorVisitCase' && body.case_id) {
        const caseId = String(body.case_id).trim();
        serverState.db.doctorVisitCases = (serverState.db.doctorVisitCases || []).filter(
          (c) => c.case_id !== caseId
        );
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({
          action: 'deleteDoctorVisitCase',
          case_id: caseId,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'createOpd' && body.opd) {
        const raw = body.opd as Partial<OpdRecord>;
        const studentId = String(raw.student_id || '').trim();
        const hospital = String(raw.hospital_or_clinic || '').trim().slice(0, 140);
        const reason = String(raw.reason || '').trim().slice(0, 260);
        if (!studentId || !hospital || !reason) {
          return res.status(400).json({
            status: 'error',
            message: 'Student, hospital/clinic, and reason for referral are required.',
          });
        }
        const student = serverState.db.students.find((s) => s.student_id === studentId);
        if (!student) {
          return res.status(404).json({ status: 'error', message: 'Selected student not found.' });
        }
        const nowIso = new Date().toISOString();
        const existingList = serverState.db.opdRecords || [];
        const opdId = generatePermanentId(
          'OPD',
          existingList.map((o) => o.opd_id)
        );
        const rawStatus = String(raw.status || 'Referred').trim();
        const status: OpdStatus =
          rawStatus === 'Returned' || rawStatus === 'Follow-up' ? rawStatus : 'Referred';

        // Strict validation of compressed OPD slip photo data URL (max ~2.5MB)
        let driveFileId = String(raw.drive_file_id || '').trim() || undefined;
        let imageUrl =
          typeof raw.image_url === 'string' && /^https:\/\/[^\s]+$/i.test(raw.image_url.trim())
            ? raw.image_url.trim().slice(0, 400)
            : undefined;
        const imageDataUrl =
          typeof raw.image_data_url === 'string' &&
          /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw.image_data_url) &&
          raw.image_data_url.length <= 2_500_000
            ? raw.image_data_url
            : undefined;

        if (imageDataUrl) {
          const commaIdx = imageDataUrl.indexOf(',');
          const header = imageDataUrl.slice(0, commaIdx);
          const mimeMatch = header.match(/data:(image\/[a-z+]+);base64/i);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          const base64Data = imageDataUrl.slice(commaIdx + 1);
          const safeStuSlug = student.full_name.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 24) || 'Student';
          const filename = `${opdId}_${safeStuSlug}.${mimeType.includes('png') ? 'png' : 'jpg'}`;
          const driveUpload = await forwardToAppsScriptWithData(
            {
              action: 'uploadOpdImage',
              opd_id: opdId,
              filename,
              mimeType,
              base64Data,
            },
            20000
          );
          if (driveUpload.ok && driveUpload.data) {
            if (typeof driveUpload.data.drive_file_id === 'string' && driveUpload.data.drive_file_id) {
              driveFileId = driveUpload.data.drive_file_id;
            }
            if (typeof driveUpload.data.image_url === 'string' && driveUpload.data.image_url) {
              imageUrl = driveUpload.data.image_url;
            }
          }
        }

        const rawFollowUp = String(raw.follow_up_date || '').trim();
        const opdRecord: OpdRecord = {
          opd_id: opdId,
          student_id: student.student_id,
          student_name: student.full_name,
          section: student.section,
          roll_number: student.roll_number,
          referral_datetime: normalizeDatetimeString(
            String(raw.referral_datetime || ''),
            nowIso.slice(0, 16)
          ),
          hospital_or_clinic: hospital,
          doctor_name: String(raw.doctor_name || '').trim().slice(0, 100) || undefined,
          reason,
          escort_or_parent: String(raw.escort_or_parent || '').trim().slice(0, 120) || undefined,
          diagnosis_and_advice:
            String(raw.diagnosis_and_advice || '').trim().slice(0, 500) || undefined,
          follow_up_date: rawFollowUp ? normalizeDateOnlyString(rawFollowUp, '') : undefined,
          status,
          drive_file_id: driveFileId,
          image_url: imageUrl,
          image_data_url: imageDataUrl,
          notes: String(raw.notes || '').trim().slice(0, 400) || undefined,
          recorded_by: req.authUser!.displayName,
          created_at: nowIso,
        };

        serverState.db.opdRecords = [opdRecord, ...existingList];
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);

        const { image_data_url: _omitOpdImg, ...opdForSheet } = opdRecord;
        const sheetSynced = await forwardToAppsScript({
          action: 'upsertOpd',
          opd: opdForSheet,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          driveUploaded: Boolean(driveFileId || imageUrl),
          opd: opdRecord,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'updateOpd' && body.opd && body.opd.opd_id) {
        const raw = body.opd as Partial<OpdRecord>;
        const opdId = String(raw.opd_id).trim();
        const existingList = serverState.db.opdRecords || [];
        const existing = existingList.find((o) => o.opd_id === opdId);
        if (!existing) {
          return res.status(404).json({ status: 'error', message: 'OPD record not found.' });
        }
        const studentId = raw.student_id ? String(raw.student_id).trim() : existing.student_id;
        const student = serverState.db.students.find((s) => s.student_id === studentId);
        const hospital = raw.hospital_or_clinic
          ? String(raw.hospital_or_clinic).trim().slice(0, 140)
          : existing.hospital_or_clinic;
        const reason = raw.reason ? String(raw.reason).trim().slice(0, 260) : existing.reason;
        const rawStatus = String(raw.status || existing.status).trim();
        const status: OpdStatus =
          rawStatus === 'Returned' || rawStatus === 'Follow-up' ? rawStatus : 'Referred';

        let driveFileId = existing.drive_file_id;
        let imageUrl = existing.image_url;
        let imageDataUrl = existing.image_data_url;

        const incomingImageDataUrl =
          typeof raw.image_data_url === 'string' &&
          /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw.image_data_url) &&
          raw.image_data_url.length <= 2_500_000
            ? raw.image_data_url
            : undefined;

        if (incomingImageDataUrl && incomingImageDataUrl !== existing.image_data_url) {
          imageDataUrl = incomingImageDataUrl;
          const commaIdx = incomingImageDataUrl.indexOf(',');
          const header = incomingImageDataUrl.slice(0, commaIdx);
          const mimeMatch = header.match(/data:(image\/[a-z+]+);base64/i);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          const base64Data = incomingImageDataUrl.slice(commaIdx + 1);
          const safeStuSlug =
            (student?.full_name || existing.student_name || 'Student')
              .replace(/[^a-zA-Z0-9]+/g, '_')
              .slice(0, 24) || 'Student';
          const filename = `${opdId}_${safeStuSlug}.${mimeType.includes('png') ? 'png' : 'jpg'}`;
          const driveUpload = await forwardToAppsScriptWithData(
            {
              action: 'uploadOpdImage',
              opd_id: opdId,
              filename,
              mimeType,
              base64Data,
            },
            20000
          );
          if (driveUpload.ok && driveUpload.data) {
            if (typeof driveUpload.data.drive_file_id === 'string' && driveUpload.data.drive_file_id) {
              driveFileId = driveUpload.data.drive_file_id;
            }
            if (typeof driveUpload.data.image_url === 'string' && driveUpload.data.image_url) {
              imageUrl = driveUpload.data.image_url;
            }
          }
        }

        const rawFollowUp =
          raw.follow_up_date !== undefined ? String(raw.follow_up_date || '').trim() : undefined;

        const updated: OpdRecord = {
          ...existing,
          student_id: student?.student_id || existing.student_id,
          student_name: student?.full_name || existing.student_name,
          section: student?.section || existing.section,
          roll_number: student?.roll_number || existing.roll_number,
          referral_datetime: raw.referral_datetime
            ? normalizeDatetimeString(String(raw.referral_datetime), existing.referral_datetime)
            : existing.referral_datetime,
          hospital_or_clinic: hospital,
          doctor_name:
            raw.doctor_name !== undefined
              ? String(raw.doctor_name).trim().slice(0, 100) || undefined
              : existing.doctor_name,
          reason,
          escort_or_parent:
            raw.escort_or_parent !== undefined
              ? String(raw.escort_or_parent).trim().slice(0, 120) || undefined
              : existing.escort_or_parent,
          diagnosis_and_advice:
            raw.diagnosis_and_advice !== undefined
              ? String(raw.diagnosis_and_advice).trim().slice(0, 500) || undefined
              : existing.diagnosis_and_advice,
          follow_up_date:
            rawFollowUp !== undefined
              ? rawFollowUp
                ? normalizeDateOnlyString(rawFollowUp, '')
                : undefined
              : existing.follow_up_date,
          status,
          drive_file_id: driveFileId,
          image_url: imageUrl,
          image_data_url: imageDataUrl,
          notes:
            raw.notes !== undefined
              ? String(raw.notes).trim().slice(0, 400) || undefined
              : existing.notes,
        };

        serverState.db.opdRecords = existingList.map((o) => (o.opd_id === opdId ? updated : o));
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);

        const { image_data_url: _omitOpdImg, ...opdForSheet } = updated;
        const sheetSynced = await forwardToAppsScript({ action: 'upsertOpd', opd: opdForSheet });
        return res.json({
          status: 'ok',
          sheetSynced,
          opd: updated,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'deleteOpd' && body.opd_id) {
        const opdId = String(body.opd_id).trim();
        serverState.db.opdRecords = (serverState.db.opdRecords || []).filter(
          (o) => o.opd_id !== opdId
        );
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({ action: 'deleteOpd', opd_id: opdId });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'upsertMedicalCamp' && body.medicalCamp) {
        const raw = body.medicalCamp as Partial<MedicalCampRecord>;
        const campTitle = String(raw.camp_title || '').trim().slice(0, 140);
        if (!campTitle) {
          return res.status(400).json({ status: 'error', message: 'Camp title is required.' });
        }
        const nowIso = new Date().toISOString();
        const existingList = serverState.db.medicalCamps || [];
        const incomingId = String(raw.camp_id || '').trim();
        const existing = incomingId ? existingList.find((c) => c.camp_id === incomingId) : undefined;
        const campId =
          existing?.camp_id ||
          generatePermanentId(
            'CMP',
            existingList.map((c) => c.camp_id)
          );
        const campRecord: MedicalCampRecord = {
          camp_id: campId,
          camp_title: campTitle,
          camp_type: String(raw.camp_type || 'General Health').trim().slice(0, 60) || 'General Health',
          organizer: String(raw.organizer || '').trim().slice(0, 140) || undefined,
          camp_date: normalizeDateOnlyString(
            String(raw.camp_date || existing?.camp_date || ''),
            nowIso.slice(0, 10)
          ),
          target_classes: String(raw.target_classes || '').trim().slice(0, 140) || undefined,
          doctor_team: String(raw.doctor_team || '').trim().slice(0, 180) || undefined,
          summary: String(raw.summary || '').trim().slice(0, 500) || undefined,
          recorded_by: existing?.recorded_by || req.authUser!.displayName,
          created_at: existing?.created_at || nowIso,
        };
        serverState.db.medicalCamps = existing
          ? existingList.map((c) => (c.camp_id === campId ? campRecord : c))
          : [campRecord, ...existingList];
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({
          action: 'upsertMedicalCamp',
          medicalCamp: campRecord,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          medicalCamp: campRecord,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'deleteMedicalCamp' && body.camp_id) {
        const campId = String(body.camp_id).trim();
        serverState.db.medicalCamps = (serverState.db.medicalCamps || []).filter(
          (c) => c.camp_id !== campId
        );
        serverState.db.campScreenings = (serverState.db.campScreenings || []).filter(
          (s) => s.camp_id !== campId
        );
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({
          action: 'deleteMedicalCamp',
          camp_id: campId,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'upsertCampScreening' && body.campScreening) {
        const raw = body.campScreening as Partial<CampScreeningRecord>;
        const campId = String(raw.camp_id || '').trim();
        const studentId = String(raw.student_id || '').trim();
        const findings = String(raw.findings || '').trim().slice(0, 400);
        if (!campId || !studentId || !findings) {
          return res.status(400).json({
            status: 'error',
            message: 'Medical camp, student, and screening findings are required.',
          });
        }
        const parentCamp = (serverState.db.medicalCamps || []).find((c) => c.camp_id === campId);
        if (!parentCamp) {
          return res.status(404).json({ status: 'error', message: 'Medical camp not found.' });
        }
        const student = serverState.db.students.find((s) => s.student_id === studentId);
        if (!student) {
          return res.status(404).json({ status: 'error', message: 'Selected student not found.' });
        }
        const nowIso = new Date().toISOString();
        const existingList = serverState.db.campScreenings || [];
        const incomingId = String(raw.screening_id || '').trim();
        const existing = incomingId
          ? existingList.find((s) => s.screening_id === incomingId)
          : undefined;
        const screeningId =
          existing?.screening_id ||
          generatePermanentId(
            'SCR',
            existingList.map((s) => s.screening_id)
          );
        const screeningRecord: CampScreeningRecord = {
          screening_id: screeningId,
          camp_id: campId,
          student_id: student.student_id,
          student_name: student.full_name,
          section: student.section,
          roll_number: student.roll_number,
          findings,
          referral_needed: Boolean(raw.referral_needed),
          notes: String(raw.notes || '').trim().slice(0, 300) || undefined,
          recorded_by: existing?.recorded_by || req.authUser!.displayName,
          created_at: existing?.created_at || nowIso,
        };
        serverState.db.campScreenings = existing
          ? existingList.map((s) => (s.screening_id === screeningId ? screeningRecord : s))
          : [screeningRecord, ...existingList];
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({
          action: 'upsertCampScreening',
          campScreening: screeningRecord,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          campScreening: screeningRecord,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'deleteCampScreening' && body.screening_id) {
        const screeningId = String(body.screening_id).trim();
        serverState.db.campScreenings = (serverState.db.campScreenings || []).filter(
          (s) => s.screening_id !== screeningId
        );
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({
          action: 'deleteCampScreening',
          screening_id: screeningId,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      // ---- PHASE 3: ANNUAL HEALTH CHECKUPS & PRIVATE MENSTRUAL LOG ----
      if (action === 'upsertAnnualCheckup' && body.annualCheckup) {
        const raw = body.annualCheckup as Partial<AnnualCheckupRecord>;
        const studentId = String(raw.student_id || '').trim();
        if (!studentId) {
          return res.status(400).json({ status: 'error', message: 'Please select a student.' });
        }
        const student = serverState.db.students.find((s) => s.student_id === studentId);
        if (!student) {
          return res.status(404).json({ status: 'error', message: 'Selected student not found.' });
        }

        const nowIso = new Date().toISOString();
        const checkupDate = normalizeDateOnlyString(
          String(raw.checkup_date || ''),
          nowIso.slice(0, 10)
        );
        const academicYear =
          String(raw.academic_year || '').trim().slice(0, 20) || getCurrentAcademicYear(checkupDate);

        const parsePositiveBounded = (
          val: unknown,
          min: number,
          max: number
        ): number | undefined => {
          if (val === '' || val === null || val === undefined) return undefined;
          const n = Number(val);
          if (!Number.isFinite(n) || n < min || n > max) return undefined;
          return Number(n.toFixed(1));
        };

        const heightCm = parsePositiveBounded(raw.height_cm, 40, 250);
        const weightKg = parsePositiveBounded(raw.weight_kg, 8, 200);
        const bmi = calculateBmi(heightCm, weightKg);

        const rawFitness = String(raw.general_fitness || 'Fit').trim();
        const generalFitness: AnnualCheckupFitness =
          rawFitness === 'Needs Follow-up' || rawFitness === 'Referred' ? rawFitness : 'Fit';

        const existingList = serverState.db.annualCheckups || [];
        const incomingId = String(raw.checkup_id || '').trim();
        const existing =
          (incomingId ? existingList.find((c) => c.checkup_id === incomingId) : undefined) ||
          existingList.find(
            (c) => c.student_id === student.student_id && c.academic_year === academicYear
          );

        const checkupId =
          existing?.checkup_id ||
          generatePermanentId(
            'CHK',
            existingList.map((c) => c.checkup_id)
          );

        const checkupRecord: AnnualCheckupRecord = {
          checkup_id: checkupId,
          academic_year: academicYear,
          student_id: student.student_id,
          student_name: student.full_name,
          section: student.section,
          roll_number: student.roll_number,
          checkup_date: checkupDate,
          height_cm: heightCm,
          weight_kg: weightKg,
          bmi,
          vision_left: normalizeSlashTextString(raw.vision_left).slice(0, 30) || undefined,
          vision_right: normalizeSlashTextString(raw.vision_right).slice(0, 30) || undefined,
          dental_status: String(raw.dental_status || '').trim().slice(0, 120) || undefined,
          ent_notes: String(raw.ent_notes || '').trim().slice(0, 160) || undefined,
          blood_group: String(raw.blood_group || '').trim().slice(0, 16) || undefined,
          hemoglobin: String(raw.hemoglobin || '').trim().slice(0, 24) || undefined,
          general_fitness: generalFitness,
          parent_referral: Boolean(raw.parent_referral),
          doctor_remarks: String(raw.doctor_remarks || '').trim().slice(0, 400) || undefined,
          recorded_by: existing?.recorded_by || req.authUser!.displayName,
          created_at: existing?.created_at || nowIso,
        };

        serverState.db.annualCheckups = existing
          ? existingList.map((c) => (c.checkup_id === checkupId ? checkupRecord : c))
          : [checkupRecord, ...existingList];
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSafeSlash = (val: string | undefined): string | undefined => {
          if (!val) return undefined;
          return /[/\-]/.test(val) ? `'${val}` : val;
        };
        const sheetSynced = await forwardToAppsScript({
          action: 'upsertAnnualCheckup',
          annualCheckup: {
            ...checkupRecord,
            vision_left: sheetSafeSlash(checkupRecord.vision_left),
            vision_right: sheetSafeSlash(checkupRecord.vision_right),
          },
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          annualCheckup: checkupRecord,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'deleteAnnualCheckup' && body.checkup_id) {
        const checkupId = String(body.checkup_id).trim();
        serverState.db.annualCheckups = (serverState.db.annualCheckups || []).filter(
          (c) => c.checkup_id !== checkupId
        );
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({
          action: 'deleteAnnualCheckup',
          checkup_id: checkupId,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'upsertMenstrualLog' && body.menstrualLog) {
        const raw = body.menstrualLog as Partial<MenstrualLogRecord>;
        const studentId = String(raw.student_id || '').trim();
        if (!studentId) {
          return res.status(400).json({ status: 'error', message: 'Please select a student.' });
        }
        const student = serverState.db.students.find((s) => s.student_id === studentId);
        if (!student) {
          return res.status(404).json({ status: 'error', message: 'Selected student not found.' });
        }

        const nowIso = new Date().toISOString();
        const existingList = serverState.db.menstrualLogs || [];
        const incomingId = String(raw.menstrual_id || '').trim();
        const existing = incomingId
          ? existingList.find((m) => m.menstrual_id === incomingId)
          : undefined;
        const menstrualId =
          existing?.menstrual_id ||
          generatePermanentId(
            'MNS',
            existingList.map((m) => m.menstrual_id)
          );

        const rawPads = Number(raw.pads_issued);
        const padsIssued =
          Number.isFinite(rawPads) && rawPads > 0 ? Math.min(50, Math.floor(rawPads)) : undefined;

        const requestedItemId = String(raw.item_id || '').trim();
        let linkedItemId = existing?.item_id;
        let linkedItemName = existing?.item_name;
        let updatedItemRecord: ItemInventoryRecord | null = null;
        let stockTxnRecord: StockTransactionRecord | null = null;

        // Atomically deduct sanitary pads from Items inventory ONLY on creation (never double-deduct on edits)
        if (!existing && padsIssued && padsIssued > 0 && requestedItemId) {
          const invItems = serverState.db.items || [];
          const matchedItem = invItems.find((it) => it.item_id === requestedItemId);
          if (!matchedItem) {
            return res.status(404).json({
              status: 'error',
              message: 'Selected sanitary supply item was not found in inventory.',
            });
          }
          if (matchedItem.current_stock < padsIssued) {
            return res.status(400).json({
              status: 'error',
              message: `Insufficient stock for ${matchedItem.name} (available: ${matchedItem.current_stock} ${matchedItem.unit}).`,
            });
          }
          const nextStock = matchedItem.current_stock - padsIssued;
          updatedItemRecord = {
            ...matchedItem,
            current_stock: nextStock,
            updated_at: nowIso,
          };
          serverState.db.items = invItems.map((it) =>
            it.item_id === matchedItem.item_id ? updatedItemRecord! : it
          );
          const txnId = generatePermanentId(
            'TXN',
            (serverState.db.stockTransactions || []).map((t) => t.txn_id)
          );
          // Privacy safeguard: stock audit trail keeps neutral label and never copies student name or private clinical notes
          stockTxnRecord = {
            txn_id: txnId,
            target_type: 'item',
            target_id: matchedItem.item_id,
            target_name: matchedItem.name,
            change_qty: -padsIssued,
            balance_after: nextStock,
            reason: 'menstrual',
            reference_id: menstrualId,
            notes: 'Issued via Menstrual Health Care',
            recorded_by: req.authUser!.displayName,
            created_at: nowIso,
          };
          serverState.db.stockTransactions = [
            stockTxnRecord,
            ...(serverState.db.stockTransactions || []),
          ];
          linkedItemId = matchedItem.item_id;
          linkedItemName = matchedItem.name;
        }

        const rawEnd = String(raw.cycle_end_date || '').trim();
        const menstrualRecord: MenstrualLogRecord = {
          menstrual_id: menstrualId,
          student_id: student.student_id,
          student_name: student.full_name,
          section: student.section,
          roll_number: student.roll_number,
          cycle_start_date: normalizeDateOnlyString(
            String(raw.cycle_start_date || existing?.cycle_start_date || ''),
            nowIso.slice(0, 10)
          ),
          cycle_end_date: rawEnd ? normalizeDateOnlyString(rawEnd, '') : undefined,
          flow_or_pain_notes: String(raw.flow_or_pain_notes || '').trim().slice(0, 240) || undefined,
          pads_issued: padsIssued,
          item_id: linkedItemId,
          item_name: linkedItemName,
          irregular_flag: Boolean(raw.irregular_flag),
          private_notes: String(raw.private_notes || '').trim().slice(0, 400) || undefined,
          recorded_by: existing?.recorded_by || req.authUser!.displayName,
          created_at: existing?.created_at || nowIso,
        };

        serverState.db.menstrualLogs = existing
          ? existingList.map((m) => (m.menstrual_id === menstrualId ? menstrualRecord : m))
          : [menstrualRecord, ...existingList];
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);

        const sheetSynced = await forwardToAppsScript({
          action: 'upsertMenstrualLog',
          menstrualLog: menstrualRecord,
        });
        if (updatedItemRecord) {
          void forwardToAppsScript({ action: 'upsertItem', item: updatedItemRecord });
        }
        if (stockTxnRecord) {
          void forwardToAppsScript({ action: 'addStockTransaction', transaction: stockTxnRecord });
        }
        return res.json({
          status: 'ok',
          sheetSynced,
          menstrualLog: menstrualRecord,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      if (action === 'deleteMenstrualLog' && body.menstrual_id) {
        const menstrualId = String(body.menstrual_id).trim();
        serverState.db.menstrualLogs = (serverState.db.menstrualLogs || []).filter(
          (m) => m.menstrual_id !== menstrualId
        );
        saveServerState(serverState, true);
        broadcastStateUpdate(deviceId);
        const sheetSynced = await forwardToAppsScript({
          action: 'deleteMenstrualLog',
          menstrual_id: menstrualId,
        });
        return res.json({
          status: 'ok',
          sheetSynced,
          db: safeDb(),
          updatedAt: serverState.updatedAt,
        });
      }

      return res.status(400).json({ status: 'error', message: `Unsupported action: ${action}` });
    } catch (err) {
      console.error('Mutation error:', err);
      return res.status(500).json({ status: 'error', message: 'Unable to save record right now.' });
    }
  });

  // 4. Shared school configuration (Admin ONLY — update Apps Script Web App URL for backup sheet changes)
  app.post('/api/config', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const body = req.body || {};

    if (body.resetDefaultUrl === true) {
      serverState.appsScriptUrl = DEFAULT_APPS_SCRIPT_URL;
    } else if (typeof body.appsScriptUrl === 'string') {
      const candidate = body.appsScriptUrl.trim();
      if (!candidate) {
        return res.status(400).json({
          status: 'error',
          message: 'Please paste a valid Google Apps Script Web App URL.',
        });
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(candidate);
      } catch {
        return res.status(400).json({
          status: 'error',
          message:
            'URL must be a deployed Google Apps Script Web App URL (https://script.google.com/macros/s/.../exec).',
        });
      }
      const allowedHosts = new Set(['script.google.com', 'script.googleusercontent.com']);
      const isValidGoogleScript =
        parsedUrl.protocol === 'https:' &&
        allowedHosts.has(parsedUrl.hostname.toLowerCase()) &&
        parsedUrl.pathname.startsWith('/macros/') &&
        !parsedUrl.username &&
        !parsedUrl.password;
      if (!isValidGoogleScript) {
        return res.status(400).json({
          status: 'error',
          message:
            'URL must be a deployed Google Apps Script Web App URL (https://script.google.com/macros/s/.../exec).',
        });
      }
      serverState.appsScriptUrl = candidate;
    }

    if (typeof body.autoSyncEnabled === 'boolean') {
      serverState.autoSyncEnabled = body.autoSyncEnabled;
    }

    saveServerState(serverState, true);
    recordSecurityEvent('config_changed', req.authUser!.username, 'Updated Google Sheets backup configuration', req.ip);
    broadcastStateUpdate(String(body.deviceId || 'config'));

    const safeState = sanitizeStateForRole(serverState, 'admin', DEFAULT_APPS_SCRIPT_URL);

    if (serverState.appsScriptUrl && body.triggerSync) {
      if (body.pushBackup) {
        const billsForSheet = (serverState.db.bills || []).map(({ image_data_url: _omit, ...rest }) => rest);
        const opdForSheet = (serverState.db.opdRecords || []).map(({ image_data_url: _omit, ...rest }) => rest);
        await forwardToAppsScript({
          action: 'syncFullDatabase',
          db: {
            ...serverState.db,
            bills: billsForSheet,
            opdRecords: opdForSheet,
            users: ensureUsersHashed(serverState.db.users || []).users,
          },
        });
      }
      const syncResult = await pullFromAppsScript();
      const updatedSafe = sanitizeStateForRole(serverState, 'admin', DEFAULT_APPS_SCRIPT_URL);
      return res.json({
        status: 'ok',
        syncResult,
        message: syncResult.ok
          ? `Backup link updated & synced (${serverState.db.students.length} students, ${serverState.db.visits.length} visits).`
          : `Backup link saved. ${syncResult.message}`,
        ...updatedSafe,
      });
    }

    return res.json({
      status: 'ok',
      message: 'Apps Script Web App link saved.',
      ...safeState,
    });
  });

  // 5. Pull latest records from Google Sheets & push any missing local records (Admin ONLY)
  app.post('/api/sheets-sync', requireAuth, requireAdmin, async (_req: AuthedRequest, res) => {
    const result = await pullFromAppsScript();
    const safeState = sanitizeStateForRole(serverState, 'admin', DEFAULT_APPS_SCRIPT_URL);
    res.json({
      status: result.ok ? 'ok' : 'error',
      message: result.message,
      ...safeState,
    });
  });

  // 6. Push full shared database in plain readable format to Google Sheets (Admin ONLY)
  app.post('/api/sheets-push', requireAuth, requireAdmin, async (_req: AuthedRequest, res) => {
    const billsForSheet = (serverState.db.bills || []).map(({ image_data_url: _omit, ...rest }) => rest);
    const opdForSheet = (serverState.db.opdRecords || []).map(({ image_data_url: _omit, ...rest }) => rest);
    const pushedFull = await forwardToAppsScript({
      action: 'syncFullDatabase',
      db: {
        ...serverState.db,
        bills: billsForSheet,
        opdRecords: opdForSheet,
        users: ensureUsersHashed(serverState.db.users || []).users,
      },
    });
    const result = await pullFromAppsScript(true);
    if (!pushedFull && !result.ok) {
      return res.status(502).json({
        status: 'error',
        message: result.message || 'Unable to push backup to Google Sheets.',
      });
    }
    const safeState = sanitizeStateForRole(serverState, 'admin', DEFAULT_APPS_SCRIPT_URL);
    return res.json({
      status: 'ok',
      message: `Backup pushed to Google Sheets: ${serverState.db.students.length} students, ${serverState.db.visits.length} visits, and ${(serverState.db.users || []).length} staff accounts.`,
      ...safeState,
    });
  });

  // 7. Download AES-256 password-protected, neatly formatted Excel (.xlsx) sheets (Admin & Nurse ONLY — Users sheet permanently excluded)
  app.post('/api/export/excel', requireAuth, async (req: AuthedRequest, res) => {
    const role = req.authUser!.role;
    if (role !== 'admin' && role !== 'nurse') {
      recordSecurityEvent(
        'rbac_blocked',
        req.authUser!.username,
        `Role "${role}" blocked from downloading clinical Excel sheets`,
        req.ip
      );
      return res.status(403).json({
        status: 'error',
        message: 'Only School Nurse and Administrator accounts can download clinical sheets.',
      });
    }

    const tab = String(req.body?.tab || '').trim() as ClinicalExcelTab;
    if (!ALLOWED_EXCEL_TABS.has(tab)) {
      return res.status(400).json({
        status: 'error',
        message:
          'Invalid sheet requested. Allowed sheets: Students, Visits, Measurements, Health Profiles, Medicines, Items, Bills, Doctor Visits, External OPD, Medical Camps, Annual Checkups, Menstrual Log, or All.',
      });
    }

    try {
      const { buffer, filename } = await generateEncryptedExcelWorkbook(serverState.db, tab);
      recordSecurityEvent(
        'excel_exported',
        req.authUser!.username,
        `Downloaded password-protected Excel sheet: ${tab}`,
        req.ip
      );
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(buffer);
    } catch (err) {
      console.error('Excel export error:', err);
      return res.status(500).json({
        status: 'error',
        message: 'Unable to generate password-protected Excel file right now.',
      });
    }
  });

  // Explicit JSON 404 for unknown API routes before Vite / static SPA fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ status: 'error', message: 'API route not found.' });
  });

  // Safe Express error middleware so malformed JSON or unexpected errors never crash or return HTML stack traces
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }
    return res.status(400).json({ status: 'error', message: 'Invalid request.' });
  });

  // Initial sync on server startup
  void pullFromAppsScript();

  // Automated background Google Sheets sync on the server (every 10s)
  setInterval(() => {
    if (serverState.appsScriptUrl && serverState.autoSyncEnabled) {
      void pullFromAppsScript();
    }
  }, 10000);

  // Never expose chat/workspace upload attachments or archives publicly
  app.use('/assets/aistudio', (_req, res) => {
    res.status(404).end();
  });

  if (process.env.NODE_ENV !== 'production') {
    process.env.DISABLE_HMR = 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    // Serve a WebSocket-free /@vite/client shim when HMR is disabled so browsers never hit unexposed port 24678
    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.send(
        `export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function injectQuery(url) {
  return url;
}
export class ErrorOverlay extends HTMLElement {}
`
      );
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Saraswati Vidya Academy Infirmary Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
