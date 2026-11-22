import crypto from 'crypto';
import type { AuthRole, AuthUser } from './src/utils/auth.ts';
import type { AppUserRecord, NurseDatabase } from './src/utils/nurseLogic.ts';
import {
  verifyPassword,
  runDummyPasswordWork,
  timingSafeStringEqual,
} from './serverCrypto.ts';

export { timingSafeStringEqual };

export interface SessionRecord {
  tokenHash: string;
  user: AuthUser;
  uaHash: string;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
}

interface StreamTicketRecord {
  user: AuthUser;
  uaHash: string;
  expiresAt: number;
}

interface RateLimitBucket {
  failures: number[];
  lockedUntil: number;
}

export interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  type:
    | 'login_success'
    | 'login_failed'
    | 'login_lockout'
    | 'logout'
    | 'rbac_blocked'
    | 'session_hijack_blocked'
    | 'password_rehashed'
    | 'user_updated'
    | 'user_deleted'
    | 'config_changed'
    | 'rate_limited'
    | 'excel_exported';
  actor: string;
  detail: string;
  ipMasked: string;
}

const SESSION_ABSOLUTE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const SESSION_IDLE_TTL_MS = 60 * 60 * 1000; // 60 minutes
const MAX_SESSIONS_PER_USER = 5;
const STREAM_TICKET_TTL_MS = 30 * 1000; // 30 seconds, single-use
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes lockout
const RATE_LIMIT_MAX_ATTEMPTS = 5;

const API_RATE_WINDOW_MS = 60 * 1000; // 1 minute
const API_RATE_MAX_REQUESTS = 600; // 600 req/min per IP (supports shared school Wi-Fi NAT)

export const SERVER_DEFAULT_USERS: AppUserRecord[] = [
  {
    username: 'nurse',
    password: process.env.DEFAULT_NURSE_PASSWORD || 'iloveeating',
    role: 'nurse',
    display_name: 'School Nurse',
    badge_title: 'Infirmary Nurse',
    active_status: 'Active',
    updated_at: '2026-10-21T00:00:00Z',
  },
  {
    username: 'admin',
    password: process.env.DEFAULT_ADMIN_PASSWORD || 'sva0pass',
    role: 'admin',
    display_name: 'Infirmary Administrator',
    badge_title: 'System Admin',
    active_status: 'Active',
    updated_at: '2026-10-21T00:00:00Z',
  },
  {
    username: 'agnel',
    password: process.env.DEFAULT_WARDEN_PASSWORD || 'ilovesleeping',
    role: 'warden',
    display_name: 'Agnel (Hostel Warden)',
    badge_title: 'Hostel Warden',
    active_status: 'Active',
    updated_at: '2026-10-21T00:00:00Z',
  },
];

const sessions = new Map<string, SessionRecord>();
const streamTickets = new Map<string, StreamTicketRecord>();
const loginBuckets = new Map<string, RateLimitBucket>();
const apiRateBuckets = new Map<string, number[]>();
const securityAuditLog: SecurityAuditEvent[] = [];

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hashUserAgent(userAgent?: string | null): string {
  const clean = String(userAgent || '').trim().slice(0, 256);
  return clean ? sha256Hex(clean) : '';
}

function maskIp(ip?: string | null): string {
  const raw = String(ip || '').trim();
  if (!raw) return 'unknown';
  if (raw.includes('.')) {
    const parts = raw.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  }
  if (raw.includes(':')) {
    const parts = raw.split(':');
    return `${parts.slice(0, 2).join(':')}:*`;
  }
  return 'masked';
}

export function recordSecurityEvent(
  type: SecurityAuditEvent['type'],
  actor: string,
  detail: string,
  ip?: string | null
): void {
  securityAuditLog.unshift({
    id: crypto.randomBytes(6).toString('hex'),
    timestamp: new Date().toISOString(),
    type,
    actor: String(actor || 'anonymous').slice(0, 48),
    detail: String(detail || '').slice(0, 180),
    ipMasked: maskIp(ip),
  });
  if (securityAuditLog.length > 50) {
    securityAuditLog.length = 50;
  }
}

export function getRecentSecurityEvents(): SecurityAuditEvent[] {
  return [...securityAuditLog];
}

export function getActiveSessionCount(): number {
  const now = Date.now();
  pruneExpiredSessions(now, true);
  return sessions.size;
}

/**
 * Authenticates a staff member strictly on the server using salted scrypt KDF
 * and constant-time comparison. Automatically flags legacy plaintext credentials
 * for seamless transparent upgrade to scrypt hashes.
 */
