import React, { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from 'react';
import {
  Search,
  Plus,
  Printer,
  ArrowRight,
  ArrowLeft,
  X,
  Clock,
  Home,
  Users,
  ClipboardList,
  HeartPulse,
  LogOut,
  Bell,
  Send,
  Check,
  Download,
  ShieldCheck,
  FileSpreadsheet,
} from 'lucide-react';
import {
  generatePermanentId,
  searchStudents,
  formatMedicineDisplay,
  formatTimeFromDatetime,
  extractDatePart,
  getDailyVisitLog,
  getStudentMeasurements,
  normalizeSectionName,
  sanitizeClassSectionName,
  getAllClassSections,
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
  type WardenDispatchRecord,
  type AppUserRecord,
  type VisitFormInput,
  type DailyLogEntry,
} from './utils/nurseLogic';
import {
  getTodayLocalDateString,
  SCHOOL_NAME,
  SCHOOL_LOGO_URL,
  SCHOOL_LOGO_FALLBACK_URL,
  DEFAULT_STAFF_NAME,
} from './utils/seedData';
import { VisitEntryForm } from './components/VisitEntryForm';
import { StudentProfileView } from './components/StudentProfileView';
import { DailyLogView } from './components/DailyLogView';
import {
  SheetsSetupView,
  type SheetsActionResult,
  type DownloadableExcelTab,
} from './components/SheetsSetupView';
import { AdminPanelView, type AdminActionResult } from './components/AdminPanelView';
import { PrintableReport, type PrintReportConfig } from './components/PrintableReport';
import { AuthScreen, type LoginSuccessPayload } from './components/AuthScreen';
import { WardenPortalView } from './components/WardenPortalView';
import { CustomSelect } from './components/CustomSelect';
import { ModalDialog } from './components/ModalDialog';
import { type AuthUser } from './utils/auth';

type ActiveScreen = 'home' | 'new-visit' | 'students' | 'daily-log' | 'sheets-setup' | 'admin-panel';
type RosterFilterMode = 'all' | 'visited-today' | 'health-notes';

const EMPTY_DB: NurseDatabase = {
  students: [],
  classes: [],
  visits: [],
  measurements: [],
  healthProfiles: [],
  dispatches: [],
  users: [],
};

const LEGACY_STORAGE_KEYS = [
  'sva_infirmary_db_v7',
  'sva_infirmary_db_v6',
  'sva_infirmary_db_v5',
  'sva_nurse_room_db_v5',
  'sva_nurse_room_db_v4',
  'sva_infirmary_apps_script_url_v1',
];

function scrubLegacyLocalStorage(): void {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors
  }
}

