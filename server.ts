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
  encryptVisitForStorage,
  encryptMeasurementForStorage,
  encryptHealthProfileForStorage,
  encryptDatabaseForSheets,
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
  normalizeDatetimeString,
  normalizeDateOnlyString,
  normalizeTimeOnlyString,
  PURGED_TEST_VISIT_IDS,
  PURGED_TEST_MEASUREMENT_IDS,
  PURGED_TEST_HEALTH_PROFILE_IDS,
  type NurseDatabase,
  type StudentRecord,
  type VisitRecord,
  type MeasurementRecord,
  type HealthProfileRecord,
  type AppUserRecord,
} from './src/utils/nurseLogic.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = RUNTIME_DATA_DIR;
const STATE_FILE = path.join(DATA_DIR, 'school-nurse-state.json');

// Kept strictly on the server — NEVER bundled into public frontend JavaScript
const DEFAULT_APPS_SCRIPT_URL =
  (process.env.APPS_SCRIPT_URL || '').trim() ||
  'https://script.google.com/macros/s/AKfycbxpB8pHEpmaZwnp6Zgzksl5xpFRi55EdE_srVOC7STWHcwiWp-lN-t4R1Zt207diPaLqQ/exec';
const APPS_SCRIPT_SECRET = (process.env.APPS_SCRIPT_SECRET || '').trim();

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
    if (!v.visit_id || PURGED_TEST_VISIT_IDS.has(v.visit_id) || seenVisitIds.has(v.visit_id)) {
      continue;
    }
    seenVisitIds.add(v.visit_id);
    const matched = students.find((s) => s.student_id === v.student_id);
    const stuName = v.student_name || matched?.full_name || '';
    const stuSec = normalizeSectionName(v.section || v.class || matched?.section || '');
    const rawR = String(v.roll_no || v.roll_number || matched?.roll_number || '').trim();
    const stuR = /^\d+$/.test(rawR) ? rawR.padStart(2, '0') : rawR;
    visits.push({
      ...v,
      student_name: stuName,
      section: stuSec,
      class: stuSec,
      roll_number: stuR,
      roll_no: stuR,
      visit_datetime: normalizeDatetimeString(v.visit_datetime),
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

  return { students, visits, measurements, healthProfiles, dispatches, users, classes };
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

function mergePreservingHashedPasswords(
  incomingUsers: AppUserRecord[],
  existingUsers: AppUserRecord[]
): AppUserRecord[] {
  const existingMap = new Map<string, AppUserRecord>();
  for (const u of existingUsers || []) {
    existingMap.set(u.username.toLowerCase(), u);
  }
  const merged = (incomingUsers || []).map((u) => {
    const prev = existingMap.get(u.username.toLowerCase());
    if (prev && isPasswordHash(prev.password) && !isPasswordHash(u.password)) {
      if (!u.password || verifyPassword(u.password, prev.password).valid) {
        return { ...u, password: prev.password };
      }
    }
    return u;
  });
  return ensureUsersHashed(merged).users;
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
        // Automatically upgrade any legacy plaintext passwords on disk to salted scrypt hashes
        const { users: hashedUsers } = ensureUsersHashed(loaded.db.users || []);
        loaded.db.users = hashedUsers;
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

async function forwardToAppsScript(payload: Record<string, unknown>): Promise<boolean> {
  const url = serverState.appsScriptUrl.trim();
  if (!url) return false;
  try {
    const bodyPayload = APPS_SCRIPT_SECRET
      ? { ...payload, secret: APPS_SCRIPT_SECRET }
      : payload;
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(bodyPayload),
        redirect: 'follow',
      },
      12000
    );
    if (!res.ok) return false;
    const rawText = await res.text();
    const data = safeParseJsonObject(rawText);
    if (!data) return false;
    if (data.status === 'error') {
      const msg = String(data.message || '');
      if (msg.toLowerCase().includes('duplicate')) {
        return true;
      }
      console.error('Google Apps Script error for action', payload.action, ':', msg);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Background Google Sheets forward error:', err instanceof Error ? err.message : err);
    return false;
  }
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
      visit: encryptVisitForStorage(visit),
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
      measurement: encryptMeasurementForStorage(measurement),
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
      healthProfile: encryptHealthProfileForStorage(healthProfile),
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
      const secretParam = APPS_SCRIPT_SECRET
        ? `&secret=${encodeURIComponent(APPS_SCRIPT_SECRET)}`
        : '';
      const response = await fetchWithTimeout(
        `${url}${separator}action=getAll${secretParam}&t=${Date.now()}`,
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
      };

      // Transparently decrypt any AES-256-GCM encrypted clinical fields from Google Sheets
      const remotePayload = decryptRemoteSheetPayload(rawRemotePayload);

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

  app.use(express.json({ limit: '2mb' }));

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
      appsScriptSecretConfigured: Boolean(APPS_SCRIPT_SECRET),
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
        const visit: VisitRecord = {
          ...rawVisit,
          student_name: stuName,
          section: stuSec,
          class: stuSec,
          roll_number: stuR,
          roll_no: stuR,
          visit_datetime: normalizeDatetimeString(rawVisit.visit_datetime),
          administration_time: normalizeTimeOnlyString(rawVisit.administration_time),
        };
        const exists = serverState.db.visits.some((v) => v.visit_id === visit.visit_id);
        if (!exists) {
          serverState.db.visits = [visit, ...serverState.db.visits];
          saveServerState(serverState, true);
          broadcastStateUpdate(deviceId);
        }
        const encryptedVisit = encryptVisitForStorage(visit);
        const sheetSynced = await forwardToAppsScript({
          action: 'createVisit',
          visit: {
            ...encryptedVisit,
            student_name: stuName,
            full_name: stuName,
            class: stuSec,
            section: stuSec,
            roll_no: stuR,
            roll_number: stuR,
          },
        });
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
          measurement: encryptMeasurementForStorage(measurement),
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
          healthProfile: encryptHealthProfileForStorage(healthProfile),
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
        await forwardToAppsScript({
          action: 'syncFullDatabase',
          db: encryptDatabaseForSheets(serverState.db),
        });
      }
      const syncResult = await pullFromAppsScript();
      const updatedSafe = sanitizeStateForRole(serverState, 'admin', DEFAULT_APPS_SCRIPT_URL);
      return res.json({
        status: 'ok',
        syncResult,
        message: syncResult.ok
          ? `Backup link updated & synced with AES-256-GCM encryption (${serverState.db.students.length} students, ${serverState.db.visits.length} visits).`
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

  // 6. Push full shared database (AES-256-GCM encrypted clinical fields + scrypt hashed users) to Google Sheets (Admin ONLY)
  app.post('/api/sheets-push', requireAuth, requireAdmin, async (_req: AuthedRequest, res) => {
    const pushedFull = await forwardToAppsScript({
      action: 'syncFullDatabase',
      db: encryptDatabaseForSheets(serverState.db),
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
      message: `Encrypted backup pushed: ${serverState.db.students.length} students, ${serverState.db.visits.length} visits (AES-256-GCM), and ${(serverState.db.users || []).length} staff accounts (scrypt hashed).`,
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
        message: 'Invalid sheet requested. Only Students, Visits, Measurements, Health Profiles, or All are allowed.',
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
