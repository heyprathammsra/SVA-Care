import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInitialSeedDatabase, DEFAULT_APPS_SCRIPT_URL } from './src/utils/seedData.ts';
import {
  normalizeSectionName,
  normalizeSheetSyncPayload,
  normalizeDatetimeString,
  normalizeDateOnlyString,
  normalizeTimeOnlyString,
  type NurseDatabase,
  type StudentRecord,
  type VisitRecord,
  type MeasurementRecord,
  type HealthProfileRecord,
} from './src/utils/nurseLogic.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'school-nurse-state.json');

interface ServerState {
  db: NurseDatabase;
  appsScriptUrl: string;
  autoSyncEnabled: boolean;
  updatedAt: string;
}

function normalizeDbSections(db: NurseDatabase): NurseDatabase {
  return {
    students: (db.students || []).map((s) => ({
      ...s,
      section: normalizeSectionName(s.section),
    })),
    visits: (db.visits || []).map((v) => ({
      ...v,
      visit_datetime: normalizeDatetimeString(v.visit_datetime),
      administration_time: normalizeTimeOnlyString(v.administration_time),
    })),
    measurements: (db.measurements || []).map((m) => ({
      ...m,
      measurement_date: normalizeDateOnlyString(m.measurement_date),
    })),
    healthProfiles: (db.healthProfiles || []).map((h) => ({
      ...h,
      date_recorded: normalizeDateOnlyString(h.date_recorded),
      last_reviewed: normalizeDateOnlyString(h.last_reviewed),
    })),
  };
}

function loadServerState(): ServerState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<ServerState>;
      if (parsed && parsed.db && Array.isArray(parsed.db.students)) {
        const loaded: ServerState = {
          db: normalizeDbSections(parsed.db),
          appsScriptUrl: DEFAULT_APPS_SCRIPT_URL,
          autoSyncEnabled: true,
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
        saveServerState(loaded);
        return loaded;
      }
    }
  } catch (err) {
    console.error('Failed to read server state file, initializing fresh seed database:', err);
  }

  const initial: ServerState = {
    db: normalizeDbSections(createInitialSeedDatabase()),
    appsScriptUrl: DEFAULT_APPS_SCRIPT_URL,
    autoSyncEnabled: true,
    updatedAt: new Date().toISOString(),
  };
  saveServerState(initial);
  return initial;
}

function saveServerState(state: ServerState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist server state:', err);
  }
}

let serverState: ServerState = loadServerState();

// Track connected SSE clients for instant multi-device real-time sync
const sseClients = new Set<express.Response>();