export function authenticateServerUserWithMeta(
  usernameInput: string,
  passwordInput: string,
  dbUsers?: AppUserRecord[]
): { user: AuthUser; needsRehash: boolean } | null {
  const cleanUsername = String(usernameInput || '').trim().toLowerCase();
  const cleanPassword = String(passwordInput || '').trim();
  if (!cleanUsername || !cleanPassword || cleanUsername.length > 64 || cleanPassword.length > 128) {
    return null;
  }

  const candidateUsers =
    Array.isArray(dbUsers) && dbUsers.length > 0 ? dbUsers : SERVER_DEFAULT_USERS;

  const matched = candidateUsers.find(
    (u) => String(u.username || '').trim().toLowerCase() === cleanUsername
  );

  if (!matched || matched.active_status === 'Inactive') {
    // Perform dummy scrypt work so response time cannot leak whether a username exists
    runDummyPasswordWork(cleanPassword);
    return null;
  }

  const verification = verifyPassword(cleanPassword, String(matched.password || '').trim());
  if (!verification.valid) {
    return null;
  }

  return {
    needsRehash: verification.needsRehash,
    user: {
      username: matched.username.trim().toLowerCase(),
      role: matched.role,
      displayName:
        matched.display_name ||
        (matched.role === 'admin'
          ? 'Infirmary Administrator'
          : matched.role === 'nurse'
            ? 'School Nurse'
            : `${matched.username} (Hostel Warden)`),
      badgeTitle:
        matched.badge_title ||
        (matched.role === 'admin'
          ? 'System Admin'
          : matched.role === 'nurse'
            ? 'Infirmary Nurse'
            : 'Hostel Warden'),
      loginTime: new Date().toISOString(),
    },
  };
}

export function authenticateServerUser(
  usernameInput: string,
  passwordInput: string,
  dbUsers?: AppUserRecord[]
): AuthUser | null {
  const res = authenticateServerUserWithMeta(usernameInput, passwordInput, dbUsers);
  return res ? res.user : null;
}

