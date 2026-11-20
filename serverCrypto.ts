import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  NurseDatabase,
  StudentRecord,
  VisitRecord,
  MeasurementRecord,
  HealthProfileRecord,
  WardenDispatchRecord,
  AppUserRecord,
} from './src/utils/nurseLogic.ts';

export const RUNTIME_DATA_DIR =
  (process.env.DATA_DIR || '').trim() || path.join(os.tmpdir(), 'sva-infirmary-data');
const DATA_DIR = RUNTIME_DATA_DIR;
const LOCAL_KEY_FILE = path.join(DATA_DIR, '.master.key');

const SCRYPT_PREFIX = 'scrypt$v1$';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

const ENC_PREFIX = 'enc:v1:';

export type EncryptionKeySource = 'env' | 'local-keyfile';

let cachedMasterKey: Buffer | null = null;
let cachedKeySource: EncryptionKeySource = 'local-keyfile';
let cachedFieldKey: Buffer | null = null;
let cachedDiskKey: Buffer | null = null;

function deriveHkdfKey(ikm: Buffer, salt: string, info: string, length: number = 32): Buffer {
  const derived = crypto.hkdfSync(
    'sha256',
    ikm,
    Buffer.from(salt, 'utf8'),
    Buffer.from(info, 'utf8'),
    length
  );
  return Buffer.from(derived);
}

function loadOrCreateMasterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;

  const envKey = (process.env.DATA_ENCRYPTION_KEY || '').trim();
  if (envKey.length >= 16) {
    cachedMasterKey = deriveHkdfKey(
      Buffer.from(envKey, 'utf8'),
      'sva-infirmary-master-v1',
      'env-master-key',
      32
    );
    cachedKeySource = 'env';
    return cachedMasterKey;
  }

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    }
    if (fs.existsSync(LOCAL_KEY_FILE)) {
      const hex = fs.readFileSync(LOCAL_KEY_FILE, 'utf8').trim();
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        cachedMasterKey = Buffer.from(hex, 'hex');
        cachedKeySource = 'local-keyfile';
        return cachedMasterKey;
      }
    }
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(LOCAL_KEY_FILE, generated.toString('hex'), {
      encoding: 'utf8',
      mode: 0o600,
    });
    try {
      fs.chmodSync(LOCAL_KEY_FILE, 0o600);
    } catch {
      // Ignore chmod errors on non-POSIX filesystems
    }
    cachedMasterKey = generated;
    cachedKeySource = 'local-keyfile';
    return cachedMasterKey;
  } catch {
    // Fallback to ephemeral process key if filesystem is read-only
    cachedMasterKey = crypto.randomBytes(32);
    cachedKeySource = 'local-keyfile';
    return cachedMasterKey;
  }
}

function getFieldEncryptionKey(): Buffer {
  if (!cachedFieldKey) {
    cachedFieldKey = deriveHkdfKey(
      loadOrCreateMasterKey(),
      'sva-infirmary-hkdf-salt-v1',
      'aes-256-gcm-field-encryption',
      32
    );
  }
  return cachedFieldKey;
}

function getDiskEncryptionKey(): Buffer {
  if (!cachedDiskKey) {
    cachedDiskKey = deriveHkdfKey(
      loadOrCreateMasterKey(),
      'sva-infirmary-hkdf-salt-v1',
      'aes-256-gcm-disk-envelope',
      32
    );
  }
  return cachedDiskKey;
}

export function getCryptoPosture(): {
  passwordKdf: string;
  fieldCipher: string;
  diskCipher: string;
  keySource: EncryptionKeySource;
} {
  loadOrCreateMasterKey();
  return {
    passwordKdf: 'scrypt (N=16384, r=8, p=1, 128-bit salt, 512-bit key)',
    fieldCipher: 'AES-256-GCM (AEAD with per-record AAD)',
    diskCipher: 'AES-256-GCM (Encrypted local state envelope, 0600 permissions)',
    keySource: cachedKeySource,
  };
}