function normalizeDatabaseSections(inputDb: NurseDatabase): NurseDatabase {
  const seenStudentSlots = new Set<string>();
  const seenStudentIds = new Set<string>();
  const students: StudentRecord[] = [];
  for (const s of inputDb.students || []) {
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
  for (const v of inputDb.visits || []) {
    if (!v.visit_id || PURGED_TEST_VISIT_IDS.has(v.visit_id) || seenVisitIds.has(v.visit_id)) {
      continue;
    }
    seenVisitIds.add(v.visit_id);
    visits.push({
      ...v,
      visit_datetime: normalizeDatetimeString(v.visit_datetime),
      administration_time: normalizeTimeOnlyString(v.administration_time),
    });
  }

  const seenMeasIds = new Set<string>();
  const measurements: MeasurementRecord[] = [];
  for (const m of inputDb.measurements || []) {
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
  for (const h of inputDb.healthProfiles || []) {
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

  const dispatches = Array.isArray(inputDb.dispatches) ? inputDb.dispatches : [];
  const users = Array.isArray(inputDb.users) ? inputDb.users : [];
  const classes = getAllClassSections(students, inputDb.classes);

  return { students, classes, visits, measurements, healthProfiles, dispatches, users };
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const authTokenRef = useRef<string | null>(null);
  const lastServerUpdatedAtRef = useRef<string>('');
  const lastSheetsSyncRef = useRef<{ at: string; formatted: string } | null>(null);
  const activeScreenRef = useRef<ActiveScreen>('home');
  const [deviceId] = useState<string>(() => `dev-${Math.random().toString(36).slice(2, 10)}`);

  // Memory-only database populated strictly AFTER server authentication (zero PHI/passwords in localStorage)
  const [db, setDb] = useState<NurseDatabase>(EMPTY_DB);

  const [appsScriptUrl, setAppsScriptUrl] = useState<string>('');
  const [isCustomAppsScriptUrl, setIsCustomAppsScriptUrl] = useState<boolean>(false);

  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);

  const [activeScreen, setActiveScreen] = useState<ActiveScreen>(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'students') return 'students';
    if (hash === 'daily-log') return 'daily-log';
    if (hash === 'downloads' || hash === 'sheets-setup') return 'sheets-setup';
    if (hash === 'admin' || hash === 'admin-panel') return 'admin-panel';
    if (hash === 'new-visit' || hash === 'record') return 'new-visit';
    return 'home';
  });
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [preselectedStudentIdForVisit, setPreselectedStudentIdForVisit] = useState<string>('');
  const [preselectedReasonForVisit, setPreselectedReasonForVisit] = useState<string>('');
  const [preselectedNotesForVisit, setPreselectedNotesForVisit] = useState<string>('');
  const [selectedProfileStudentId, setSelectedProfileStudentId] = useState<string | null>(null);
  const [printReportConfig, setPrintReportConfig] = useState<PrintReportConfig | null>(null);
  const [showIncomingDispatches, setShowIncomingDispatches] = useState(false);

  // Sync hash changes with activeScreen for browser navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'students') setActiveScreen('students');
      else if (hash === 'daily-log') setActiveScreen('daily-log');
      else if (hash === 'downloads' || hash === 'sheets-setup') setActiveScreen('sheets-setup');
      else if (hash === 'admin' || hash === 'admin-panel') setActiveScreen('admin-panel');
      else if (hash === 'new-visit' || hash === 'record') setActiveScreen('new-visit');
      else if (hash === 'home' || !hash) setActiveScreen('home');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [homeSearchQuery, setHomeSearchQuery] = useState('');
  const deferredHomeSearchQuery = useDeferredValue(homeSearchQuery);
  const [homeSectionFilter, setHomeSectionFilter] = useState<string>('ALL');
  const [rosterFilter, setRosterFilter] = useState<RosterFilterMode>('all');
  const [mobileHomeTab, setMobileHomeTab] = useState<'roster' | 'visits'>('roster');

  // Scrub any legacy browser localStorage caches immediately on mount
  useEffect(() => {
    scrubLegacyLocalStorage();
  }, []);

  // Scroll cleanly to top when changing top-level screen & show latest automated sync timestamp on Sheets screen
  useEffect(() => {
    activeScreenRef.current = activeScreen;
    if (activeScreen === 'sheets-setup' && lastSheetsSyncRef.current) {
      setSyncStatusMessage(lastSheetsSyncRef.current.formatted);
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeScreen]);

  const handleLogout = useCallback(() => {
    const token = authTokenRef.current;
    authTokenRef.current = null;
    lastServerUpdatedAtRef.current = '';
    lastSheetsSyncRef.current = null;
    setAuthToken(null);
    setCurrentUser(null);
    setDb(EMPTY_DB);
    setAppsScriptUrl('');
    setIsCustomAppsScriptUrl(false);
    setSyncStatusMessage(null);
    setShowIncomingDispatches(false);
    setPrintReportConfig(null);
    scrubLegacyLocalStorage();
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  }, []);

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const token = authTokenRef.current;
      const headers = new Headers(options.headers || {});
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401 && authTokenRef.current) {
        handleLogout();
      }
      return res;
    },
    [handleLogout]
  );

  const safeFetchJson = useCallback(
    async (url: string, options?: RequestInit): Promise<Record<string, unknown> | null> => {
      try {
        const res = await authFetch(url, options);
        if (!res.ok) return null;
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) return null;
        const parsed = await res.json();
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    },
    [authFetch]
  );

  const applyServerStateIfChanged = useCallback(
    (data: Record<string, unknown>, forceUpdate: boolean = false) => {
      const incomingUpdatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : '';
      if (typeof data.appsScriptUrl === 'string') {
        setAppsScriptUrl(data.appsScriptUrl);
      }
      if (typeof data.isCustomAppsScriptUrl === 'boolean') {
        setIsCustomAppsScriptUrl(data.isCustomAppsScriptUrl);
      }
      if (typeof data.autoSyncEnabled === 'boolean') {
        setAutoSyncEnabled(data.autoSyncEnabled);
      }
      if (
        typeof data.lastSheetsSyncAt === 'string' &&
        typeof data.lastSheetsSyncMessage === 'string' &&
        data.lastSheetsSyncAt !== lastSheetsSyncRef.current?.at
      ) {
        const syncedDate = new Date(data.lastSheetsSyncAt);
        const timeStr = Number.isNaN(syncedDate.getTime())
          ? ''
          : syncedDate.toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
            });
        const formatted = timeStr
          ? `${data.lastSheetsSyncMessage} (${timeStr})`
          : data.lastSheetsSyncMessage;
        lastSheetsSyncRef.current = { at: data.lastSheetsSyncAt, formatted };
        if (activeScreenRef.current === 'sheets-setup') {
          setSyncStatusMessage(formatted);
        }
      }
      if (
        !forceUpdate &&
        incomingUpdatedAt &&
        incomingUpdatedAt === lastServerUpdatedAtRef.current
      ) {
        // Nothing changed on server — skip React re-render to keep scrolling completely smooth
        return;
      }
      if (incomingUpdatedAt) {
        lastServerUpdatedAtRef.current = incomingUpdatedAt;
      }
      if (data.db) {
        setDb(normalizeDatabaseSections(data.db as NurseDatabase));
      }
    },
    []
  );

  // Connect to authenticated real-time SSE stream via single-use ticket (session token never in URL)
  useEffect(() => {
    if (!currentUser || !authToken) return;
    let isMounted = true;
    let es: EventSource | null = null;

    const openSecureStream = async () => {
      const ticketData = await safeFetchJson('/api/auth/stream-ticket', { method: 'POST' });
      if (!isMounted || !ticketData || typeof ticketData.ticket !== 'string') return;
      try {
        es = new EventSource(`/api/stream?ticket=${encodeURIComponent(ticketData.ticket)}`);
        es.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as Record<string, unknown>;
            if (msg && msg.type === 'state-update' && msg.sourceDeviceId !== deviceId && msg.db) {
              applyServerStateIfChanged(msg, true);
            }
          } catch {
            // Ignore malformed event
          }
        };
        es.onerror = () => {
          // Close cleanly on proxy disconnect; periodic /api/state polling keeps data fresh without error spam
          es?.close();
          es = null;
        };
      } catch {
        // Fallback if EventSource unavailable
      }
    };

    void openSecureStream();

    return () => {
      isMounted = false;
      es?.close();
    };
  }, [deviceId, currentUser, authToken, safeFetchJson, applyServerStateIfChanged]);

  const handleManualSheetsSync = async (): Promise<void> => {
    const sData = await safeFetchJson('/api/sheets-sync', { method: 'POST' });
    const timeStr = new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
    if (sData && sData.db) {
      applyServerStateIfChanged(sData, true);
      const msg =
        typeof sData.message === 'string' && sData.message
          ? sData.message
          : 'Synced with Google Sheets.';
      setSyncStatusMessage(`${msg} (${timeStr})`);
    } else {
      setSyncStatusMessage(
        `Unable to reach Google Sheets right now. Local school records are active. (${timeStr})`
      );
    }
  };

  const handleUpdateAppsScriptUrl = async (
    newUrl: string,
    options?: { resetDefault?: boolean; pushBackup?: boolean }
  ): Promise<SheetsActionResult> => {
    const timeStr = new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
    try {
      const res = await authFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appsScriptUrl: options?.resetDefault ? undefined : newUrl,
          resetDefaultUrl: Boolean(options?.resetDefault),
          pushBackup: Boolean(options?.pushBackup),
          triggerSync: true,
          deviceId,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? ((await res.json()) as Record<string, unknown>)
        : null;

      if (!res.ok || !data || data.status !== 'ok') {
        const errMsg =
          (data && typeof data.message === 'string' && data.message) ||
          'Unable to save Apps Script link. Please verify the URL and try again.';
        return { ok: false, message: errMsg };
      }

      applyServerStateIfChanged(data, true);
      const msg =
        typeof data.message === 'string' && data.message
          ? data.message
          : 'Apps Script Web App link updated and synced.';
      setSyncStatusMessage(`${msg} (${timeStr})`);
      return { ok: true, message: msg };
    } catch {
      return {
        ok: false,
        message: 'Could not reach the server to update the Apps Script link. Please try again.',
      };
    }
  };

  const handlePushFullBackup = async (): Promise<SheetsActionResult> => {
    const timeStr = new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
    try {
      const res = await authFetch('/api/sheets-push', { method: 'POST' });
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? ((await res.json()) as Record<string, unknown>)
        : null;

      if (!res.ok || !data) {
        const errMsg =
          (data && typeof data.message === 'string' && data.message) ||
          'Unable to push backup to Google Sheets right now.';
        setSyncStatusMessage(`${errMsg} (${timeStr})`);
        return { ok: false, message: errMsg };
      }

      applyServerStateIfChanged(data, true);
      const msg =
        typeof data.message === 'string' && data.message
          ? data.message
          : 'Full school backup pushed to Google Sheets.';
      setSyncStatusMessage(`${msg} (${timeStr})`);
      return { ok: data.status === 'ok', message: msg };
    } catch {
      const errMsg = 'Could not reach the server to push the backup.';
      setSyncStatusMessage(`${errMsg} (${timeStr})`);
      return { ok: false, message: errMsg };
    }
  };

  const handleDownloadExcelSheet = async (
    tab: DownloadableExcelTab
  ): Promise<SheetsActionResult> => {
    try {
      const res = await authFetch('/api/export/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab }),
      });

      if (!res.ok) {
        const ct = res.headers.get('content-type') || '';
        const errData = ct.includes('application/json')
          ? ((await res.json()) as Record<string, unknown>)
          : null;
        return {
          ok: false,
          message:
            (errData && typeof errData.message === 'string' && errData.message) ||
            'Unable to generate the encrypted Excel workbook right now.',
        };
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/i);
      const todayStamp = new Date().toISOString().slice(0, 10);
      const filename =
        match?.[1] ||
        (tab === 'All'
          ? `SVA_Infirmary_All_Sheets_${todayStamp}.xlsx`
          : `SVA_${tab.replace(/\s+/g, '_')}_${todayStamp}.xlsx`);

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return {
        ok: true,
        message: `Downloaded password-protected workbook: ${filename}`,
      };
    } catch {
      return {
        ok: false,
        message: 'Network error while downloading the protected Excel file. Please try again.',
      };
    }
  };

  // Automated 10-second background sync when visible (skips full list re-renders when server data is unchanged)
  useEffect(() => {
    if (!currentUser || !authToken || !autoSyncEnabled) return;

    const refreshIfChanged = () => {
      if (document.visibilityState !== 'visible') return;
      void safeFetchJson('/api/state').then((d) => {
        if (d && d.status === 'ok') {
          applyServerStateIfChanged(d, false);
        }
      });
    };

    const intervalId = window.setInterval(refreshIfChanged, 10000);
    document.addEventListener('visibilitychange', refreshIfChanged);
    return () => {
      document.removeEventListener('visibilitychange', refreshIfChanged);
      window.clearInterval(intervalId);
    };
  }, [autoSyncEnabled, currentUser, authToken, safeFetchJson, applyServerStateIfChanged]);

  const handleSaveVisit = async (input: VisitFormInput): Promise<VisitRecord> => {
    const visitId = generatePermanentId('VIS', [
      ...db.visits.map((v) => v.visit_id),
      ...Array.from(PURGED_TEST_VISIT_IDS),
    ]);
    const nowIso = new Date().toISOString();
    const student = db.students.find((s) => s.student_id === input.student_id);
    const stuName = student?.full_name || '';
    const stuSec = student?.section || '';
    const stuRoll = student?.roll_number || '';

    const newVisit: VisitRecord = {
      visit_id: visitId,
      student_id: input.student_id,
      student_name: stuName,
      section: stuSec,
      class: stuSec,
      roll_number: stuRoll,
      roll_no: stuRoll,
      visit_datetime: normalizeDatetimeString(input.visit_datetime),
      reason: input.reason.trim(),
      observations: input.observations.trim(),
      action_taken: input.action_taken.trim(),
      medicine_status: input.medicine_status,
      medicine_name:
        input.medicine_status === 'none'
          ? 'None (No medicine given)'
          : input.medicine_status === 'not_recorded'
            ? 'Not recorded'
            : input.medicine_name.trim(),
      dosage: input.medicine_status === 'given' ? input.dosage.trim() : '',
      dosage_unit: input.medicine_status === 'given' ? input.dosage_unit.trim() : '',
      route: input.medicine_status === 'given' ? input.route.trim() : '',
      administration_time:
        input.medicine_status === 'given'
          ? normalizeTimeOnlyString(input.administration_time.trim())
          : '',
      notes: input.notes.trim(),
      recorded_by: input.recorded_by.trim() || currentUser?.displayName || DEFAULT_STAFF_NAME,
      created_at: nowIso,
    };

    setDb((prev) => ({
      ...prev,
      visits: [newVisit, ...prev.visits],
    }));

    // Sync to shared school server (which forwards action: 'createVisit' to Google Sheets & broadcasts to all phones)
    authFetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'recordVisit', visit: newVisit, deviceId }),
    }).catch(() => {});

    return newVisit;
  };

  const handleCreateStudent = (
    fullName: string,
    section: string,
    rollNumber: string,
    activeStatus: 'Active' | 'Inactive' = 'Active'
  ): StudentRecord => {
    const studentId = generatePermanentId(
      'STU',
      db.students.map((s) => s.student_id)
    );
    const nowIso = new Date().toISOString();
    const cleanSection = sanitizeClassSectionName(section) || normalizeSectionName(section);
    const rawRoll = String(rollNumber || '').trim();
    const newStudent: StudentRecord = {
      student_id: studentId,
      full_name: fullName.trim(),
      section: cleanSection,
      roll_number: /^\d+$/.test(rawRoll) ? rawRoll.padStart(2, '0') : rawRoll,
      active_status: activeStatus,
      created_at: nowIso,
      updated_at: nowIso,
    };

    setDb((prev) => ({
      ...prev,
      students: [...prev.students, newStudent],
      classes: getAllClassSections([...prev.students, newStudent], [
        ...(prev.classes || []),
        cleanSection,
      ]),
    }));

    authFetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'createStudent', student: newStudent, deviceId }),
    }).catch(() => {});

    return newStudent;
  };

  const postAdminMutation = async (
    payload: Record<string, unknown>,
    successMessage: string
  ): Promise<AdminActionResult> => {
    try {
      const res = await authFetch('/api/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, deviceId }),
      });
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? ((await res.json()) as Record<string, unknown>)
        : null;
      if (!res.ok || !data || data.status !== 'ok') {
        return {
          ok: false,
          message:
            (data && typeof data.message === 'string' && data.message) ||
            'Unable to save changes to the school server.',
        };
      }
      if (data.db) {
        setDb(normalizeDatabaseSections(data.db as NurseDatabase));
      }
      return { ok: true, message: successMessage };
    } catch {
      return { ok: false, message: 'Network error while saving changes.' };
    }
  };

  const handleAdminCreateStudent = async (
    fullName: string,
    section: string,
    rollNumber: string,
    activeStatus: 'Active' | 'Inactive' = 'Active'
  ): Promise<AdminActionResult> => {
    const cleanSection = sanitizeClassSectionName(section) || normalizeSectionName(section);
    if (!cleanSection) {
      return { ok: false, message: 'Please choose a valid class section name.' };
    }
    const studentId = generatePermanentId(
      'STU',
      db.students.map((s) => s.student_id)
    );
    const nowIso = new Date().toISOString();
    const rawRoll = String(rollNumber || '').trim();
    const newStudent: StudentRecord = {
      student_id: studentId,
      full_name: fullName.trim(),
      section: cleanSection,
      roll_number: /^\d+$/.test(rawRoll) ? rawRoll.padStart(2, '0') : rawRoll,
      active_status: activeStatus,
      created_at: nowIso,
      updated_at: nowIso,
    };
    return postAdminMutation(
      { action: 'createStudent', student: newStudent },
      `Added student ${newStudent.full_name} (${newStudent.section} · Roll ${newStudent.roll_number}).`
    );
  };

  const handleUpdateStudent = async (student: StudentRecord): Promise<AdminActionResult> => {
    const cleanSection =
      sanitizeClassSectionName(student.section) || normalizeSectionName(student.section);
    const updated: StudentRecord = {
      ...student,
      full_name: student.full_name.trim(),
      section: cleanSection,
      updated_at: new Date().toISOString(),
    };
    return postAdminMutation(
      { action: 'updateStudent', student: updated },
      `Updated student ${updated.full_name} (${updated.section} · Roll ${updated.roll_number}).`
    );
  };

  const handleCreateClass = async (className: string): Promise<AdminActionResult> => {
    const clean = sanitizeClassSectionName(className);
    if (!clean) {
      return { ok: false, message: 'Please enter a valid section name (no grade numbers).' };
    }
    return postAdminMutation(
      { action: 'createClass', className: clean },
      `Created class section "${clean}".`
    );
  };

  const handleRenameClass = async (
    oldName: string,
    newName: string
  ): Promise<AdminActionResult> => {
    const clean = sanitizeClassSectionName(newName);
    if (!clean) {
      return { ok: false, message: 'Please enter a valid section name (no grade numbers).' };
    }
    return postAdminMutation(
      { action: 'renameClass', oldName, newName: clean },
      `Updated class "${oldName}" to "${clean}".`
    );
  };

  const handleDeleteClass = async (className: string): Promise<AdminActionResult> => {
    return postAdminMutation(
      { action: 'deleteClass', className },
      `Removed empty class "${className}".`
    );
  };

  const handleUpsertUser = async (user: AppUserRecord): Promise<AdminActionResult> => {
    return postAdminMutation(
      { action: 'upsertUser', user },
      `Saved staff account "${user.username}" (${user.role}).`
    );
  };

  const handleDeleteUser = async (username: string): Promise<AdminActionResult> => {
    return postAdminMutation(
      { action: 'deleteUser', username },
      `Deleted staff account "${username}".`
    );
  };

  const handleAddMeasurement = (
    studentId: string,
    date: string,
    heightCm: number,
    weightKg: number,
    notes: string
  ) => {
    const measurementId = generatePermanentId('MSR', [
      ...db.measurements.map((m) => m.measurement_id),
      ...Array.from(PURGED_TEST_MEASUREMENT_IDS),
    ]);
    const nowIso = new Date().toISOString();
    const newMeas: MeasurementRecord = {
      measurement_id: measurementId,
      student_id: studentId,
      measurement_date: normalizeDateOnlyString(date),
      height_cm: heightCm,
      weight_kg: weightKg,
      notes,
      updated_at: nowIso,
    };

    setDb((prev) => ({
      ...prev,
      measurements: [newMeas, ...prev.measurements],
    }));

    authFetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addMeasurement', measurement: newMeas, deviceId }),
    }).catch(() => {});
  };

  const handleAddHealthProfile = (
    studentId: string,
    conditionOrNote: string,
    status: 'Active' | 'Monitoring' | 'Resolved'
  ) => {
    const recordId = generatePermanentId('HPR', [
      ...db.healthProfiles.map((h) => h.health_record_id),
      ...Array.from(PURGED_TEST_HEALTH_PROFILE_IDS),
    ]);
    const today = getTodayLocalDateString();
    const newProfile: HealthProfileRecord = {
      health_record_id: recordId,
      student_id: studentId,
      condition_or_note: conditionOrNote,
      status,
      date_recorded: today,
      last_reviewed: today,
    };

    setDb((prev) => ({
      ...prev,
      healthProfiles: [newProfile, ...prev.healthProfiles],
    }));

    authFetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addHealthProfile', healthProfile: newProfile, deviceId }),
    }).catch(() => {});
  };

  const startNewVisitForStudent = (
    studentId: string = '',
    initialReason: string = '',
    initialNotes: string = ''
  ) => {
    setPreselectedStudentIdForVisit(studentId);
    setPreselectedReasonForVisit(initialReason);
    setPreselectedNotesForVisit(initialNotes);
    setActiveScreen('new-visit');
  };

  const handleDispatchStudent = async (
    student: StudentRecord,
    reason: string,
    notes: string
  ): Promise<void> => {
    const dispatchId = generatePermanentId(
      'DSP',
      (db.dispatches || []).map((d) => d.dispatch_id)
    );
    const newDispatch: WardenDispatchRecord = {
      dispatch_id: dispatchId,
      student_id: student.student_id,
      student_name: student.full_name,
      section: student.section,
      roll_number: student.roll_number,
      reason,
      notes: notes || undefined,
      dispatched_by: currentUser?.displayName || 'Hostel Warden',
      dispatched_at: new Date().toISOString(),
      status: 'in_transit',
    };

    setDb((prev) => ({
      ...prev,
      dispatches: [newDispatch, ...(prev.dispatches || [])],
    }));

    await authFetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dispatchStudent', dispatch: newDispatch, deviceId }),
    }).catch(() => {});
  };

  const handleCancelDispatch = async (dispatchId: string): Promise<void> => {
    setDb((prev) => ({
      ...prev,
      dispatches: (prev.dispatches || []).map((d) =>
        d.dispatch_id === dispatchId ? { ...d, status: 'cancelled' as const } : d
      ),
    }));

    await authFetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateDispatchStatus',
        dispatch_id: dispatchId,
        status: 'cancelled',
        deviceId,
      }),
    }).catch(() => {});
  };

  const handleAdmitDispatchedStudent = async (dispatch: WardenDispatchRecord): Promise<void> => {
    // Mark dispatch as arrived
    setDb((prev) => ({
      ...prev,
      dispatches: (prev.dispatches || []).map((d) =>
        d.dispatch_id === dispatch.dispatch_id
          ? {
              ...d,
              status: 'arrived' as const,
              acknowledged_at: new Date().toISOString(),
            }
          : d
      ),
    }));

    authFetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateDispatchStatus',
        dispatch_id: dispatch.dispatch_id,
        status: 'arrived',
        acknowledged_at: new Date().toISOString(),
        deviceId,
      }),
    }).catch(() => {});

    // Open visit entry form pre-filled with student and warden's reason and notes
    setShowIncomingDispatches(false);
    startNewVisitForStudent(
      dispatch.student_id,
      dispatch.reason,
      dispatch.notes ? `Warden Note: ${dispatch.notes}` : ''
    );
  };

  const openStudentProfile = (studentId: string) => {
    setSelectedProfileStudentId(studentId);
    setActiveScreen('students');
  };

  const todayDate = getTodayLocalDateString();
  const todayEntries = useMemo(
    () => getDailyVisitLog(db.visits, db.students, todayDate),
    [db.visits, db.students, todayDate]
  );

  const visitedTodayStudentIds = useMemo(() => {
    const set = new Set<string>();
    todayEntries.forEach((e) => set.add(e.student.student_id));
    return set;
  }, [todayEntries]);

  const healthNoteByStudentId = useMemo(() => {
    const map = new Map<string, HealthProfileRecord>();
    db.healthProfiles.forEach((h) => {
      if (!map.has(h.student_id)) {
        map.set(h.student_id, h);
      }
    });
    return map;
  }, [db.healthProfiles]);

  const activeDispatches = useMemo(() => {
    return (db.dispatches || []).filter((d) => d.status === 'in_transit');
  }, [db.dispatches]);

  const latestMeasByStudentId = useMemo(() => {
    const map = new Map<string, MeasurementRecord>();
    const sorted = [...db.measurements].sort((a, b) => {
      const dCmp = b.measurement_date.localeCompare(a.measurement_date);
      if (dCmp !== 0) return dCmp;
      return b.updated_at.localeCompare(a.updated_at);
    });
    for (const m of sorted) {
      if (!map.has(m.student_id)) {
        map.set(m.student_id, m);
      }
    }
    return map;
  }, [db.measurements]);

  const homeAvailableSections = useMemo(
    () => getAllClassSections(db.students, db.classes),
    [db.students, db.classes]
  );

  const homeFilteredStudents = useMemo(() => {
    const matches = searchStudents(db.students, deferredHomeSearchQuery, homeSectionFilter);
    if (rosterFilter === 'visited-today') {
      return matches.filter((s) => visitedTodayStudentIds.has(s.student_id));
    }
    if (rosterFilter === 'health-notes') {
      return matches.filter((s) => healthNoteByStudentId.has(s.student_id));
    }
    return matches;
  }, [db.students, deferredHomeSearchQuery, homeSectionFilter, rosterFilter, visitedTodayStudentIds, healthNoteByStudentId]);

  const recentVisits = useMemo(() => {
    const studentMap = new Map<string, StudentRecord>();
    db.students.forEach((s) => studentMap.set(s.student_id, s));

    return [...db.visits]
      .sort((a, b) => {
        const dtCmp = b.visit_datetime.localeCompare(a.visit_datetime);
        if (dtCmp !== 0) return dtCmp;
        return b.created_at.localeCompare(a.created_at);
      })
      .slice(0, 8)
      .map((visit) => ({
        visit,
        student: studentMap.get(visit.student_id) || {
          student_id: visit.student_id,
          full_name: 'Unknown Student',
          section: '-',
          roll_number: '-',
          active_status: 'Active' as const,
          created_at: visit.created_at,
          updated_at: visit.created_at,
        },
      }));
  }, [db.visits, db.students]);

  const handleLoginSuccess = (payload: LoginSuccessPayload) => {
    authTokenRef.current = payload.token;
    setAuthToken(payload.token);
    setCurrentUser(payload.user);
    if (payload.updatedAt) {
      lastServerUpdatedAtRef.current = payload.updatedAt;
    }
    if (payload.db) {
      setDb(normalizeDatabaseSections(payload.db as NurseDatabase));
    }
    setAppsScriptUrl(payload.appsScriptUrl || '');
    setIsCustomAppsScriptUrl(Boolean(payload.isCustomAppsScriptUrl));
    if (typeof payload.autoSyncEnabled === 'boolean') {
      setAutoSyncEnabled(payload.autoSyncEnabled);
    }
    if (payload.lastSheetsSyncAt && payload.lastSheetsSyncMessage) {
      const syncedDate = new Date(payload.lastSheetsSyncAt);
      const timeStr = Number.isNaN(syncedDate.getTime())
        ? ''
        : syncedDate.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
          });
      const formatted = timeStr
        ? `${payload.lastSheetsSyncMessage} (${timeStr})`
        : payload.lastSheetsSyncMessage;
      lastSheetsSyncRef.current = { at: payload.lastSheetsSyncAt, formatted };
      setSyncStatusMessage(formatted);
    }
    if (payload.user.role !== 'admin' && activeScreen === 'admin-panel') {
      setActiveScreen('home');
    }
  };

  // Authentication gate: strictly requires server-verified login on every reload or first visit
  if (!currentUser || !authToken) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const isAdmin = currentUser.role === 'admin';
  const effectiveScreen: ActiveScreen =
    activeScreen === 'admin-panel' && !isAdmin ? 'home' : activeScreen;

  // Warden portal view for hostel staff
  if (currentUser.role === 'warden') {
    return (
      <WardenPortalView
        currentUser={currentUser}
        students={db.students}
        availableClasses={homeAvailableSections}
        visits={db.visits}
        measurements={db.measurements}
        healthProfiles={db.healthProfiles}
        dispatches={db.dispatches || []}
        onDispatchStudent={handleDispatchStudent}
        onCancelDispatch={handleCancelDispatch}
        onLogout={handleLogout}
      />
    );
  }

  if (printReportConfig) {
    return (
      <PrintableReport
        config={printReportConfig}
        onClose={() => setPrintReportConfig(null)}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FBFAF8] text-zinc-900 selection:bg-teal-100 selection:text-teal-900">
      {/* DESKTOP HEADER (GPU-promoted chrome without per-frame backdrop-blur jank) */}
      <header className="no-print hidden sm:flex sticky top-0 z-30 chrome-sticky bg-[#FBFAF8]/98 border-b border-stone-200/80 px-8 py-2.5 items-center justify-between gap-8">
        {/* Zone 1: Official Crest + School Name */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            setActiveScreen('home');
          }}
          className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-zinc-900 whitespace-nowrap shrink-0 font-display min-w-0"
        >
          <img
            src={SCHOOL_LOGO_URL}
            onError={(e) => {
              const target = e.currentTarget;
              if (target.src !== SCHOOL_LOGO_FALLBACK_URL) {
                target.src = SCHOOL_LOGO_FALLBACK_URL;
              }
            }}
            alt={`${SCHOOL_NAME} logo`}
            className="h-9 w-auto object-contain shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.06)]"
          />
          <span className="truncate">{SCHOOL_NAME}</span>
        </a>

        {/* Zone 2: Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="flex items-center justify-center gap-8 text-sm font-medium text-zinc-500"
        >
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              setActiveScreen('home');
            }}
            className={`hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 py-0.5 ${
              activeScreen === 'home'
                ? 'text-zinc-900 font-semibold underline decoration-2 underline-offset-8'
                : ''
            }`}
          >
            Infirmary
          </a>
          <a
            href="#students"
            onClick={(e) => {
              e.preventDefault();
              setSelectedProfileStudentId(null);
              setActiveScreen('students');
            }}
            className={`hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 py-0.5 ${
              activeScreen === 'students'
                ? 'text-zinc-900 font-semibold underline decoration-2 underline-offset-8'
                : ''
            }`}
          >
            Students
          </a>
          <a
            href="#daily-log"
            onClick={(e) => {
              e.preventDefault();
              setActiveScreen('daily-log');
            }}
            className={`hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 py-0.5 ${
              effectiveScreen === 'daily-log'
                ? 'text-zinc-900 font-semibold underline decoration-2 underline-offset-8'
                : ''
            }`}
          >
            Daily Log
          </a>
          {isAdmin ? (
            <>
              <a
                href="#admin"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveScreen('admin-panel');
                }}
                className={`hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 py-0.5 ${
                  effectiveScreen === 'admin-panel'
                    ? 'text-zinc-900 font-semibold underline decoration-2 underline-offset-8'
                    : ''
                }`}
              >
                Admin
              </a>
              <a
                href="#sheets-setup"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveScreen('sheets-setup');
                }}
                className={`hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 py-0.5 ${
                  effectiveScreen === 'sheets-setup'
                    ? 'text-zinc-900 font-semibold underline decoration-2 underline-offset-8'
                    : ''
                }`}
              >
                Google Sheets
              </a>
            </>
          ) : (
            <a
              href="#downloads"
              onClick={(e) => {
                e.preventDefault();
                setActiveScreen('sheets-setup');
              }}
              className={`hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 py-0.5 ${
                effectiveScreen === 'sheets-setup'
                  ? 'text-zinc-900 font-semibold underline decoration-2 underline-offset-8'
                  : ''
              }`}
            >
              Downloads
            </a>
          )}
        </nav>

        {/* Zone 3: Record Action + Lock Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Unobtrusive Warden Alert / Incoming Queue Pill */}
          <button
            type="button"
            onClick={() => setShowIncomingDispatches(true)}
            className={`h-9 px-3 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-2xs border cursor-pointer ${
              activeDispatches.length > 0
                ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                : 'bg-white text-zinc-600 border-stone-200/90 hover:bg-stone-50'
            }`}
            title="Incoming passes from hostel warden"
          >
            <Bell className={`w-3.5 h-3.5 ${activeDispatches.length > 0 ? 'text-amber-600' : 'text-zinc-400'}`} />
            <span>Hostel Passes</span>
            {activeDispatches.length > 0 && (
              <span className="w-4 h-4 flex items-center justify-center rounded-full bg-amber-600 text-white text-[10px] font-bold">
                {activeDispatches.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              startNewVisitForStudent(
                activeScreen === 'students' && selectedProfileStudentId
                  ? selectedProfileStudentId
                  : ''
              )
            }
            className="h-9 px-3.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.99] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.25]" />
            <span>Record Visit</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            title="Lock infirmary terminal"
            className="h-9 px-2.5 text-xs font-medium text-zinc-600 bg-white border border-stone-200/90 rounded-xl hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="font-medium">Lock</span>
          </button>
        </div>
      </header>

      {/* MOBILE HEADER (School Branding given full space - GPU-promoted without blur jank) */}
      <header className="no-print sm:hidden sticky top-0 z-40 chrome-sticky bg-[#FBFAF8]/98 border-b border-stone-200/80 px-3 py-2.5 flex items-center justify-between gap-2 shadow-2xs">
        {activeScreen === 'new-visit' ? (
          <div className="flex items-center justify-between w-full gap-2">
            <button
              type="button"
              onClick={() => setActiveScreen('home')}
              className="h-8 px-2.5 text-xs font-semibold text-zinc-700 bg-white border border-stone-200 rounded-lg flex items-center gap-1.5 active:bg-stone-100 shrink-0 shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <span className="text-xs font-bold text-zinc-900 font-display truncate">
              Record Infirmary Visit
            </span>
            <span className="w-8" />
          </div>
        ) : effectiveScreen === 'sheets-setup' ? (
          <div className="flex items-center justify-between w-full gap-2">
            <button
              type="button"
              onClick={() => setActiveScreen('home')}
              className="h-8 px-2.5 text-xs font-semibold text-zinc-700 bg-white border border-stone-200 rounded-lg flex items-center gap-1.5 active:bg-stone-100 shrink-0 shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Infirmary</span>
            </button>
            <span className="text-xs font-bold text-zinc-900 font-display truncate">
              {isAdmin ? 'Google Sheets & Excel' : 'Protected Sheets (.xlsx)'}
            </span>
            <span className="w-8" />
          </div>
        ) : effectiveScreen === 'admin-panel' ? (
          <div className="flex items-center justify-between w-full gap-2">
            <button
              type="button"
              onClick={() => setActiveScreen('home')}
              className="h-8 px-2.5 text-xs font-semibold text-zinc-700 bg-white border border-stone-200 rounded-lg flex items-center gap-1.5 active:bg-stone-100 shrink-0 shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Infirmary</span>
            </button>
            <span className="text-xs font-bold text-zinc-900 font-display truncate">
              Admin Console
            </span>
            <button
              type="button"
              onClick={() => setActiveScreen('sheets-setup')}
              aria-label="Open Google Sheets"
              title="Google Sheets"
              className="h-8 px-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg flex items-center gap-1 shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : activeScreen === 'students' && selectedProfileStudentId ? (
          <div className="flex items-center justify-between w-full gap-2">
            <button
              type="button"
              onClick={() => setSelectedProfileStudentId(null)}
              className="h-8 px-2.5 text-xs font-semibold text-zinc-700 bg-white border border-stone-200 rounded-lg flex items-center gap-1.5 active:bg-stone-100 shrink-0 shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Students</span>
            </button>
            <span className="text-xs font-bold text-zinc-900 font-display truncate max-w-[170px]">
              {db.students.find((s) => s.student_id === selectedProfileStudentId)?.full_name || 'Profile'}
            </span>
            <button
              type="button"
              onClick={() => startNewVisitForStudent(selectedProfileStudentId)}
              className="h-8 px-2.5 text-xs font-bold text-white bg-teal-700 rounded-lg active:bg-teal-800 flex items-center gap-1 shrink-0 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Visit</span>
            </button>
          </div>
        ) : (
          <>
            <a
              href="#home"
              onClick={(e) => {
                e.preventDefault();
                setActiveScreen('home');
              }}
              className="flex items-center gap-2 flex-1 min-w-0 pr-1"
            >
              <img
                src={SCHOOL_LOGO_URL}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== SCHOOL_LOGO_FALLBACK_URL) {
                    target.src = SCHOOL_LOGO_FALLBACK_URL;
                  }
                }}
                alt={`${SCHOOL_NAME} crest`}
                className="h-8 w-8 object-contain shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.06)]"
              />
              <div className="flex-1 min-w-0">
                <h1 className="text-xs min-[360px]:text-sm font-bold text-zinc-900 font-display leading-tight tracking-tight truncate">
                  {SCHOOL_NAME}
                </h1>
                <p className="text-[10px] font-semibold text-teal-800 tracking-wide uppercase leading-tight truncate">
                  School Infirmary
                </p>
              </div>
            </a>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowIncomingDispatches(true)}
                aria-label="Hostel passes"
                title="Hostel passes"
                className={`relative h-8 px-2 rounded-lg border shadow-2xs flex items-center gap-1 text-xs font-medium transition-colors ${
                  activeDispatches.length > 0
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-white text-zinc-600 border-stone-200/90'
                }`}
              >
                <Bell className={`w-3.5 h-3.5 ${activeDispatches.length > 0 ? 'text-amber-600' : 'text-zinc-500'}`} />
                {activeDispatches.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {activeDispatches.length}
                  </span>
                )}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveScreen('sheets-setup')}
                  aria-label="Google Sheets"
                  title="Google Sheets"
                  className="h-8 px-2 rounded-lg bg-white border border-stone-200/90 shadow-2xs flex items-center gap-1 text-xs font-medium text-teal-800 active:bg-teal-50 transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                </button>
              )}
              {effectiveScreen !== 'home' && (
                <button
                  type="button"
                  onClick={() =>
                    setPrintReportConfig({
                      type: 'daily-log',
                      date: todayDate,
                      entries: todayEntries,
                    })
                  }
                  aria-label="Print today's visit log"
                  title="Print today's visit log"
                  className="h-8 px-2 rounded-lg bg-white border border-stone-200/90 shadow-2xs flex items-center gap-1 text-xs font-medium text-zinc-700 active:bg-stone-100 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5 text-zinc-600" />
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Lock infirmary"
                title="Lock infirmary"
                className="h-8 px-2 rounded-lg bg-white border border-stone-200/90 shadow-2xs flex items-center gap-1 text-xs font-medium text-zinc-700 active:bg-rose-50 active:text-rose-700 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[11px] font-semibold text-zinc-700">Lock</span>
              </button>
            </div>
          </>
        )}
      </header>

      {/* MAIN CONTENT VIEWPORT */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3.5 sm:px-8 py-3.5 sm:py-8 pb-28 sm:pb-8">
        {/* SCREEN 1: INFIRMARY WORKSPACE */}
        {effectiveScreen === 'home' && (
          <div className="space-y-3.5 sm:space-y-6">
            {/* Desktop-only Workspace Title & Header (Preserved for PC) */}
            <div className="hidden sm:flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-teal-700">
                  School Infirmary &amp; Health Department
                </p>
                <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 font-display tracking-tight mt-0.5 leading-tight">
                  Who is visiting the infirmary?
                </h1>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setPrintReportConfig({
                      type: 'daily-log',
                      date: todayDate,
                      entries: todayEntries,
                    })
                  }
                  className="h-9 px-3.5 text-xs font-medium text-zinc-700 bg-white border border-stone-200/90 rounded-xl hover:bg-stone-50 active:bg-stone-100 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Print Today&apos;s Log ({todayEntries.length})</span>
                </button>
              </div>
            </div>

            {/* Mobile-only Clinic Status Hub (<sm only): Clean Hero + 2-segment switcher */}
            <div className="sm:hidden bg-gradient-to-br from-white to-stone-50 border border-stone-200/90 rounded-2xl p-3.5 shadow-2xs space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse" />
                    Infirmary Desk · Live Sync
                  </span>
                  <h2 className="text-base font-bold text-zinc-900 font-display truncate">
                    {todayEntries.length === 0
                      ? 'No visits recorded yet today'
                      : `${todayEntries.length} student visit${todayEntries.length === 1 ? '' : 's'} today`}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setPrintReportConfig({
                      type: 'daily-log',
                      date: todayDate,
                      entries: todayEntries,
                    })
                  }
                  className="h-8 px-2.5 text-xs font-medium text-zinc-700 bg-white border border-stone-200 rounded-lg flex items-center gap-1.5 shrink-0 shadow-2xs active:bg-stone-100"
                >
                  <Printer className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Log ({todayEntries.length})</span>
                </button>
              </div>

              {/* Segmented Switcher: Today's Activity vs Class Roster */}
              <div
                role="tablist"
                aria-label="Mobile workspace view"
                className="grid grid-cols-2 gap-1 p-1 bg-stone-200/80 rounded-xl text-xs font-semibold"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileHomeTab === 'visits'}
                  onClick={() => setMobileHomeTab('visits')}
                  className={`py-2 px-3 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                    mobileHomeTab === 'visits'
                      ? 'bg-white text-zinc-900 shadow-xs font-bold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  <span>Today&apos;s Visits ({todayEntries.length})</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileHomeTab === 'roster'}
                  onClick={() => setMobileHomeTab('roster')}
                  className={`py-2 px-3 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                    mobileHomeTab === 'roster'
                      ? 'bg-white text-zinc-900 shadow-xs font-bold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Class Roster ({db.students.length})</span>
                </button>
              </div>
            </div>

            {/* 2-Column Split on Desktop (Aligned Height) | Instant Tab View on Mobile */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT COLUMN (7 COLS): CLASS 6 SPARKLE ROSTER WITH INSTANT SEARCH & FILTERS */}
              <section
                className={`${
                  mobileHomeTab === 'roster' ? 'block' : 'hidden lg:flex'
                } lg:col-span-7 lg:flex-col lg:h-[600px] bg-white border border-stone-200/90 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.03)] overflow-hidden`}
              >
                {/* Search Input Bar */}
                <div className="relative border-b border-stone-100 shrink-0">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 sm:left-4 top-3.5 sm:top-4 pointer-events-none" />
                  <input
                    id="home-student-search"
                    type="text"
                    aria-label="Search student by roll number, name, or section"
                    value={homeSearchQuery}
                    onChange={(e) => setHomeSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && homeFilteredStudents.length > 0) {
                        e.preventDefault();
                        openStudentProfile(homeFilteredStudents[0].student_id);
                      }
                    }}
                    placeholder="Search name, roll number, or class..."
                    className="w-full h-11 sm:h-12 pl-9 sm:pl-11 pr-9 text-sm text-zinc-900 bg-transparent placeholder:text-zinc-400 focus:outline-none"
                  />
                  {homeSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setHomeSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-3 top-3 p-1 text-zinc-400 hover:text-zinc-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Roster Filter Bar (Single line on mobile and desktop) */}
                <div className="px-3 sm:px-4 py-2 bg-stone-50/70 border-b border-stone-100 flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    <CustomSelect
                      ariaLabel="Filter by class section"
                      size="sm"
                      menuMinWidth={170}
                      value={homeSectionFilter}
                      onChange={setHomeSectionFilter}
                      options={[
                        { value: 'ALL', label: `All Classes (${db.students.length})` },
                        ...homeAvailableSections.map((sec) => ({
                          value: sec,
                          label: sec,
                        })),
                      ]}
                      className="shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => setRosterFilter('all')}
                      className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        rosterFilter === 'all'
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-stone-200/60'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setRosterFilter('visited-today')}
                      className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        rosterFilter === 'visited-today'
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-stone-200/60'
                      }`}
                    >
                      Seen Today ({visitedTodayStudentIds.size})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRosterFilter('health-notes')}
                      className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        rosterFilter === 'health-notes'
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-stone-200/60'
                      }`}
                    >
                      <span className="sm:hidden">Notes ({healthNoteByStudentId.size})</span>
                      <span className="hidden sm:inline">Health Notes ({healthNoteByStudentId.size})</span>
                    </button>
                  </div>

                  <span className="hidden sm:inline text-[11px] text-zinc-400 font-mono tabular-nums shrink-0">
                    Showing {homeFilteredStudents.length} of {db.students.length}
                  </span>
                </div>

                {/* Student Rows (Natural page scroll on mobile, equal-height smooth scrollable panel on lg desktop) */}
                <div
                  data-testid="home-search-results"
                  className="divide-y divide-stone-100 lg:flex-1 lg:overflow-y-auto smooth-scroll-list"
                >
                  {homeFilteredStudents.length === 0 ? (
                    <div className="py-12 px-6 text-center text-xs text-zinc-500">
                      No student matching current filter.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setHomeSearchQuery('');
                          setRosterFilter('all');
                        }}
                        className="text-teal-700 font-semibold hover:underline ml-1"
                      >
                        Reset filter
                      </button>
                    </div>
                  ) : (
                    homeFilteredStudents.map((stu) => {
                      const healthNote = healthNoteByStudentId.get(stu.student_id);
                      const latestMeas = latestMeasByStudentId.get(stu.student_id);
                      const seenToday = visitedTodayStudentIds.has(stu.student_id);

                      return (
                        <div
                          key={stu.student_id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Open health profile for ${stu.full_name}, Roll ${stu.roll_number}`}
                          onClick={() => openStudentProfile(stu.student_id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openStudentProfile(stu.student_id);
                            }
                          }}
                          className="list-row-opt group px-3.5 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-stone-50/90 active:bg-stone-100/70 transition-colors cursor-pointer select-none focus:outline-none focus-visible:bg-stone-50"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                            <span className="w-8 h-8 rounded-lg bg-stone-100 text-zinc-700 group-hover:bg-teal-50 group-hover:text-teal-800 font-mono tabular-nums text-xs font-semibold flex items-center justify-center shrink-0 transition-colors">
                              {stu.roll_number}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-semibold text-zinc-900 group-hover:text-teal-700 truncate block text-left transition-colors">
                                {stu.full_name}
                              </span>

                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-400 mt-0.5">
                                <span className="text-zinc-500 font-medium">{stu.section}</span>
                                {latestMeas && (
                                  <>
                                    <span aria-hidden="true" className="text-zinc-300">·</span>
                                    <span className="font-mono text-zinc-500">
                                      {latestMeas.height_cm}cm / {latestMeas.weight_kg}kg
                                    </span>
                                  </>
                                )}
                                {seenToday && (
                                  <>
                                    <span aria-hidden="true" className="text-zinc-300">·</span>
                                    <span className="text-[11px] font-semibold text-teal-700">
                                      Seen today
                                    </span>
                                  </>
                                )}
                                {healthNote && (
                                  <>
                                    <span aria-hidden="true" className="text-zinc-300">·</span>
                                    <span className="text-[11px] font-medium text-amber-800 truncate max-w-[200px] sm:max-w-[260px]">
                                      Note: {healthNote.condition_or_note}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startNewVisitForStudent(stu.student_id);
                              }}
                              aria-label={`Record visit for ${stu.full_name}`}
                              className="h-8 px-3 text-xs font-semibold text-teal-800 bg-teal-50/90 hover:bg-teal-100 active:bg-teal-200/70 border border-teal-200/60 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Visit</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="px-4 sm:px-5 py-3 bg-stone-50/60 border-t border-stone-100 flex items-center justify-between gap-2 text-xs text-zinc-500 shrink-0">
                  <span className="truncate">Tap any student row for health dossier</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProfileStudentId(null);
                      setActiveScreen('students');
                    }}
                    className="font-medium text-zinc-700 hover:text-zinc-900 flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    Manage Roster
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </section>

              {/* RIGHT COLUMN (5 COLS): RECENT & TODAY'S INFIRMARY VISITS (NEWEST FIRST) */}
              <section
                className={`${
                  mobileHomeTab === 'visits' ? 'block' : 'hidden lg:flex'
                } lg:col-span-5 lg:flex-col lg:h-[600px] bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.03)]`}
              >
                <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-stone-100 flex items-center justify-between gap-3 shrink-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-teal-700" />
                      <h2 className="text-base font-semibold text-zinc-900 font-display">
                        Recent Infirmary Visits
                      </h2>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Newest first · {todayEntries.length} recorded today
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveScreen('daily-log')}
                    className="px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-stone-100 hover:bg-stone-200/70 rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                  >
                    Daily Log
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="divide-y divide-stone-100 lg:flex-1 lg:overflow-y-auto smooth-scroll-list">
                  {recentVisits.length === 0 ? (
                    <div className="py-12 px-6 text-center text-xs text-zinc-500">
                      No visits recorded yet. Tap <strong>+ Visit</strong> next to any student.
                    </div>
                  ) : (
                    recentVisits.map(({ visit, student }) => (
                      <div
                        key={visit.visit_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openStudentProfile(student.student_id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openStudentProfile(student.student_id);
                          }
                        }}
                        className="group p-4 sm:px-5 flex items-start justify-between gap-3 hover:bg-stone-50/80 active:bg-stone-100/60 transition-colors cursor-pointer select-none"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                            <span className="text-sm font-semibold text-zinc-900 group-hover:text-teal-700 text-left transition-colors">
                              {student.full_name}
                            </span>
                            <span className="text-zinc-300" aria-hidden="true">·</span>
                            <span className="font-mono text-zinc-500">
                              Roll {student.roll_number}
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-zinc-400">
                            {extractDatePart(visit.visit_datetime)} · {formatTimeFromDatetime(visit.visit_datetime)}
                          </div>

                          <p className="text-xs font-medium text-zinc-800 pt-0.5">
                            {visit.reason}
                          </p>
                          <p className="text-xs text-zinc-500 line-clamp-2">
                            {visit.action_taken} · <span className="text-zinc-700 font-medium">{formatMedicineDisplay(visit)}</span>
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrintReportConfig({
                              type: 'single-visit',
                              student,
                              visit,
                            });
                          }}
                          aria-label={`Print visit slip for ${student.full_name}`}
                          className="h-8 px-2.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 border border-stone-200/80 bg-white hover:bg-stone-100 rounded-lg inline-flex items-center gap-1 shrink-0 transition-colors"
                        >
                          <Printer className="w-3 h-3" />
                          Slip
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="px-4 sm:px-5 py-3 bg-stone-50/60 border-t border-stone-100 flex items-center justify-between gap-2 text-xs text-zinc-500 shrink-0">
                  <span className="truncate">Tap any visit card for student history</span>
                  <button
                    type="button"
                    onClick={() => setActiveScreen('daily-log')}
                    className="font-medium text-zinc-700 hover:text-zinc-900 flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    Full Register
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* SCREEN 2: VISIT ENTRY FORM */}
        {effectiveScreen === 'new-visit' && (
          <VisitEntryForm
            students={db.students}
            availableClasses={homeAvailableSections}
            visits={db.visits}
            measurements={db.measurements}
            healthProfiles={db.healthProfiles}
            initialStudentId={preselectedStudentIdForVisit}
            initialReason={preselectedReasonForVisit}
            initialNotes={preselectedNotesForVisit}
            activeNurseName={currentUser?.displayName || 'School Nurse'}
            onSaveVisit={handleSaveVisit}
            onQuickCreateStudent={handleCreateStudent}
            onOpenStudentProfile={openStudentProfile}
            onCancel={() => {
              setPreselectedReasonForVisit('');
              setPreselectedNotesForVisit('');
              setActiveScreen('home');
            }}
            onPrintSingleVisit={(student, visit) =>
              setPrintReportConfig({
                type: 'single-visit',
                student,
                visit,
              })
            }
          />
        )}

        {/* SCREEN 3: STUDENT DIRECTORY & 4-SECTION STUDENT PROFILE */}
        {effectiveScreen === 'students' && (
          <StudentProfileView
            students={db.students}
            availableClasses={homeAvailableSections}
            isAdmin={isAdmin}
            visits={db.visits}
            measurements={db.measurements}
            healthProfiles={db.healthProfiles}
            selectedStudentId={selectedProfileStudentId}
            onSelectStudentId={setSelectedProfileStudentId}
            onStartVisitForStudent={(stuId) => startNewVisitForStudent(stuId)}
            onAddMeasurement={async (input) => {
              handleAddMeasurement(
                input.student_id,
                input.measurement_date,
                input.height_cm,
                input.weight_kg,
                input.notes
              );
            }}
            onSaveHealthNote={async (input) => {
              handleAddHealthProfile(
                input.student_id,
                input.condition_or_note,
                input.status
              );
            }}
            onCreateStudent={handleCreateStudent}
            onUpdateStudent={isAdmin ? handleUpdateStudent : undefined}
            onBulkImportStudents={(rows, replaceAll) => {
              const nowIso = new Date().toISOString();
              let batchToSync: StudentRecord[] = [];
              setDb((prev) => {
                const baseStudents = replaceAll ? [] : [...prev.students];
                const existingIds = baseStudents.map((s) => s.student_id);
                const createdStudents: StudentRecord[] = [];
                rows.forEach((r) => {
                  const id = generatePermanentId('STU', [
                    ...existingIds,
                    ...createdStudents.map((c) => c.student_id),
                  ]);
                  createdStudents.push({
                    student_id: id,
                    full_name: r.fullName,
                    section: normalizeSectionName(r.section),
                    roll_number: r.rollNumber,
                    active_status: 'Active',
                    created_at: nowIso,
                    updated_at: nowIso,
                  });
                });
                batchToSync = createdStudents;
                return {
                  ...prev,
                  students: [...baseStudents, ...createdStudents],
                };
              });
              if (batchToSync.length > 0) {
                authFetch('/api/mutate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'bulkImportStudents',
                    students: batchToSync,
                    replaceAll: isAdmin ? replaceAll : false,
                    deviceId,
                  }),
                }).catch(() => {});
              }
            }}
            onPrintStudentHistory={(student, visitsList, dateRange) =>
              setPrintReportConfig({
                type: 'student-history',
                student,
                visits: visitsList,
                healthProfiles: db.healthProfiles.filter(
                  (h) => h.student_id === student.student_id
                ),
                latestMeasurement: getStudentMeasurements(
                  db.measurements,
                  student.student_id
                )[0],
                startDate: dateRange?.startDate,
                endDate: dateRange?.endDate,
              })
            }
            onPrintSingleVisit={(student, visit) =>
              setPrintReportConfig({
                type: 'single-visit',
                student,
                visit,
              })
            }
          />
        )}

        {/* SCREEN 4: DAILY STUDENT VISIT LOG */}
        {effectiveScreen === 'daily-log' && (
          <DailyLogView
            students={db.students}
            visits={db.visits}
            onOpenPrintPreview={(date: string, entries: DailyLogEntry[]) =>
              setPrintReportConfig({
                type: 'daily-log',
                date,
                entries,
              })
            }
            onOpenStudentProfile={openStudentProfile}
            onStartNewVisit={() => startNewVisitForStudent('')}
          />
        )}

        {/* SCREEN 5: GOOGLE SHEETS (ADMIN) OR PROTECTED EXCEL DOWNLOADS (NURSE) */}
        {effectiveScreen === 'sheets-setup' && (
          <SheetsSetupView
            db={db}
            isAdmin={isAdmin}
            appsScriptUrl={appsScriptUrl}
            isCustomAppsScriptUrl={isCustomAppsScriptUrl}
            onSyncFromSheets={isAdmin ? handleManualSheetsSync : undefined}
            onUpdateAppsScriptUrl={isAdmin ? handleUpdateAppsScriptUrl : undefined}
            onPushFullBackup={isAdmin ? handlePushFullBackup : undefined}
            onDownloadExcelSheet={handleDownloadExcelSheet}
            syncStatusMessage={syncStatusMessage}
            onBackToHome={() => setActiveScreen('home')}
          />
        )}

        {/* SCREEN 6: ADMIN PORTAL (USERS, CLASSES, STUDENTS) */}
        {effectiveScreen === 'admin-panel' && isAdmin && (
          <AdminPanelView
            currentUser={currentUser}
            students={db.students}
            classes={homeAvailableSections}
            users={db.users || []}
            onCreateStudent={handleAdminCreateStudent}
            onUpdateStudent={handleUpdateStudent}
            onCreateClass={handleCreateClass}
            onRenameClass={handleRenameClass}
            onDeleteClass={handleDeleteClass}
            onUpsertUser={handleUpsertUser}
            onDeleteUser={handleDeleteUser}
            onOpenStudentProfile={openStudentProfile}
            onOpenSheetsSetup={() => setActiveScreen('sheets-setup')}
            onBackToHome={() => setActiveScreen('home')}
          />
        )}
      </main>

      {/* FOOTER: QUIET DESKTOP FOOTER */}
      <footer className="no-print hidden sm:block border-t border-stone-200/60 px-4 sm:px-8 py-4 mt-6 sm:mt-10">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-400">
          <span>{SCHOOL_NAME} · School Infirmary</span>
          <div className="flex items-center gap-5">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveScreen('admin-panel')}
                className={`inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  effectiveScreen === 'admin-panel'
                    ? 'text-zinc-900 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin Console
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveScreen('sheets-setup')}
              className={`inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                effectiveScreen === 'sheets-setup'
                  ? 'text-zinc-900 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              {isAdmin ? (
                <>
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Google Sheets &amp; Excel Backup
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Download Protected Sheets (.xlsx)
                </>
              )}
            </button>
          </div>
        </div>
      </footer>

      {/* MOBILE FIXED 5-ITEM BOTTOM NAVIGATION BAR WITH CENTRAL RECORD VISIT ACTION */}
      {activeScreen !== 'new-visit' && (
        <nav
          aria-label="Mobile Bottom Navigation"
          className="no-print sm:hidden fixed bottom-0 inset-x-0 z-40 chrome-sticky bg-white/98 border-t border-stone-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-1"
        >
          <div className="grid grid-cols-5 items-center px-1">
            <button
              type="button"
              onClick={() => setActiveScreen('home')}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all ${
                activeScreen === 'home'
                  ? 'text-teal-900 font-bold'
                  : 'text-zinc-400 hover:text-zinc-700 active:scale-95'
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-colors ${
                  activeScreen === 'home' ? 'bg-teal-100/80 text-teal-800' : ''
                }`}
              >
                <Home className="w-5 h-5" />
              </div>
              <span className="text-[10px] leading-tight mt-0.5">Infirmary</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedProfileStudentId(null);
                setActiveScreen('students');
              }}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all ${
                activeScreen === 'students'
                  ? 'text-teal-900 font-bold'
                  : 'text-zinc-400 hover:text-zinc-700 active:scale-95'
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-colors ${
                  activeScreen === 'students' ? 'bg-teal-100/80 text-teal-800' : ''
                }`}
              >
                <Users className="w-5 h-5" />
              </div>
              <span className="text-[10px] leading-tight mt-0.5">Students</span>
            </button>

            {/* Central Prominent Record Visit Action Button */}
            <div className="flex flex-col items-center justify-center py-0.5 px-0.5">
              <button
                type="button"
                onClick={() =>
                  startNewVisitForStudent(
                    activeScreen === 'students' && selectedProfileStudentId
                      ? selectedProfileStudentId
                      : ''
                  )
                }
                aria-label="Record visit"
                className="w-11 h-11 rounded-full bg-zinc-900 text-white shadow-md flex items-center justify-center active:scale-95 transition-all hover:bg-zinc-800 border border-zinc-700/60"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </button>
              <span className="text-[10px] font-semibold text-zinc-900 leading-tight mt-0.5">Record</span>
            </div>

            <button
              type="button"
              onClick={() => setActiveScreen('daily-log')}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all relative ${
                activeScreen === 'daily-log'
                  ? 'text-teal-900 font-bold'
                  : 'text-zinc-400 hover:text-zinc-700 active:scale-95'
              }`}
            >
              <div
                className={`p-1 rounded-lg relative transition-colors ${
                  activeScreen === 'daily-log' ? 'bg-teal-100/80 text-teal-800' : ''
                }`}
              >
                <ClipboardList className="w-5 h-5" />
                {todayEntries.length > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 min-w-[18px] h-[18px] bg-teal-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
                    {todayEntries.length}
                  </span>
                )}
              </div>
              <span className="text-[10px] leading-tight mt-0.5">Daily Log</span>
            </button>

            {isAdmin ? (
              <button
                type="button"
                onClick={() => setActiveScreen('admin-panel')}
                className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all relative ${
                  effectiveScreen === 'admin-panel'
                    ? 'text-teal-900 font-bold'
                    : 'text-zinc-400 hover:text-zinc-700 active:scale-95'
                }`}
              >
                <div
                  className={`p-1 rounded-lg relative transition-colors ${
                    effectiveScreen === 'admin-panel' ? 'bg-teal-100/80 text-teal-800' : ''
                  }`}
                >
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <span className="text-[10px] leading-tight mt-0.5">Admin</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveScreen('sheets-setup')}
                className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all relative ${
                  effectiveScreen === 'sheets-setup'
                    ? 'text-teal-900 font-bold'
                    : 'text-zinc-400 hover:text-zinc-700 active:scale-95'
                }`}
              >
                <div
                  className={`p-1 rounded-lg relative transition-colors ${
                    effectiveScreen === 'sheets-setup' ? 'bg-teal-100/80 text-teal-800' : ''
                  }`}
                >
                  <Download className="w-5 h-5" />
                </div>
                <span className="text-[10px] leading-tight mt-0.5">Downloads</span>
              </button>
            )}
          </div>
        </nav>
      )}

      {/* UNOBTRUSIVE INCOMING HOSTEL PASSES MODAL FOR NURSE */}
      <ModalDialog
        open={showIncomingDispatches}
        onClose={() => setShowIncomingDispatches(false)}
        title="Hostel Passes (Incoming Students)"
        titleId="incoming-hostel-passes-title"
        subtitle='Sent by hostel warden · Tap "Admit" to start visit'
        icon={<Bell className="w-4 h-4 text-amber-700" />}
        maxWidthClass="max-w-lg"
        footer={
          <div className="w-full flex items-center justify-between text-xs text-zinc-500">
            <span>
              {activeDispatches.length} active pass{activeDispatches.length === 1 ? '' : 'es'}
            </span>
            <button
              type="button"
              onClick={() => setShowIncomingDispatches(false)}
              className="h-8 px-3.5 font-medium text-zinc-700 bg-white border border-stone-200/90 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {activeDispatches.length === 0 ? (
            <div className="py-10 text-center text-zinc-400 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200/70 flex items-center justify-center mb-2.5">
                <Check className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-xs font-semibold text-zinc-700">
                No students currently on the way
              </p>
              <p className="text-[11px] text-zinc-400 mt-1 max-w-xs leading-relaxed">
                When hostel warden Agnel sends a student, their pass will appear here automatically.
              </p>
            </div>
          ) : (
            activeDispatches.map((d) => (
              <div
                key={d.dispatch_id}
                className="p-4 rounded-xl border border-amber-200/80 bg-amber-50/50 flex flex-col gap-2.5 shadow-2xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-zinc-900 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{d.student_name}</span>
                      <span className="text-xs font-mono font-normal text-zinc-500">
                        {d.section} · Roll {d.roll_number}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-700 mt-1">
                      <span className="font-semibold text-zinc-900">Chief Complaint:</span> {d.reason}
                    </div>
                    {d.notes && (
                      <div className="text-xs text-zinc-500 mt-0.5 italic">
                        &ldquo;{d.notes}&rdquo;
                      </div>
                    )}
                    <div className="text-[11px] text-zinc-400 font-mono mt-1">
                      Sent by {d.dispatched_by} at{' '}
                      {new Date(d.dispatched_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleAdmitDispatchedStudent(d)}
                    className="flex-1 h-9 px-3 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Admit Student (Pre-fill Visit)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancelDispatch(d.dispatch_id)}
                    className="h-9 px-3 text-xs font-medium text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </ModalDialog>
    </div>
  );
}