export function createSession(
  user: AuthUser,
  userAgent?: string | null
): { token: string; expiresAt: number } {
  const now = Date.now();
  pruneExpiredSessions(now);

  // Cap concurrent active sessions per user to limit stolen-device exposure
  const userSessions: Array<{ hash: string; createdAt: number }> = [];
  for (const [hash, rec] of sessions.entries()) {
    if (rec.user.username.toLowerCase() === user.username.toLowerCase()) {
      userSessions.push({ hash, createdAt: rec.createdAt });
    }
  }
  if (userSessions.length >= MAX_SESSIONS_PER_USER) {
    userSessions.sort((a, b) => a.createdAt - b.createdAt);
    const toEvict = userSessions.length - MAX_SESSIONS_PER_USER + 1;
    for (let i = 0; i < toEvict; i++) {
      sessions.delete(userSessions[i].hash);
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256Hex(token);
  const expiresAt = now + SESSION_ABSOLUTE_TTL_MS;
  sessions.set(tokenHash, {
    tokenHash,
    user,
    uaHash: hashUserAgent(userAgent),
    createdAt: now,
    lastActiveAt: now,
    expiresAt,
  });
  return { token, expiresAt };
}

export function getSessionByToken(
  token: string | undefined | null,
  userAgent?: string | null
): SessionRecord | null {
  if (!token || typeof token !== 'string' || token.length < 32 || token.length > 128) {
    return null;
  }
  const now = Date.now();
  const tokenHash = sha256Hex(token);
  const record = sessions.get(tokenHash);
  if (!record) return null;
  if (now > record.expiresAt || now - record.lastActiveAt > SESSION_IDLE_TTL_MS) {
    sessions.delete(tokenHash);
    return null;
  }
  // Session-to-client User-Agent binding prevents token replay from foreign clients/scripts
  if (record.uaHash && typeof userAgent === 'string' && userAgent.trim().length > 0) {
    const incomingUaHash = hashUserAgent(userAgent);
    if (incomingUaHash && !timingSafeStringEqual(record.uaHash, incomingUaHash)) {
      return null;
    }
  }
  record.lastActiveAt = now;
  return record;
}

export function revokeSession(token: string | undefined | null): void {
  if (!token || typeof token !== 'string') return;
  sessions.delete(sha256Hex(token));
}

export function revokeSessionsForUsername(username: string): void {
  const lower = String(username || '').trim().toLowerCase();
  for (const [hash, rec] of sessions.entries()) {
    if (rec.user.username.toLowerCase() === lower) {
      sessions.delete(hash);
    }
  }
}

export function createStreamTicket(user: AuthUser, userAgent?: string | null): string {
  const now = Date.now();
  for (const [t, rec] of streamTickets.entries()) {
    if (now > rec.expiresAt) streamTickets.delete(t);
  }
  const ticket = crypto.randomBytes(24).toString('hex');
  streamTickets.set(ticket, {
    user,
    uaHash: hashUserAgent(userAgent),
    expiresAt: now + STREAM_TICKET_TTL_MS,
  });
  return ticket;
}

export function consumeStreamTicket(
  ticket: string | undefined | null,
  userAgent?: string | null
): AuthUser | null {
  if (!ticket || typeof ticket !== 'string') return null;
  const rec = streamTickets.get(ticket);
  if (!rec) return null;
  streamTickets.delete(ticket); // Single-use
  if (Date.now() > rec.expiresAt) return null;
  if (rec.uaHash && typeof userAgent === 'string' && userAgent.trim().length > 0) {
    const incomingUaHash = hashUserAgent(userAgent);
    if (incomingUaHash && !timingSafeStringEqual(rec.uaHash, incomingUaHash)) {
      return null;
    }
  }
  return rec.user;
}

function pruneExpiredSessions(now: number, force: boolean = false): void {
  if (!force && sessions.size < 200) return;
  for (const [hash, rec] of sessions.entries()) {
    if (now > rec.expiresAt || now - rec.lastActiveAt > SESSION_IDLE_TTL_MS) {
      sessions.delete(hash);
    }
  }
}

export function checkLoginRateLimit(
  key: string,
  now: number = Date.now()
): { allowed: boolean; retryAfterSeconds: number } {
  const bucket = loginBuckets.get(key);
  if (!bucket) return { allowed: true, retryAfterSeconds: 0 };
  if (bucket.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
    };
  }
  bucket.failures = bucket.failures.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (bucket.failures.length === 0) {
    loginBuckets.delete(key);
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordFailedLogin(key: string, now: number = Date.now()): void {
  const existing = loginBuckets.get(key) || { failures: [], lockedUntil: 0 };
  existing.failures = existing.failures.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  existing.failures.push(now);
  if (existing.failures.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    existing.lockedUntil = now + RATE_LIMIT_LOCKOUT_MS;
    existing.failures = [];
  }
  loginBuckets.set(key, existing);
}

export function clearLoginFailures(key: string): void {
  loginBuckets.delete(key);
}

export function checkApiRateLimit(
  ipKey: string,
  now: number = Date.now()
): { allowed: boolean; retryAfterSeconds: number } {
  const existing = apiRateBuckets.get(ipKey) || [];
  const recent = existing.filter((ts) => now - ts < API_RATE_WINDOW_MS);
  if (recent.length >= API_RATE_MAX_REQUESTS) {
    apiRateBuckets.set(ipKey, recent);
    const oldest = recent[0] || now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((API_RATE_WINDOW_MS - (now - oldest)) / 1000)),
    };
  }
  recent.push(now);
  apiRateBuckets.set(ipKey, recent);
  if (apiRateBuckets.size > 1000) {
    for (const [k, list] of apiRateBuckets.entries()) {
      if (list.length === 0 || now - list[list.length - 1] >= API_RATE_WINDOW_MS) {
        apiRateBuckets.delete(k);
      }
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Strips sensitive credentials for ALL roles:
 * - Nurse & Warden NEVER receive any user accounts or Apps Script URL.
 * - Admin receives staff user metadata with passwords & hashes strictly redacted (`password: ''`)
 *   so neither plaintext passwords nor scrypt hashes ever travel over HTTP.
 */
export function sanitizeDbForRole(db: NurseDatabase, role: AuthRole): NurseDatabase {
  if (role === 'admin') {
    return {
      ...db,
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
      settings: db.settings,
      users: (db.users || []).map((u) => ({
        ...u,
        password: '',
      })),
    };
  }
  if (role === 'nurse') {
    return {
      students: db.students,
      classes: db.classes,
      visits: db.visits,
      measurements: db.measurements,
      healthProfiles: db.healthProfiles,
      dispatches: db.dispatches,
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
      settings: db.settings,
      users: [],
    };
  }
  // Hostel Warden: strictly excluded from Inventory, Stock Transactions, Bills, Clinical Programs (Doctor Visits, OPD, Camps, Annual Checkups, Menstrual Log), and Staff Users
  return {
    students: db.students,
    classes: db.classes,
    visits: db.visits,
    measurements: db.measurements,
    healthProfiles: db.healthProfiles,
    dispatches: db.dispatches,
    medicines: [],
    items: [],
    stockTransactions: [],
    bills: [],
    doctorVisits: [],
    doctorVisitCases: [],
    opdRecords: [],
    medicalCamps: [],
    campScreenings: [],
    annualCheckups: [],
    menstrualLogs: [],
    settings: db.settings,
    users: [],
  };
}

export function sanitizeStateForRole(
  state: {
    db: NurseDatabase;
    appsScriptUrl: string;
    autoSyncEnabled: boolean;
    updatedAt: string;
  },
  role: AuthRole,
  defaultAppsScriptUrl: string
): {
  db: NurseDatabase;
  appsScriptUrl?: string;
  isCustomAppsScriptUrl?: boolean;
  autoSyncEnabled: boolean;
  updatedAt: string;
} {
  const safeDb = sanitizeDbForRole(state.db, role);
  if (role === 'admin') {
    return {
      db: safeDb,
      appsScriptUrl: state.appsScriptUrl,
      isCustomAppsScriptUrl:
        Boolean(state.appsScriptUrl) &&
        state.appsScriptUrl.trim() !== defaultAppsScriptUrl.trim(),
      autoSyncEnabled: state.autoSyncEnabled,
      updatedAt: state.updatedAt,
    };
  }
  return {
    db: safeDb,
    autoSyncEnabled: state.autoSyncEnabled,
    updatedAt: state.updatedAt,
  };
}

const NURSE_ALLOWED_MUTATIONS = new Set([
  'recordVisit',
  'createVisit',
  'createStudent',
  'bulkImportStudents',
  'addMeasurement',
  'addHealthProfile',
  'updateDispatchStatus',
  'upsertMedicine',
  'deleteMedicine',
  'upsertItem',
  'deleteItem',
  'adjustStock',
  'createBill',
  'updateBill',
  'deleteBill',
  'upsertDoctorVisit',
  'deleteDoctorVisit',
  'upsertDoctorVisitCase',
  'deleteDoctorVisitCase',
  'createOpd',
  'updateOpd',
  'deleteOpd',
  'upsertMedicalCamp',
  'deleteMedicalCamp',
  'upsertCampScreening',
  'deleteCampScreening',
  'upsertAnnualCheckup',
  'deleteAnnualCheckup',
  'upsertMenstrualLog',
  'deleteMenstrualLog',
]);

const WARDEN_ALLOWED_MUTATIONS = new Set([
  'dispatchStudent',
  'updateDispatchStatus',
]);

const ADMIN_ALLOWED_MUTATIONS = new Set([
  ...NURSE_ALLOWED_MUTATIONS,
  ...WARDEN_ALLOWED_MUTATIONS,
  'updateStudent',
  'createClass',
  'renameClass',
  'deleteClass',
  'upsertUser',
  'deleteUser',
  'updateSchoolHours',
]);

export function isMutationAllowedForRole(
  action: string,
  role: AuthRole,
  body?: Record<string, unknown>
): boolean {
  if (role === 'admin') {
    return ADMIN_ALLOWED_MUTATIONS.has(action);
  }
  if (role === 'nurse') {
    if (!NURSE_ALLOWED_MUTATIONS.has(action)) return false;
    if (action === 'bulkImportStudents' && Boolean(body?.replaceAll)) {
      return false;
    }
    return true;
  }
  if (role === 'warden') {
    return WARDEN_ALLOWED_MUTATIONS.has(action);
  }
  return false;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function hasForbiddenPrototypeKeys(value: unknown, depth: number = 0): boolean {
  if (depth > 8 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenPrototypeKeys(item, depth + 1));
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (hasForbiddenPrototypeKeys((value as Record<string, unknown>)[key], depth + 1)) {
      return true;
    }
  }
  return false;
}

/**
 * Rejects null bytes and dangerous ASCII control characters (except tab/newline/CR)
 * anywhere in incoming JSON payloads to prevent injection and parser smuggling.
 */
export function hasDangerousControlChars(value: unknown, depth: number = 0): boolean {
  if (depth > 8 || value === null || value === undefined) return false;
  if (typeof value === 'string') {
    // eslint-disable-next-line no-control-regex
    return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasDangerousControlChars(item, depth + 1));
  }
  if (typeof value === 'object') {
    for (const val of Object.values(value as Record<string, unknown>)) {
      if (hasDangerousControlChars(val, depth + 1)) return true;
    }
  }
  return false;
}

export function isValidStaffUsername(username: string): boolean {
  return /^[a-z0-9._-]{2,40}$/.test(username);
}