// ============================================================================
// 1. SALTED SCRYPT PASSWORD HASHING (MEMORY-HARD KDF)
// ============================================================================

export function isPasswordHash(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith(SCRYPT_PREFIX);
}

export function hashPassword(plaintext: string): string {
  const clean = String(plaintext || '').trim();
  if (!clean) return '';
  if (isPasswordHash(clean)) return clean;
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(clean, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `${SCRYPT_PREFIX}${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const digestB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

const DUMMY_SALT = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');

export function runDummyPasswordWork(input: string): void {
  crypto.scryptSync(input || 'dummy', DUMMY_SALT, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
}

export function verifyPassword(
  plaintextInput: string,
  storedValue: string
): { valid: boolean; needsRehash: boolean } {
  const cleanInput = String(plaintextInput || '').trim();
  const stored = String(storedValue || '').trim();
  if (!cleanInput || !stored) {
    runDummyPasswordWork(cleanInput);
    return { valid: false, needsRehash: false };
  }

  if (isPasswordHash(stored)) {
    const rest = stored.slice(SCRYPT_PREFIX.length);
    const parts = rest.split('$');
    if (parts.length !== 2) {
      runDummyPasswordWork(cleanInput);
      return { valid: false, needsRehash: false };
    }
    const [saltHex, keyHex] = parts;
    if (!/^[0-9a-f]{32}$/i.test(saltHex) || !/^[0-9a-f]{128}$/i.test(keyHex)) {
      runDummyPasswordWork(cleanInput);
      return { valid: false, needsRehash: false };
    }
    const salt = Buffer.from(saltHex, 'hex');
    const expectedKey = Buffer.from(keyHex, 'hex');
    const candidateKey = crypto.scryptSync(cleanInput, salt, SCRYPT_KEYLEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });
    const exactMatch = crypto.timingSafeEqual(candidateKey, expectedKey);
    if (exactMatch) {
      return { valid: true, needsRehash: false };
    }
    // Mobile keyboard auto-capitalization tolerance only for first letter
    if (cleanInput.length > 0 && cleanInput[0] === cleanInput[0].toUpperCase() && cleanInput[0] !== cleanInput[0].toLowerCase()) {
      const loweredFirst = cleanInput[0].toLowerCase() + cleanInput.slice(1);
      const mobileCandidate = crypto.scryptSync(loweredFirst, salt, SCRYPT_KEYLEN, {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
      });
      if (crypto.timingSafeEqual(mobileCandidate, expectedKey)) {
        return { valid: true, needsRehash: false };
      }
    }
    return { valid: false, needsRehash: false };
  }

  // Legacy plaintext compatibility (automatically flagged for scrypt upgrade on first login)
  const exactMatch = timingSafeStringEqual(stored, cleanInput);
  const mobileCapMatch =
    cleanInput.length > 0 &&
    cleanInput[0] === cleanInput[0].toUpperCase() &&
    cleanInput[0] !== cleanInput[0].toLowerCase() &&
    timingSafeStringEqual(stored, cleanInput[0].toLowerCase() + cleanInput.slice(1));

  if (exactMatch || mobileCapMatch) {
    return { valid: true, needsRehash: true };
  }
  return { valid: false, needsRehash: false };
}

export function ensureUsersHashed(users: AppUserRecord[]): { users: AppUserRecord[]; upgraded: boolean } {
  let upgraded = false;
  const next = users.map((u) => {
    if (u.password && !isPasswordHash(u.password)) {
      upgraded = true;
      return { ...u, password: hashPassword(u.password) };
    }
    return u;
  });
  return { users: next, upgraded };
}

// ============================================================================
// 2. AES-256-GCM AUTHENTICATED FIELD ENCRYPTION (NIST SP 800-38D)
// ============================================================================

export function isEncryptedField(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

function encryptWithKey(plaintext: string, key: Buffer, aad: string): string {
  const str = String(plaintext ?? '');
  if (!str) return '';
  if (isEncryptedField(str)) return str;

  const iv = crypto.randomBytes(12); // 96-bit NIST-recommended GCM IV
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf8'));
  }
  const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 128-bit authentication tag

  return `${ENC_PREFIX}${iv.toString('base64url')}:${authTag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decryptWithKey(value: string, key: Buffer, aad: string): string {
  const str = String(value ?? '');
  if (!str || !isEncryptedField(str)) return str;

  const parts = str.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) {
    return '[Encrypted data — invalid format]';
  }
  try {
    const iv = Buffer.from(parts[0], 'base64url');
    const authTag = Buffer.from(parts[1], 'base64url');
    const ciphertext = Buffer.from(parts[2], 'base64url');
    if (iv.length !== 12 || authTag.length !== 16) {
      return '[Encrypted data — invalid envelope]';
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    if (aad) {
      decipher.setAAD(Buffer.from(aad, 'utf8'));
    }
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '[Encrypted record — key mismatch or modified]';
  }
}

export function encryptField(plaintext: string, aad: string = '', customKey?: Buffer): string {
  return encryptWithKey(plaintext, customKey || getFieldEncryptionKey(), aad);
}

export function decryptField(value: string, aad: string = '', customKey?: Buffer): string {
  return decryptWithKey(value, customKey || getFieldEncryptionKey(), aad);
}

// ============================================================================
// 3. RECORD-LEVEL CLINICAL FIELD ENCRYPTION / DECRYPTION
// ============================================================================

export function encryptVisitForStorage(visit: VisitRecord): VisitRecord {
  const aad = `visit:${visit.visit_id}`;
  return {
    ...visit,
    reason: encryptField(visit.reason, aad),
    observations: encryptField(visit.observations, aad),
    action_taken: encryptField(visit.action_taken, aad),
    medicine_name:
      visit.medicine_status === 'given' && visit.medicine_name
        ? encryptField(visit.medicine_name, aad)
        : visit.medicine_name,
    dosage: encryptField(visit.dosage, aad),
    notes: encryptField(visit.notes, aad),
  };
}

export function decryptVisitFromStorage<T extends Partial<VisitRecord>>(visit: T): T {
  const visitId = String(visit.visit_id || '').trim();
  const aad = `visit:${visitId}`;
  return {
    ...visit,
    ...(typeof visit.reason === 'string' ? { reason: decryptField(visit.reason, aad) } : {}),
    ...(typeof visit.observations === 'string'
      ? { observations: decryptField(visit.observations, aad) }
      : {}),
    ...(typeof visit.action_taken === 'string'
      ? { action_taken: decryptField(visit.action_taken, aad) }
      : {}),
    ...(typeof visit.medicine_name === 'string'
      ? { medicine_name: decryptField(visit.medicine_name, aad) }
      : {}),
    ...(typeof visit.dosage === 'string' ? { dosage: decryptField(visit.dosage, aad) } : {}),
    ...(typeof visit.notes === 'string' ? { notes: decryptField(visit.notes, aad) } : {}),
  };
}

export function encryptMeasurementForStorage(measurement: MeasurementRecord): MeasurementRecord {
  const aad = `measurement:${measurement.measurement_id}`;
  return {
    ...measurement,
    notes: encryptField(measurement.notes, aad),
  };
}

export function decryptMeasurementFromStorage<
  T extends Partial<Record<keyof MeasurementRecord, string | number>>,
>(measurement: T): T {
  const measId = String(measurement.measurement_id || '').trim();
  const aad = `measurement:${measId}`;
  if (typeof measurement.notes === 'string') {
    return {
      ...measurement,
      notes: decryptField(measurement.notes, aad),
    };
  }
  return measurement;
}

export function encryptHealthProfileForStorage(profile: HealthProfileRecord): HealthProfileRecord {
  const aad = `health:${profile.health_record_id}`;
  return {
    ...profile,
    condition_or_note: encryptField(profile.condition_or_note, aad),
  };
}

export function decryptHealthProfileFromStorage<T extends Partial<HealthProfileRecord>>(
  profile: T
): T {
  const recId = String(profile.health_record_id || '').trim();
  const aad = `health:${recId}`;
  if (typeof profile.condition_or_note === 'string') {
    return {
      ...profile,
      condition_or_note: decryptField(profile.condition_or_note, aad),
    };
  }
  return profile;
}

export function encryptDispatchForStorage(dispatch: WardenDispatchRecord): WardenDispatchRecord {
  const aad = `dispatch:${dispatch.dispatch_id}`;
  return {
    ...dispatch,
    reason: encryptField(dispatch.reason || '', aad),
    notes: encryptField(dispatch.notes || '', aad),
  };
}

export function decryptDispatchFromStorage<T extends Partial<WardenDispatchRecord>>(
  dispatch: T
): T {
  const dspId = String(dispatch.dispatch_id || '').trim();
  const aad = `dispatch:${dspId}`;
  return {
    ...dispatch,
    ...(typeof dispatch.reason === 'string' ? { reason: decryptField(dispatch.reason, aad) } : {}),
    ...(typeof dispatch.notes === 'string' ? { notes: decryptField(dispatch.notes, aad) } : {}),
  };
}

export function encryptDatabaseForSheets(db: NurseDatabase): NurseDatabase {
  const { users: hashedUsers } = ensureUsersHashed(db.users || []);
  return {
    ...db,
    visits: (db.visits || []).map(encryptVisitForStorage),
    measurements: (db.measurements || []).map(encryptMeasurementForStorage),
    healthProfiles: (db.healthProfiles || []).map(encryptHealthProfileForStorage),
    dispatches: (db.dispatches || []).map(encryptDispatchForStorage),
    users: hashedUsers,
  };
}

export function decryptRemoteSheetPayload(remote: {
  students?: Array<Partial<StudentRecord>>;
  visits?: Array<Partial<VisitRecord>>;
  measurements?: Array<Partial<Record<keyof MeasurementRecord, string | number>>>;
  healthProfiles?: Array<Partial<HealthProfileRecord>>;
  users?: Array<Record<string, unknown>>;
}) {
  return {
    students: remote.students,
    visits: Array.isArray(remote.visits)
      ? remote.visits.map((v) => decryptVisitFromStorage(v))
      : undefined,
    measurements: Array.isArray(remote.measurements)
      ? remote.measurements.map((m) => decryptMeasurementFromStorage(m))
      : undefined,
    healthProfiles: Array.isArray(remote.healthProfiles)
      ? remote.healthProfiles.map((h) => decryptHealthProfileFromStorage(h))
      : undefined,
    users: remote.users,
  };
}

// ============================================================================
// 4. LOCAL STATE FILE ENCRYPTION AT REST (AES-256-GCM ENVELOPE)
// ============================================================================

interface EncryptedDiskEnvelope {
  encrypted: true;
  version: 1;
  cipher: 'aes-256-gcm';
  payload: string;
}

const DISK_ENVELOPE_AAD = 'sva-infirmary-state-file-v1';

export function encryptStateFileEnvelope(jsonString: string): string {
  const encryptedPayload = encryptWithKey(jsonString, getDiskEncryptionKey(), DISK_ENVELOPE_AAD);
  const envelope: EncryptedDiskEnvelope = {
    encrypted: true,
    version: 1,
    cipher: 'aes-256-gcm',
    payload: encryptedPayload,
  };
  return JSON.stringify(envelope, null, 2);
}

export function decryptStateFileEnvelope(rawFileContent: string): string {
  const parsed = JSON.parse(rawFileContent) as Partial<EncryptedDiskEnvelope>;
  if (parsed && parsed.encrypted === true && typeof parsed.payload === 'string') {
    const decrypted = decryptWithKey(parsed.payload, getDiskEncryptionKey(), DISK_ENVELOPE_AAD);
    if (!decrypted.startsWith('{')) {
      throw new Error('Failed to decrypt local state envelope (invalid key or tampered file).');
    }
    return decrypted;
  }
  // Legacy unencrypted state JSON — return as-is so server upgrades it to encrypted format on save
  return rawFileContent;
}