function broadcastStateUpdate(sourceDeviceId: string = '') {
  const payload = JSON.stringify({
    type: 'state-update',
    sourceDeviceId,
    db: serverState.db,
    appsScriptUrl: serverState.appsScriptUrl,
    autoSyncEnabled: serverState.autoSyncEnabled,
    updatedAt: serverState.updatedAt,
  });
  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function forwardToAppsScript(payload: Record<string, unknown>): Promise<boolean> {
  const url = serverState.appsScriptUrl.trim();
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (data && data.status === 'error') {
      const msg = String(data.message || '');
      if (msg.toLowerCase().includes('duplicate')) {
        return true;
      }
      console.error('Google Apps Script error for action', payload.action, ':', msg);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Background Google Sheets forward error:', err);
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
    const ok = await forwardToAppsScript({ action: 'createVisit', visit });
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
    const ok = await forwardToAppsScript({ action: 'addMeasurement', measurement });
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
    const ok = await forwardToAppsScript({ action: 'addHealthProfile', healthProfile });
    if (ok) {
      remoteProfileIds.add(healthProfile.health_record_id);
      pushedCount++;
    }
  }

  return pushedCount;
}

let isSyncingWithSheets = false;

async function pullFromAppsScript(): Promise<{ ok: boolean; message: string }> {
  const url = serverState.appsScriptUrl.trim();
  if (!url) {
    return { ok: false, message: 'No Google Apps Script URL configured yet.' };
  }
  if (isSyncingWithSheets) {
    return {
      ok: true,
      message: `Synced with Google Sheets (${serverState.db.students.length} students, ${serverState.db.visits.length} visits).`,
    };
  }

  isSyncingWithSheets = true;
  try {
    const separator = url.includes('?') ? '&' : '?';
    const response = await fetch(`${url}${separator}action=getAll&t=${Date.now()}`, {
      method: 'GET',
      redirect: 'follow',
    });
    if (!response.ok) {
      return { ok: false, message: `Google Sheet returned HTTP ${response.status}` };
    }
    const data = (await response.json()) as Record<string, unknown>;
    if (!data || data.status !== 'ok') {
      return { ok: false, message: String(data?.message || 'Invalid response from Google Sheet') };
    }

    const remotePayload = {
      students: data.students as Array<Partial<StudentRecord>>,
      visits: data.visits as Array<Partial<VisitRecord>>,
      measurements: data.measurements as Array<
        Partial<Record<keyof MeasurementRecord, string | number>>
      >,
      healthProfiles: data.healthProfiles as Array<Partial<HealthProfileRecord>>,
    };

    serverState.db = normalizeDbSections(
      normalizeSheetSyncPayload(remotePayload, serverState.db)
    );
    saveServerState(serverState);
    broadcastStateUpdate('sheets-sync');

    // Automatically push any local/server visits, measurements, or health profiles missing from the Sheet
    await pushMissingToAppsScript(remotePayload);

    return {
      ok: true,
      message: `Synced with Google Sheets (${serverState.db.students.length} students, ${serverState.db.visits.length} visits).`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Could not reach Google Sheets.',
    };
  } finally {
    isSyncingWithSheets = false;
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  // 1. Get shared school state (used by any phone/laptop on load)
  app.get('/api/state', (_req, res) => {
    res.json({
      status: 'ok',
      db: serverState.db,
      appsScriptUrl: serverState.appsScriptUrl,
      autoSyncEnabled: serverState.autoSyncEnabled,
      connectedDevices: sseClients.size,
      updatedAt: serverState.updatedAt,
    });
  });

  // 2. Real-time Server-Sent Events (SSE) stream so all phones/laptops stay in sync
  app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);

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
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // 3. Apply idempotent mutations from any school device and forward to Google Sheets
  app.post('/api/mutate', async (req, res) => {
    const body = req.body || {};
    const action = String(body.action || '');
    const deviceId = String(body.deviceId || '');

    if ((action === 'recordVisit' || action === 'createVisit') && body.visit) {
      const rawVisit = body.visit as VisitRecord;
      const visit: VisitRecord = {
        ...rawVisit,
        visit_datetime: normalizeDatetimeString(rawVisit.visit_datetime),
        administration_time: normalizeTimeOnlyString(rawVisit.administration_time),
      };
      const exists = serverState.db.visits.some((v) => v.visit_id === visit.visit_id);
      if (!exists) {
        serverState.db.visits = [visit, ...serverState.db.visits];
        saveServerState(serverState);
        broadcastStateUpdate(deviceId);
      }
      // Always ensure the visit is pushed to Google Sheets using 'createVisit'
      const sheetSynced = await forwardToAppsScript({ action: 'createVisit', visit });
      return res.json({
        status: 'ok',
        sheetSynced,
        db: serverState.db,
        updatedAt: serverState.updatedAt,
      });
    }

    if (action === 'createStudent' && body.student) {
      const rawStudent = body.student as StudentRecord;
      const student: StudentRecord = {
        ...rawStudent,
        section: normalizeSectionName(rawStudent.section),
      };
      const exists = serverState.db.students.some((s) => s.student_id === student.student_id);
      if (!exists) {
        serverState.db.students = [...serverState.db.students, student];
        saveServerState(serverState);
        broadcastStateUpdate(deviceId);
      }
      const sheetSynced = await forwardToAppsScript({ action: 'createStudent', student });
      return res.json({
        status: 'ok',
        sheetSynced,
        db: serverState.db,
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
      saveServerState(serverState);
      broadcastStateUpdate(deviceId);
      if (newlyAdded.length > 0) {
        void (async () => {
          for (const student of newlyAdded) {
            await forwardToAppsScript({ action: 'createStudent', student });
          }
        })();
      }
      return res.json({ status: 'ok', db: serverState.db, updatedAt: serverState.updatedAt });
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
        saveServerState(serverState);
        broadcastStateUpdate(deviceId);
      }
      const sheetSynced = await forwardToAppsScript({ action: 'addMeasurement', measurement });
      return res.json({
        status: 'ok',
        sheetSynced,
        db: serverState.db,
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
        saveServerState(serverState);
        broadcastStateUpdate(deviceId);
      }
      const sheetSynced = await forwardToAppsScript({
        action: 'addHealthProfile',
        healthProfile,
      });
      return res.json({
        status: 'ok',
        sheetSynced,
        db: serverState.db,
        updatedAt: serverState.updatedAt,
      });
    }

    return res.status(400).json({ status: 'error', message: `Unsupported action: ${action}` });
  });

  // 4. Shared school configuration (Apps Script URL is locked to the school's official deployment)
  app.post('/api/config', async (req, res) => {
    const body = req.body || {};
    serverState.appsScriptUrl = DEFAULT_APPS_SCRIPT_URL;
    serverState.autoSyncEnabled = true;
    saveServerState(serverState);
    broadcastStateUpdate(String(body.deviceId || 'config'));

    if (serverState.appsScriptUrl && body.triggerSync) {
      const syncResult = await pullFromAppsScript();
      return res.json({
        status: 'ok',
        syncResult,
        db: serverState.db,
        appsScriptUrl: serverState.appsScriptUrl,
        autoSyncEnabled: serverState.autoSyncEnabled,
      });
    }

    return res.json({
      status: 'ok',
      db: serverState.db,
      appsScriptUrl: serverState.appsScriptUrl,
      autoSyncEnabled: serverState.autoSyncEnabled,
    });
  });

  // 5. Pull latest records from Google Sheets & push any missing local records
  app.post('/api/sheets-sync', async (_req, res) => {
    const result = await pullFromAppsScript();
    res.json({
      status: result.ok ? 'ok' : 'error',
      message: result.message,
      db: serverState.db,
      updatedAt: serverState.updatedAt,
    });
  });

  // 6. Push full shared database to Google Sheets (via pull + individual missing record push)
  app.post('/api/sheets-push', async (_req, res) => {
    const result = await pullFromAppsScript();
    if (!result.ok) {
      return res.status(502).json({
        status: 'error',
        message: result.message,
      });
    }
    return res.json({
      status: 'ok',
      message: `Synced all ${serverState.db.students.length} students & ${serverState.db.visits.length} visits with Google Sheets.`,
      db: serverState.db,
      updatedAt: serverState.updatedAt,
    });
  });

  // Initial sync on server startup
  void pullFromAppsScript();

  // Automated background Google Sheets sync on the server (every 15s)
  setInterval(() => {
    if (serverState.appsScriptUrl && serverState.autoSyncEnabled) {
      void pullFromAppsScript();
    }
  }, 15000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Saraswati Vidya Academy Infirmary Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
