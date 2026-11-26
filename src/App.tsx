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
  AlertCircle,
  Package,
  Stethoscope,
  ListChecks,
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
  resolveVisitShiftPeriod,
  formatShiftPeriodLabel,
  getStockStatus,
  getExpiryStatus,
  computeCommonIssues,
  DEFAULT_INFIRMARY_SETTINGS,
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
  type MedicineInventoryRecord,
  type ItemInventoryRecord,
  type BillRecord,
  type DoctorVisitSession,
  type DoctorVisitCase,
  type OpdRecord,
  type MedicalCampRecord,
  type CampScreeningRecord,
  type AnnualCheckupRecord,
  type MenstrualLogRecord,
} from './utils/nurseLogic';
import {
  getTodayLocalDateString,
  SCHOOL_NAME,
  SCHOOL_LOGO_URL,
  SCHOOL_LOGO_FALLBACK_URL,
  DEFAULT_STAFF_NAME,
} from './utils/seedData';
import { VisitEntryForm } from './components/VisitEntryForm';
import {
  BulkVisitPanel,
  type BulkVisitPayload,
  type BulkVisitResult,
} from './components/BulkVisitPanel';
import { StudentProfileView } from './components/StudentProfileView';
import { DailyLogView } from './components/DailyLogView';
import {
  SheetsSetupView,
  type SheetsActionResult,
  type DownloadableExcelTab,
} from './components/SheetsSetupView';
import { AdminPanelView, type AdminActionResult } from './components/AdminPanelView';
import {
  OperationsWorkspaceView,
  type OperationsActionResult,
  type BillRestockLine,
} from './components/OperationsWorkspaceView';
import {
  ProgramsWorkspaceView,
  type ProgramsActionResult,
  type ProgramsTab,
} from './components/ProgramsWorkspaceView';
import { PrintableReport, type PrintReportConfig } from './components/PrintableReport';
import { AuthScreen, type LoginSuccessPayload } from './components/AuthScreen';
import { WardenPortalView } from './components/WardenPortalView';
import { CustomSelect } from './components/CustomSelect';
import { ModalDialog } from './components/ModalDialog';
import { type AuthUser } from './utils/auth';

type ActiveScreen =
  | 'home'
  | 'new-visit'
  | 'students'
  | 'daily-log'
  | 'operations'
  | 'programs'
  | 'sheets-setup'
  | 'admin-panel';
type RosterFilterMode = 'all' | 'visited-today' | 'health-notes';

const EMPTY_DB: NurseDatabase = {
  students: [],
  classes: [],
  visits: [],
  measurements: [],
  healthProfiles: [],
  dispatches: [],
  users: [],
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
  settings: DEFAULT_INFIRMARY_SETTINGS,
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
  const medicines = Array.isArray(inputDb.medicines) ? inputDb.medicines : [];
  const items = Array.isArray(inputDb.items) ? inputDb.items : [];
  const stockTransactions = Array.isArray(inputDb.stockTransactions)
    ? inputDb.stockTransactions
    : [];
  const bills = Array.isArray(inputDb.bills) ? inputDb.bills : [];
  const doctorVisits = Array.isArray(inputDb.doctorVisits) ? inputDb.doctorVisits : [];
  const doctorVisitCases = Array.isArray(inputDb.doctorVisitCases)
    ? inputDb.doctorVisitCases
    : [];
  const opdRecords = Array.isArray(inputDb.opdRecords) ? inputDb.opdRecords : [];
  const medicalCamps = Array.isArray(inputDb.medicalCamps) ? inputDb.medicalCamps : [];
  const campScreenings = Array.isArray(inputDb.campScreenings) ? inputDb.campScreenings : [];
  const annualCheckups = Array.isArray(inputDb.annualCheckups) ? inputDb.annualCheckups : [];
  const menstrualLogs = Array.isArray(inputDb.menstrualLogs) ? inputDb.menstrualLogs : [];
  const settings = inputDb.settings
    ? {
        school_hours_start:
          inputDb.settings.school_hours_start || DEFAULT_INFIRMARY_SETTINGS.school_hours_start,
        school_hours_end:
          inputDb.settings.school_hours_end || DEFAULT_INFIRMARY_SETTINGS.school_hours_end,
        updated_at: inputDb.settings.updated_at,
      }
    : DEFAULT_INFIRMARY_SETTINGS;
  const classes = getAllClassSections(students, inputDb.classes);

  return {
    students,
    classes,
    visits,
    measurements,
    healthProfiles,
    dispatches,
    users,
    medicines,
    items,
    stockTransactions,
    bills,
    doctorVisits,
    doctorVisitCases,
    opdRecords,
    medicalCamps,
    campScreenings,
    annualCheckups,
    menstrualLogs,
    settings,
  };
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
    if (hash === 'operations' || hash === 'inventory' || hash === 'bills') return 'operations';
    if (
      hash === 'programs' ||
      hash === 'insights' ||
      hash === 'checkups' ||
      hash === 'menstrual'
    ) {
      return 'programs';
    }
    if (hash === 'downloads' || hash === 'sheets-setup') return 'sheets-setup';
    if (hash === 'admin' || hash === 'admin-panel') return 'admin-panel';
    if (hash === 'new-visit' || hash === 'record') return 'new-visit';
    return 'home';
  });
  const [programsTargetTab, setProgramsTargetTab] = useState<ProgramsTab>(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'insights' || hash === 'checkups' || hash === 'menstrual') {
      return hash;
    }
    return 'hub';
  });
  const [programsTargetNonce, setProgramsTargetNonce] = useState<number>(0);

  const openProgramsTab = useCallback((tab: ProgramsTab = 'hub') => {
    setProgramsTargetTab(tab);
    setProgramsTargetNonce((n) => n + 1);
    setActiveScreen('programs');
  }, []);

  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [saveErrorBanner, setSaveErrorBanner] = useState<string | null>(null);
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
      else if (hash === 'operations' || hash === 'inventory' || hash === 'bills') {
        setActiveScreen('operations');
      } else if (hash === 'programs') {
        openProgramsTab('hub');
      } else if (hash === 'insights' || hash === 'checkups' || hash === 'menstrual') {
        openProgramsTab(hash);
      } else if (hash === 'downloads' || hash === 'sheets-setup') setActiveScreen('sheets-setup');
      else if (hash === 'admin' || hash === 'admin-panel') setActiveScreen('admin-panel');
      else if (hash === 'new-visit' || hash === 'record') setActiveScreen('new-visit');
      else if (hash === 'home' || !hash) setActiveScreen('home');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [openProgramsTab]);

  const [homeSearchQuery, setHomeSearchQuery] = useState('');
  const deferredHomeSearchQuery = useDeferredValue(homeSearchQuery);
  const [homeSectionFilter, setHomeSectionFilter] = useState<string>('ALL');
  const [rosterFilter, setRosterFilter] = useState<RosterFilterMode>('all');
  const [mobileHomeTab, setMobileHomeTab] = useState<'roster' | 'visits' | 'bulk'>('roster');

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
    setSaveErrorBanner(null);
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

  const persistMutationToServer = useCallback(
    async (payload: Record<string, unknown>, contextLabel: string): Promise<boolean> => {
      try {
        const res = await authFetch('/api/mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, deviceId }),
        });
        if (!res.ok) {
          const ct = res.headers.get('content-type') || '';
          const errData = ct.includes('application/json')
            ? ((await res.json()) as Record<string, unknown>)
            : null;
          const errMsg =
            (errData && typeof errData.message === 'string' && errData.message) ||
            `Could not sync ${contextLabel} to the school server (HTTP ${res.status}).`;
          setSaveErrorBanner(errMsg);
          return false;
        }
        setSaveErrorBanner(null);
        return true;
      } catch {
        setSaveErrorBanner(
          `Network error while saving ${contextLabel}. Please verify your connection before closing.`
        );
        return false;
      }
    },
    [authFetch, deviceId]
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
      shift_period: input.shift_period,
      shift_overridden: input.shift_overridden,
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
      medicine_id: input.medicine_status === 'given' ? input.medicine_id : undefined,
      medicine_qty: input.medicine_status === 'given' ? input.medicine_qty : undefined,
      item_id: input.item_id,
      item_name: input.item_name,
      item_qty: input.item_qty,
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

    // Sync to shared school server and await confirmation so stock/validation errors roll back cleanly
    try {
      const res = await authFetch('/api/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recordVisit', visit: newVisit, deviceId }),
      });
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json')
        ? ((await res.json()) as Record<string, unknown>)
        : null;

      if (!res.ok) {
        setDb((prev) => ({
          ...prev,
          visits: prev.visits.filter((v) => v.visit_id !== newVisit.visit_id),
        }));
        const errMsg =
          (data && typeof data.message === 'string' && data.message) ||
          `Could not save visit record (HTTP ${res.status}).`;
        setSaveErrorBanner(errMsg);
        throw new Error(errMsg);
      }

      setSaveErrorBanner(null);
      if (data?.db) {
        if (typeof data.updatedAt === 'string') {
          lastServerUpdatedAtRef.current = data.updatedAt;
        }
        setDb(normalizeDatabaseSections(data.db as NurseDatabase));
      }
      return (data?.visit as VisitRecord) || newVisit;
    } catch (err) {
      setDb((prev) => ({
        ...prev,
        visits: prev.visits.filter((v) => v.visit_id !== newVisit.visit_id),
      }));
      if (err instanceof Error && err.message) {
        setSaveErrorBanner(err.message);
        throw err;
      }
      const netMsg =
        'Network error while saving visit record. Please verify your connection before closing.';
      setSaveErrorBanner(netMsg);
      throw new Error(netMsg);
    }
  };

  const handleSaveBulkVisits = async (
    payload: BulkVisitPayload
  ): Promise<BulkVisitResult> => {
    try {
      const res = await authFetch('/api/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recordBulkVisits',
          studentIds: payload.studentIds,
          template: payload.template,
          deviceId,
        }),
      });
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json')
        ? ((await res.json()) as Record<string, unknown>)
        : null;

      if (!res.ok) {
        const errMsg =
          (data && typeof data.message === 'string' && data.message) ||
          `Could not save bulk visits (HTTP ${res.status}).`;
        setSaveErrorBanner(errMsg);
        throw new Error(errMsg);
      }

      setSaveErrorBanner(null);
      if (data?.db) {
        if (typeof data.updatedAt === 'string') {
          lastServerUpdatedAtRef.current = data.updatedAt;
        }
        setDb(normalizeDatabaseSections(data.db as NurseDatabase));
      }
      return {
        count: Number(data?.count) || payload.studentIds.length,
        totalMedDeducted: Number(data?.totalMedDeducted) || 0,
        totalItemDeducted: Number(data?.totalItemDeducted) || 0,
      };
    } catch (err) {
      if (err instanceof Error && err.message) {
        setSaveErrorBanner(err.message);
        throw err;
      }
      const netMsg =
        'Network error while saving bulk visits. Please verify your connection and try again.';
      setSaveErrorBanner(netMsg);
      throw new Error(netMsg);
    }
  };

  const handleCreateStudent = (
    fullName: string,
    section: string,
    rollNumber: string,
    activeStatus: 'Active' | 'Inactive' = 'Active',
    grNumber: string = ''
  ): StudentRecord => {
    const studentId = generatePermanentId(
      'STU',
      db.students.map((s) => s.student_id)
    );
    const nowIso = new Date().toISOString();
    const cleanSection = sanitizeClassSectionName(section) || normalizeSectionName(section);
    const rawRoll = String(rollNumber || '').trim();
    const cleanGr = String(grNumber || '').trim();
    const newStudent: StudentRecord = {
      student_id: studentId,
      ...(cleanGr ? { gr_number: cleanGr } : {}),
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

    void persistMutationToServer({ action: 'createStudent', student: newStudent }, 'student record');

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
        if (typeof data.updatedAt === 'string') {
          lastServerUpdatedAtRef.current = data.updatedAt;
        }
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
    activeStatus: 'Active' | 'Inactive' = 'Active',
    grNumber: string = ''
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
    const cleanGr = String(grNumber || '').trim();
    const newStudent: StudentRecord = {
      student_id: studentId,
      ...(cleanGr ? { gr_number: cleanGr } : {}),
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

  const handleUpdateSchoolHours = async (
    schoolHoursStart: string,
    schoolHoursEnd: string
  ): Promise<AdminActionResult> => {
    return postAdminMutation(
      {
        action: 'updateSchoolHours',
        school_hours_start: schoolHoursStart,
        school_hours_end: schoolHoursEnd,
      },
      `Updated School Hours window to ${schoolHoursStart} – ${schoolHoursEnd}.`
    );
  };

  const handleUpsertMedicine = async (
    medicine: Partial<MedicineInventoryRecord>
  ): Promise<OperationsActionResult> => {
    return postAdminMutation(
      { action: 'upsertMedicine', medicine },
      medicine.medicine_id
        ? `Updated medicine "${medicine.name}".`
        : `Added medicine "${medicine.name}" to inventory.`
    );
  };

  const handleDeleteMedicine = async (medicineId: string): Promise<OperationsActionResult> => {
    return postAdminMutation(
      { action: 'deleteMedicine', medicine_id: medicineId },
      'Removed medicine from inventory.'
    );
  };

  const handleUpsertItem = async (
    item: Partial<ItemInventoryRecord>
  ): Promise<OperationsActionResult> => {
    return postAdminMutation(
      { action: 'upsertItem', item },
      item.item_id
        ? `Updated item "${item.name}".`
        : `Added item "${item.name}" to inventory.`
    );
  };

  const handleDeleteItem = async (itemId: string): Promise<OperationsActionResult> => {
    return postAdminMutation(
      { action: 'deleteItem', item_id: itemId },
      'Removed item from inventory.'
    );
  };

  const handleAdjustStock = async (payload: {
    target_type: 'medicine' | 'item';
    target_id: string;
    change_qty: number;
    reason?: 'adjustment' | 'bill_restock';
    notes?: string;
  }): Promise<OperationsActionResult> => {
    return postAdminMutation(
      { action: 'adjustStock', ...payload },
      `Stock ${payload.change_qty > 0 ? 'increased' : 'deducted'} by ${Math.abs(payload.change_qty)}.`
    );
  };

  const handleCreateBill = async (
    bill: Partial<BillRecord>,
    restockLines?: BillRestockLine[]
  ): Promise<OperationsActionResult> => {
    return postAdminMutation(
      { action: 'createBill', bill, restockLines: restockLines || [] },
      restockLines && restockLines.length > 0
        ? `Uploaded bill copy from ${bill.vendor_name} and restocked ${restockLines.length} supply item(s).`
        : `Uploaded bill copy from ${bill.vendor_name}.`
    );
  };

  const handleUpdateBill = async (bill: Partial<BillRecord>): Promise<OperationsActionResult> => {
    return postAdminMutation(
      { action: 'updateBill', bill },
      `Updated bill record from ${bill.vendor_name}.`
    );
  };

  const handleDeleteBill = async (billId: string): Promise<OperationsActionResult> => {
    return postAdminMutation(
      { action: 'deleteBill', bill_id: billId },
      'Deleted bill record.'
    );
  };

  // ---- PHASE 2: WEEKLY DOCTOR VISITS, EXTERNAL OPD & MEDICAL CAMPS HANDLERS ----
  const handleUpsertDoctorVisit = async (
    doctorVisit: Partial<DoctorVisitSession>
  ): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'upsertDoctorVisit', doctorVisit },
      doctorVisit.doctor_visit_id
        ? `Updated doctor visit session (${doctorVisit.doctor_name}).`
        : `Logged doctor visit session (${doctorVisit.doctor_name}).`
    );
  };

  const handleDeleteDoctorVisit = async (
    doctorVisitId: string
  ): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'deleteDoctorVisit', doctor_visit_id: doctorVisitId },
      'Deleted doctor visit session.'
    );
  };

  const handleUpsertDoctorVisitCase = async (
    doctorVisitCase: Partial<DoctorVisitCase>
  ): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'upsertDoctorVisitCase', doctorVisitCase },
      doctorVisitCase.case_id
        ? 'Updated student doctor consultation.'
        : 'Added student consultation to doctor visit.'
    );
  };

  const handleDeleteDoctorVisitCase = async (
    caseId: string
  ): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'deleteDoctorVisitCase', case_id: caseId },
      'Deleted student consultation record.'
    );
  };

  const handleCreateOpd = async (opd: Partial<OpdRecord>): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'createOpd', opd },
      `Recorded external OPD referral (${opd.hospital_or_clinic || 'Hospital'}).`
    );
  };

  const handleUpdateOpd = async (opd: Partial<OpdRecord>): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'updateOpd', opd },
      `Updated external OPD record (${opd.hospital_or_clinic || 'Hospital'}).`
    );
  };

  const handleDeleteOpd = async (opdId: string): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'deleteOpd', opd_id: opdId },
      'Deleted external OPD record.'
    );
  };

  const handleUpsertMedicalCamp = async (
    medicalCamp: Partial<MedicalCampRecord>
  ): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'upsertMedicalCamp', medicalCamp },
      medicalCamp.camp_id
        ? `Updated medical camp (${medicalCamp.camp_title}).`
        : `Created medical camp (${medicalCamp.camp_title}).`
    );
  };

  const handleDeleteMedicalCamp = async (campId: string): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'deleteMedicalCamp', camp_id: campId },
      'Deleted medical camp.'
    );
  };

  const handleUpsertCampScreening = async (
    campScreening: Partial<CampScreeningRecord>
  ): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'upsertCampScreening', campScreening },
      campScreening.screening_id
        ? 'Updated student camp screening.'
        : 'Saved student camp screening.'
    );
  };

  const handleDeleteCampScreening = async (
    screeningId: string
  ): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'deleteCampScreening', screening_id: screeningId },
      'Deleted camp screening record.'
    );
  };

  // ---- PHASE 3: ANNUAL HEALTH CHECKUPS & PRIVATE MENSTRUAL LOG HANDLERS ----
  const handleUpsertAnnualCheckup = async (
    annualCheckup: Partial<AnnualCheckupRecord>
  ): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'upsertAnnualCheckup', annualCheckup },
      annualCheckup.checkup_id
        ? 'Updated annual health checkup record.'
        : 'Saved annual health checkup record.'
    );
  };

  const handleDeleteAnnualCheckup = async (
    checkupId: string
  ): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'deleteAnnualCheckup', checkup_id: checkupId },
      'Deleted annual health checkup record.'
    );
  };

  const handleUpsertMenstrualLog = async (
    menstrualLog: Partial<MenstrualLogRecord>
  ): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'upsertMenstrualLog', menstrualLog },
      menstrualLog.menstrual_id
        ? 'Updated menstrual care entry.'
        : 'Saved confidential menstrual care entry.'
    );
  };

  const handleDeleteMenstrualLog = async (
    menstrualId: string
  ): Promise<ProgramsActionResult> => {
    return postAdminMutation(
      { action: 'deleteMenstrualLog', menstrual_id: menstrualId },
      'Deleted menstrual care entry.'
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

    void persistMutationToServer(
      { action: 'addMeasurement', measurement: newMeas },
      'height & weight measurement'
    );
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

    void persistMutationToServer(
      { action: 'addHealthProfile', healthProfile: newProfile },
      'health note'
    );
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

    await persistMutationToServer(
      { action: 'dispatchStudent', dispatch: newDispatch },
      'infirmary pass'
    );
  };

  const handleCancelDispatch = async (dispatchId: string): Promise<void> => {
    setDb((prev) => ({
      ...prev,
      dispatches: (prev.dispatches || []).map((d) =>
        d.dispatch_id === dispatchId ? { ...d, status: 'cancelled' as const } : d
      ),
    }));

    await persistMutationToServer(
      {
        action: 'updateDispatchStatus',
        dispatch_id: dispatchId,
        status: 'cancelled',
      },
      'pass cancellation'
    );
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

    void persistMutationToServer(
      {
        action: 'updateDispatchStatus',
        dispatch_id: dispatch.dispatch_id,
        status: 'arrived',
        acknowledged_at: new Date().toISOString(),
      },
      'pass arrival update'
    );

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

  const homeQuickSummary = useMemo(() => {
    let schoolToday = 0;
    let nightToday = 0;
    for (const entry of todayEntries) {
      const p = resolveVisitShiftPeriod(entry.visit, db.settings);
      if (p === 'night') nightToday++;
      else schoolToday++;
    }

    let lowStockCount = 0;
    let expiringMedCount = 0;
    for (const m of db.medicines || []) {
      if (getStockStatus(m.current_stock, m.min_stock_alert) !== 'ok') lowStockCount++;
      const exp = getExpiryStatus(m.expiry_date);
      if (exp === 'expired' || exp === 'expiring_soon') expiringMedCount++;
    }
    for (const it of db.items || []) {
      if (getStockStatus(it.current_stock, it.min_stock_alert) !== 'ok') lowStockCount++;
    }

    const common30d = computeCommonIssues({
      students: db.students,
      visits: db.visits,
      doctorVisits: db.doctorVisits,
      doctorVisitCases: db.doctorVisitCases,
      opdRecords: db.opdRecords,
      timeframe: '30d',
      includePrograms: true,
      referenceDate: todayDate,
    });
    const topIssue = common30d[0] || null;

    return {
      schoolToday,
      nightToday,
      lowStockCount,
      expiringMedCount,
      totalStockAlerts: lowStockCount + expiringMedCount,
      topIssueLabel: topIssue ? topIssue.label.split(' / ')[0] : null,
      topIssueCases: topIssue ? topIssue.totalCases : 0,
    };
  }, [
    todayEntries,
    db.settings,
    db.medicines,
    db.items,
    db.students,
    db.visits,
    db.doctorVisits,
    db.doctorVisitCases,
    db.opdRecords,
    todayDate,
  ]);

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

  // Desktop keyboard shortcuts: '/' focuses student search, 'n' opens Record Visit
  useEffect(() => {
    if (!currentUser || !authToken || currentUser.role === 'warden') return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (showIncomingDispatches || printReportConfig || document.querySelector('[role="dialog"]')) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        if (activeScreen !== 'home') {
          setActiveScreen('home');
        }
        requestAnimationFrame(() => {
          const el = document.getElementById('home-student-search') as HTMLInputElement | null;
          el?.focus();
          el?.select();
        });
      } else if (e.key === 'n' || e.key === 'N') {
        if (activeScreen !== 'new-visit') {
          e.preventDefault();
          startNewVisitForStudent(
            activeScreen === 'students' && selectedProfileStudentId ? selectedProfileStudentId : ''
          );
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    currentUser,
    authToken,
    activeScreen,
    selectedProfileStudentId,
    showIncomingDispatches,
    printReportConfig,
  ]);

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
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-zinc-950 selection:bg-zinc-900 selection:text-white">
      {/* DESKTOP HEADER */}
      <header className="no-print hidden sm:flex sticky top-0 z-30 chrome-sticky bg-white/95 border-b border-zinc-200/80 px-8 h-16 items-center justify-between gap-8">
        {/* Zone 1: Official Crest + School Name */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            setActiveScreen('home');
          }}
          className="flex items-center gap-3 text-[15px] font-semibold tracking-tight text-zinc-950 whitespace-nowrap shrink-0 font-display min-w-0"
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
            className="h-8 w-8 object-contain shrink-0"
          />
          <span className="truncate">{SCHOOL_NAME}</span>
        </a>

        {/* Zone 2: Clean 5-Item Navigation Bar */}
        <nav
          aria-label="Primary navigation"
          className="flex items-center justify-center gap-1 text-[13px] font-medium text-zinc-500"
        >
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              setSelectedProfileStudentId(null);
              setActiveScreen('home');
            }}
            className={`px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              effectiveScreen === 'home' || effectiveScreen === 'students'
                ? 'text-zinc-950 bg-zinc-100/90 font-semibold'
                : 'hover:text-zinc-900 hover:bg-zinc-50'
            }`}
          >
            Infirmary
          </a>
          <a
            href="#daily-log"
            onClick={(e) => {
              e.preventDefault();
              setActiveScreen('daily-log');
            }}
            className={`px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              effectiveScreen === 'daily-log'
                ? 'text-zinc-950 bg-zinc-100/90 font-semibold'
                : 'hover:text-zinc-900 hover:bg-zinc-50'
            }`}
          >
            Daily Log
          </a>
          <a
            href="#operations"
            onClick={(e) => {
              e.preventDefault();
              setActiveScreen('operations');
            }}
            className={`px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              effectiveScreen === 'operations'
                ? 'text-zinc-950 bg-zinc-100/90 font-semibold'
                : 'hover:text-zinc-900 hover:bg-zinc-50'
            }`}
          >
            Stock &amp; Bills
          </a>
          <a
            href="#programs"
            onClick={(e) => {
              e.preventDefault();
              openProgramsTab('hub');
            }}
            className={`px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              effectiveScreen === 'programs'
                ? 'text-zinc-950 bg-zinc-100/90 font-semibold'
                : 'hover:text-zinc-900 hover:bg-zinc-50'
            }`}
          >
            Programs
          </a>
          {isAdmin ? (
            <a
              href="#admin"
              onClick={(e) => {
                e.preventDefault();
                setActiveScreen('admin-panel');
              }}
              className={`px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                effectiveScreen === 'admin-panel' || effectiveScreen === 'sheets-setup'
                  ? 'text-zinc-950 bg-zinc-100/90 font-semibold'
                  : 'hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              Admin
            </a>
          ) : (
            <a
              href="#downloads"
              onClick={(e) => {
                e.preventDefault();
                setActiveScreen('sheets-setup');
              }}
              className={`px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                effectiveScreen === 'sheets-setup'
                  ? 'text-zinc-950 bg-zinc-100/90 font-semibold'
                  : 'hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              Exports
            </a>
          )}
        </nav>

        {/* Zone 3: Compact Passes Indicator + Primary Action + Quiet Lock */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowIncomingDispatches(true)}
            aria-label="Incoming hostel passes"
            title={
              activeDispatches.length > 0
                ? `${activeDispatches.length} incoming hostel pass(es)`
                : 'Hostel passes (none waiting)'
            }
            className={`h-9 px-2.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 border cursor-pointer ${
              activeDispatches.length > 0
                ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                : 'bg-white text-zinc-500 border-zinc-200/90 hover:text-zinc-900 hover:bg-zinc-50'
            }`}
          >
            <Bell className={`w-4 h-4 ${activeDispatches.length > 0 ? 'text-amber-600' : 'text-zinc-400'}`} />
            {activeDispatches.length > 0 && (
              <span className="font-mono tabular-nums text-xs font-bold text-amber-900">
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
            className="h-9 px-3.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.99] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.25]" />
            <span>Record Visit</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            aria-label="Lock infirmary terminal"
            title="Lock infirmary terminal"
            className="h-9 w-9 text-zinc-400 bg-white border border-zinc-200/90 rounded-xl hover:text-zinc-900 hover:bg-zinc-50 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MOBILE HEADER */}
      <header className="no-print sm:hidden sticky top-0 z-40 chrome-sticky bg-white/95 border-b border-zinc-200/80 px-4 h-14 flex items-center justify-between gap-2">
        {activeScreen === 'new-visit' ? (
          <div className="flex items-center justify-between w-full gap-2">
            <button
              type="button"
              onClick={() => setActiveScreen('home')}
              className="h-8 px-2.5 text-xs font-medium text-zinc-700 bg-zinc-100/80 rounded-lg flex items-center gap-1.5 active:bg-zinc-200 shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <span className="text-xs font-semibold text-zinc-950 font-display truncate">
              Record Infirmary Visit
            </span>
            <span className="w-8" />
          </div>
        ) : effectiveScreen === 'sheets-setup' ? (
          <div className="flex items-center justify-between w-full gap-2">
            <button
              type="button"
              onClick={() => setActiveScreen('home')}
              className="h-8 px-2.5 text-xs font-medium text-zinc-700 bg-zinc-100/80 rounded-lg flex items-center gap-1.5 active:bg-zinc-200 shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Infirmary</span>
            </button>
            <span className="text-xs font-semibold text-zinc-950 font-display truncate">
              {isAdmin ? 'Sheets, PDF & Excel' : 'PDF & Excel Sheets'}
            </span>
            <span className="w-8" />
          </div>
        ) : effectiveScreen === 'admin-panel' ? (
          <div className="flex items-center justify-between w-full gap-2">
            <button
              type="button"
              onClick={() => setActiveScreen('home')}
              className="h-8 px-2.5 text-xs font-medium text-zinc-700 bg-zinc-100/80 rounded-lg flex items-center gap-1.5 active:bg-zinc-200 shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Infirmary</span>
            </button>
            <span className="text-xs font-semibold text-zinc-950 font-display truncate">
              Admin Console
            </span>
            <button
              type="button"
              onClick={() => setActiveScreen('sheets-setup')}
              aria-label="Open Google Sheets"
              title="Google Sheets"
              className="h-8 px-2.5 text-xs font-medium text-zinc-700 bg-zinc-100/80 rounded-lg flex items-center gap-1 shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : activeScreen === 'students' && selectedProfileStudentId ? (
          <div className="flex items-center justify-between w-full gap-2">
            <button
              type="button"
              onClick={() => setSelectedProfileStudentId(null)}
              className="h-8 px-2.5 text-xs font-medium text-zinc-700 bg-zinc-100/80 rounded-lg flex items-center gap-1.5 active:bg-zinc-200 shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Roster</span>
            </button>
            <span className="text-xs font-semibold text-zinc-950 font-display truncate max-w-[170px]">
              {db.students.find((s) => s.student_id === selectedProfileStudentId)?.full_name || 'Profile'}
            </span>
            <button
              type="button"
              onClick={() => startNewVisitForStudent(selectedProfileStudentId)}
              className="h-8 px-2.5 text-xs font-semibold text-white bg-zinc-900 rounded-lg active:bg-zinc-800 flex items-center gap-1 shrink-0"
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
              className="flex items-center gap-2.5 flex-1 min-w-0 pr-1"
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
                className="h-7 w-7 object-contain shrink-0"
              />
              <h1 className="text-sm font-semibold text-zinc-950 font-display tracking-tight truncate">
                {SCHOOL_NAME}
              </h1>
            </a>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowIncomingDispatches(true)}
                aria-label="Hostel passes"
                title="Hostel passes"
                className={`relative h-8 min-w-[34px] px-2 rounded-lg border flex items-center justify-center gap-1 text-xs font-medium transition-colors ${
                  activeDispatches.length > 0
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-white text-zinc-500 border-zinc-200/80'
                }`}
              >
                <Bell className={`w-3.5 h-3.5 ${activeDispatches.length > 0 ? 'text-amber-600' : 'text-zinc-500'}`} />
                {activeDispatches.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {activeDispatches.length}
                  </span>
                )}
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setActiveScreen('admin-panel')}
                  aria-label="Admin Console"
                  title="Admin Console"
                  className="h-8 w-8 rounded-lg bg-white border border-zinc-200/80 flex items-center justify-center text-zinc-600 active:bg-zinc-100 transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveScreen('sheets-setup')}
                  aria-label="Download Protected Sheets"
                  title="Download Protected Sheets"
                  className="h-8 w-8 rounded-lg bg-white border border-zinc-200/80 flex items-center justify-center text-zinc-600 active:bg-zinc-100 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Lock infirmary"
                title="Lock infirmary"
                className="h-8 w-8 rounded-lg bg-white border border-zinc-200/80 flex items-center justify-center text-zinc-500 active:bg-rose-50 active:text-rose-700 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </header>

      {/* MAIN CONTENT VIEWPORT */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-4 sm:py-8 pb-28 sm:pb-10">
        {saveErrorBanner && (
          <div
            role="alert"
            className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{saveErrorBanner}</span>
            </span>
            <button
              type="button"
              onClick={() => setSaveErrorBanner(null)}
              aria-label="Dismiss save warning"
              className="text-rose-700 hover:text-rose-900 p-0.5 shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {/* SCREEN 1: INFIRMARY WORKSPACE */}
        {effectiveScreen === 'home' && (
          <div key="screen-home" className="view-enter-animate space-y-4 sm:space-y-6">
            {/* Desktop Workspace Header */}
            <div className="hidden sm:flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-zinc-950 font-display tracking-tight">
                  Infirmary Desk
                </h1>
                <p className="text-xs text-zinc-500 mt-1">
                  Search any student to view their health profile or record a new infirmary visit.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setMobileHomeTab((prev) => (prev === 'bulk' ? 'roster' : 'bulk'))
                  }
                  className={`h-9 px-3.5 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer border ${
                    mobileHomeTab === 'bulk'
                      ? 'bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800'
                      : 'text-zinc-800 bg-white border-zinc-200/90 hover:bg-zinc-50'
                  }`}
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  <span>{mobileHomeTab === 'bulk' ? 'Back to Desk' : 'Bulk Visit'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProfileStudentId(null);
                    setActiveScreen('students');
                  }}
                  className="h-9 px-3.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200/90 rounded-xl hover:bg-zinc-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Directory</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPrintReportConfig({
                      type: 'daily-log',
                      date: todayDate,
                      entries: todayEntries,
                    })
                  }
                  className="h-9 px-3.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200/90 rounded-xl hover:bg-zinc-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Print Log ({todayEntries.length})</span>
                </button>
              </div>
            </div>

            {/* Minimal 4-Column Summary Strip (Desktop) */}
            <div className="hidden sm:grid grid-cols-4 bg-white border border-zinc-200/80 rounded-2xl divide-x divide-zinc-100">
              <button
                type="button"
                onClick={() => setActiveScreen('daily-log')}
                className="group flex items-center justify-between gap-2 px-5 py-3.5 hover:bg-zinc-50/70 transition-colors cursor-pointer min-w-0 first:rounded-l-2xl"
              >
                <span className="text-xs text-zinc-500 group-hover:text-zinc-900 transition-colors truncate">
                  Today&apos;s Visits
                </span>
                <span className="text-sm font-semibold tabular-nums text-zinc-950 shrink-0">
                  {todayEntries.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveScreen('operations')}
                className="group flex items-center justify-between gap-2 px-5 py-3.5 hover:bg-zinc-50/70 transition-colors cursor-pointer min-w-0"
              >
                <span className="text-xs text-zinc-500 group-hover:text-zinc-900 transition-colors truncate">
                  Inventory
                </span>
                {homeQuickSummary.totalStockAlerts > 0 ? (
                  <span className="text-xs font-semibold tabular-nums text-amber-700 shrink-0">
                    {homeQuickSummary.totalStockAlerts}{' '}
                    {homeQuickSummary.totalStockAlerts === 1 ? 'alert' : 'alerts'}
                  </span>
                ) : (db.medicines || []).length + (db.items || []).length === 0 ? (
                  <span className="text-sm text-zinc-400 shrink-0">—</span>
                ) : (
                  <span className="text-xs font-medium text-emerald-700 shrink-0">In stock</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowIncomingDispatches(true)}
                className="group flex items-center justify-between gap-2 px-5 py-3.5 hover:bg-zinc-50/70 transition-colors cursor-pointer min-w-0"
              >
                <span className="text-xs text-zinc-500 group-hover:text-zinc-900 transition-colors truncate">
                  Hostel Passes
                </span>
                <span
                  className={`text-sm font-semibold tabular-nums shrink-0 ${
                    activeDispatches.length > 0 ? 'text-amber-700' : 'text-zinc-950'
                  }`}
                >
                  {activeDispatches.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => openProgramsTab('insights')}
                className="group flex items-center justify-between gap-2 px-5 py-3.5 hover:bg-zinc-50/70 transition-colors cursor-pointer min-w-0 last:rounded-r-2xl"
              >
                <span className="text-xs text-zinc-500 group-hover:text-zinc-900 transition-colors shrink-0">
                  Top Trend
                </span>
                <span className="flex items-baseline gap-1 min-w-0">
                  <span className="text-xs font-semibold text-zinc-900 truncate">
                    {homeQuickSummary.topIssueLabel || '—'}
                  </span>
                  {homeQuickSummary.topIssueCases > 0 && (
                    <span className="text-[11px] tabular-nums text-zinc-400 shrink-0">
                      ({homeQuickSummary.topIssueCases})
                    </span>
                  )}
                </span>
              </button>
            </div>

            {/* Mobile-only Unboxed Header + Sleek Segmented Switcher */}
            <div className="sm:hidden space-y-3">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-zinc-950 font-display tracking-tight truncate">
                    {todayEntries.length === 0
                      ? 'No visits today'
                      : `${todayEntries.length} visit${todayEntries.length === 1 ? '' : 's'} today`}
                  </h2>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProfileStudentId(null);
                      setActiveScreen('students');
                    }}
                    className="h-8 px-2.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200/80 rounded-lg flex items-center gap-1.5 shrink-0 active:bg-zinc-100 whitespace-nowrap"
                  >
                    <Users className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Directory</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPrintReportConfig({
                        type: 'daily-log',
                        date: todayDate,
                        entries: todayEntries,
                      })
                    }
                    className="h-8 px-2.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200/80 rounded-lg flex items-center gap-1.5 shrink-0 active:bg-zinc-100 whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Print</span>
                  </button>
                </div>
              </div>

              {/* Segmented Switcher: Roster | Visits | Bulk Visit */}
              <div
                role="tablist"
                aria-label="Mobile workspace view"
                className="grid grid-cols-3 gap-1 p-1 bg-zinc-200/60 rounded-xl text-xs font-medium"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileHomeTab === 'roster'}
                  onClick={() => setMobileHomeTab('roster')}
                  className={`py-2 px-2 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    mobileHomeTab === 'roster'
                      ? 'bg-white text-zinc-950 shadow-2xs font-semibold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <span>Roster ({db.students.length})</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileHomeTab === 'visits'}
                  onClick={() => setMobileHomeTab('visits')}
                  className={`py-2 px-2 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    mobileHomeTab === 'visits'
                      ? 'bg-white text-zinc-950 shadow-2xs font-semibold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <span>Today ({todayEntries.length})</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileHomeTab === 'bulk'}
                  onClick={() => setMobileHomeTab('bulk')}
                  className={`py-2 px-2 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    mobileHomeTab === 'bulk'
                      ? 'bg-zinc-900 text-white shadow-2xs font-semibold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <span>Bulk Visit</span>
                </button>
              </div>
            </div>

            {mobileHomeTab === 'bulk' ? (
              <BulkVisitPanel
                students={db.students}
                availableClasses={homeAvailableSections}
                visitedTodayStudentIds={visitedTodayStudentIds}
                medicines={db.medicines || []}
                items={db.items || []}
                settings={db.settings || DEFAULT_INFIRMARY_SETTINGS}
                activeNurseName={currentUser?.displayName || 'School Nurse'}
                onSaveBulkVisits={handleSaveBulkVisits}
                onViewTodaysVisits={() => setMobileHomeTab('visits')}
                onClose={() => setMobileHomeTab('roster')}
              />
            ) : (
            /* 2-Column Split on Desktop | Instant Tab View on Mobile */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT COLUMN (7 COLS): CLASS ROSTER WITH INSTANT SEARCH & FILTERS */}
              <section
                className={`${
                  mobileHomeTab === 'roster' ? 'block' : 'hidden lg:flex'
                } lg:col-span-7 lg:flex-col lg:h-[600px] bg-white border border-zinc-200/80 rounded-2xl overflow-hidden`}
              >
                {/* Search Input Bar */}
                <div className="relative border-b border-zinc-100 shrink-0">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-3.5 sm:top-4 pointer-events-none" />
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
                      } else if (e.key === 'Escape') {
                        if (homeSearchQuery) {
                          setHomeSearchQuery('');
                        } else {
                          (e.currentTarget as HTMLInputElement).blur();
                        }
                      }
                    }}
                    placeholder="Search name, roll number, or class..."
                    className="w-full h-11 sm:h-12 pl-10 sm:pl-11 pr-11 text-sm text-zinc-950 bg-transparent placeholder:text-zinc-400 focus:outline-none"
                  />
                  {homeSearchQuery ? (
                    <button
                      type="button"
                      onClick={() => setHomeSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-3 top-3 p-1 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : (
                    <kbd
                      aria-hidden="true"
                      className="hidden sm:inline-flex items-center justify-center absolute right-4 top-1/2 -translate-y-1/2 h-5 min-w-[20px] px-1.5 text-[11px] font-medium text-zinc-400 bg-zinc-100 rounded pointer-events-none"
                    >
                      /
                    </kbd>
                  )}
                </div>

                {/* Roster Filter Bar */}
                <div className="px-4 py-2.5 border-b border-zinc-100 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar shrink-0">
                  <div className="flex items-center gap-1.5 shrink-0">
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
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        rosterFilter === 'all'
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setRosterFilter('visited-today')}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        rosterFilter === 'visited-today'
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                      }`}
                    >
                      Seen Today ({visitedTodayStudentIds.size})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRosterFilter('health-notes')}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        rosterFilter === 'health-notes'
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                      }`}
                    >
                      <span className="sm:hidden">Notes ({healthNoteByStudentId.size})</span>
                      <span className="hidden sm:inline">Health Notes ({healthNoteByStudentId.size})</span>
                    </button>
                  </div>

                  <span className="hidden sm:inline text-xs text-zinc-400 tabular-nums shrink-0">
                    {homeFilteredStudents.length} shown
                  </span>
                </div>

                {/* Student Rows */}
                <div
                  data-testid="home-search-results"
                  className="divide-y divide-zinc-100 lg:flex-1 lg:overflow-y-auto smooth-scroll-list"
                >
                  {homeFilteredStudents.length === 0 ? (
                    <div className="py-14 px-6 text-center text-xs text-zinc-500">
                      No student matching current filter.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setHomeSearchQuery('');
                          setRosterFilter('all');
                        }}
                        className="text-zinc-900 font-semibold hover:underline ml-1"
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
                          className="list-row-opt group px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-zinc-50/80 active:bg-zinc-100/60 transition-colors cursor-pointer select-none focus:outline-none focus-visible:bg-zinc-50"
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1 overflow-hidden">
                            <span className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-600 group-hover:bg-zinc-200/70 group-hover:text-zinc-900 font-mono tabular-nums text-xs font-medium flex items-center justify-center shrink-0 transition-colors">
                              {stu.roll_number}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-medium text-zinc-950 truncate block text-left">
                                {stu.full_name}
                              </span>

                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-400 mt-0.5">
                                <span className="text-zinc-500">{stu.section}</span>
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
                                    <span className="text-teal-700 font-medium">
                                      Seen today
                                    </span>
                                  </>
                                )}
                                {healthNote && (
                                  <>
                                    <span aria-hidden="true" className="text-zinc-300">·</span>
                                    <span className="text-amber-700 font-medium truncate max-w-[200px] sm:max-w-[260px]">
                                      {healthNote.condition_or_note}
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
                              className="h-8 px-3 text-xs font-medium text-zinc-700 bg-zinc-100/80 hover:bg-zinc-900 hover:text-white active:bg-zinc-800 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Visit</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {/* RIGHT COLUMN (5 COLS): RECENT & TODAY'S INFIRMARY VISITS */}
              <section
                className={`${
                  mobileHomeTab === 'visits' ? 'block' : 'hidden lg:flex'
                } lg:col-span-5 lg:flex-col lg:h-[600px] bg-white border border-zinc-200/80 rounded-2xl overflow-hidden`}
              >
                <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between gap-3 shrink-0">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-950 font-display">
                      Recent Infirmary Visits
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {todayEntries.length} recorded today
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveScreen('daily-log')}
                    className="px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 bg-zinc-100/80 hover:bg-zinc-200/70 rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                  >
                    Daily Log
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="divide-y divide-zinc-100 lg:flex-1 lg:overflow-y-auto smooth-scroll-list">
                  {recentVisits.length === 0 ? (
                    <div className="py-14 px-6 text-center text-xs text-zinc-500">
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
                        className="group px-5 py-4 flex items-start justify-between gap-3 hover:bg-zinc-50/80 active:bg-zinc-100/60 transition-colors cursor-pointer select-none"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                            <span className="text-sm font-medium text-zinc-950 text-left">
                              {student.full_name}
                            </span>
                            <span className="text-zinc-300" aria-hidden="true">·</span>
                            <span className="font-mono text-zinc-500">
                              {student.section} · Roll {student.roll_number}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-zinc-400">
                            <span>
                              {extractDatePart(visit.visit_datetime)} · {formatTimeFromDatetime(visit.visit_datetime)}
                            </span>
                            <span className="text-zinc-300" aria-hidden="true">·</span>
                            <span className="font-sans font-medium text-zinc-500">
                              {formatShiftPeriodLabel(resolveVisitShiftPeriod(visit, db.settings), true)}
                            </span>
                          </div>

                          <p className="text-xs font-medium text-zinc-800 pt-0.5">
                            {visit.reason}
                          </p>
                          <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
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
                          className="h-8 px-2.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 border border-zinc-200/80 bg-white hover:bg-zinc-50 rounded-lg inline-flex items-center gap-1 shrink-0 transition-colors"
                        >
                          <Printer className="w-3 h-3" />
                          Slip
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
            )}
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
            medicines={db.medicines || []}
            items={db.items || []}
            settings={db.settings || DEFAULT_INFIRMARY_SETTINGS}
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
              const useReplaceAll = Boolean(isAdmin && replaceAll);
              const baseStudents = useReplaceAll ? [] : [...db.students];
              const existingIds = baseStudents.map((s) => s.student_id);
              const createdStudents: StudentRecord[] = [];
              rows.forEach((r) => {
                const id = generatePermanentId('STU', [
                  ...existingIds,
                  ...createdStudents.map((c) => c.student_id),
                ]);
                const cleanSec =
                  sanitizeClassSectionName(r.section) || normalizeSectionName(r.section);
                const rawRoll = String(r.rollNumber || '').trim();
                createdStudents.push({
                  student_id: id,
                  full_name: r.fullName.trim(),
                  section: cleanSec,
                  roll_number: /^\d+$/.test(rawRoll) ? rawRoll.padStart(2, '0') : rawRoll,
                  active_status: 'Active',
                  created_at: nowIso,
                  updated_at: nowIso,
                });
              });
              if (createdStudents.length === 0) return;
              const nextStudents = [...baseStudents, ...createdStudents];
              setDb((prev) => ({
                ...prev,
                students: nextStudents,
                classes: getAllClassSections(nextStudents, prev.classes),
              }));
              void persistMutationToServer(
                {
                  action: 'bulkImportStudents',
                  students: createdStudents,
                  replaceAll: useReplaceAll,
                },
                'bulk student import'
              );
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
            settings={db.settings || DEFAULT_INFIRMARY_SETTINGS}
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

        {/* SCREEN 4B: OPERATIONS WORKSPACE (MEDICINES, ITEMS, BILLS & STOCK LEDGER) */}
        {effectiveScreen === 'operations' && (
          <OperationsWorkspaceView
            medicines={db.medicines || []}
            items={db.items || []}
            stockTransactions={db.stockTransactions || []}
            bills={db.bills || []}
            onUpsertMedicine={handleUpsertMedicine}
            onDeleteMedicine={handleDeleteMedicine}
            onUpsertItem={handleUpsertItem}
            onDeleteItem={handleDeleteItem}
            onAdjustStock={handleAdjustStock}
            onCreateBill={handleCreateBill}
            onUpdateBill={handleUpdateBill}
            onDeleteBill={handleDeleteBill}
            onDownloadExcelSheet={handleDownloadExcelSheet}
          />
        )}

        {/* SCREEN 4C: CLINICAL PROGRAMS (DOCTOR, OPD, CAMPS, ANNUAL CHECKUPS, MENSTRUAL, INSIGHTS) */}
        {effectiveScreen === 'programs' && (
          <ProgramsWorkspaceView
            students={db.students}
            classes={homeAvailableSections}
            visits={db.visits}
            items={db.items || []}
            doctorVisits={db.doctorVisits || []}
            doctorVisitCases={db.doctorVisitCases || []}
            opdRecords={db.opdRecords || []}
            medicalCamps={db.medicalCamps || []}
            campScreenings={db.campScreenings || []}
            annualCheckups={db.annualCheckups || []}
            menstrualLogs={db.menstrualLogs || []}
            onUpsertDoctorVisit={handleUpsertDoctorVisit}
            onDeleteDoctorVisit={handleDeleteDoctorVisit}
            onUpsertDoctorVisitCase={handleUpsertDoctorVisitCase}
            onDeleteDoctorVisitCase={handleDeleteDoctorVisitCase}
            onCreateOpd={handleCreateOpd}
            onUpdateOpd={handleUpdateOpd}
            onDeleteOpd={handleDeleteOpd}
            onUpsertMedicalCamp={handleUpsertMedicalCamp}
            onDeleteMedicalCamp={handleDeleteMedicalCamp}
            onUpsertCampScreening={handleUpsertCampScreening}
            onDeleteCampScreening={handleDeleteCampScreening}
            onUpsertAnnualCheckup={handleUpsertAnnualCheckup}
            onDeleteAnnualCheckup={handleDeleteAnnualCheckup}
            onUpsertMenstrualLog={handleUpsertMenstrualLog}
            onDeleteMenstrualLog={handleDeleteMenstrualLog}
            onDownloadExcelSheet={handleDownloadExcelSheet}
            onSelectStudent={(student) => openStudentProfile(student.student_id)}
            initialTab={programsTargetTab}
            initialTabNonce={programsTargetNonce}
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

        {/* SCREEN 6: ADMIN PORTAL (USERS, CLASSES, STUDENTS, INFIRMARY HOURS) */}
        {effectiveScreen === 'admin-panel' && isAdmin && (
          <AdminPanelView
            currentUser={currentUser}
            students={db.students}
            classes={homeAvailableSections}
            users={db.users || []}
            settings={db.settings || DEFAULT_INFIRMARY_SETTINGS}
            onCreateStudent={handleAdminCreateStudent}
            onUpdateStudent={handleUpdateStudent}
            onCreateClass={handleCreateClass}
            onRenameClass={handleRenameClass}
            onDeleteClass={handleDeleteClass}
            onUpsertUser={handleUpsertUser}
            onDeleteUser={handleDeleteUser}
            onUpdateSchoolHours={handleUpdateSchoolHours}
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
                  Google Sheets, PDF &amp; Excel
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Download Sheets (PDF &amp; Excel)
                </>
              )}
            </button>
          </div>
        </div>
      </footer>

      {/* MOBILE FIXED 5-ITEM BOTTOM NAVIGATION BAR */}
      {activeScreen !== 'new-visit' && (
        <nav
          aria-label="Mobile Bottom Navigation"
          className="no-print sm:hidden fixed bottom-0 inset-x-0 z-40 chrome-sticky bg-white/95 border-t border-zinc-200/80 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-1.5"
        >
          <div className="grid grid-cols-5 items-center px-1">
            <button
              type="button"
              onClick={() => setActiveScreen('home')}
              className={`flex flex-col items-center justify-center py-1 px-0.5 rounded-xl transition-all ${
                activeScreen === 'home' || activeScreen === 'students'
                  ? 'text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-700 active:scale-95'
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-colors ${
                  activeScreen === 'home' || activeScreen === 'students'
                    ? 'bg-zinc-100 text-zinc-950'
                    : ''
                }`}
              >
                <Home className="w-5 h-5" />
              </div>
              <span className="text-[10px] leading-tight mt-0.5 whitespace-nowrap">Infirmary</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveScreen('daily-log')}
              className={`flex flex-col items-center justify-center py-1 px-0.5 rounded-xl transition-all relative ${
                activeScreen === 'daily-log'
                  ? 'text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-700 active:scale-95'
              }`}
            >
              <div
                className={`p-1 rounded-lg relative transition-colors ${
                  activeScreen === 'daily-log' ? 'bg-zinc-100 text-zinc-950' : ''
                }`}
              >
                <ClipboardList className="w-5 h-5" />
                {todayEntries.length > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 min-w-[17px] h-[17px] bg-zinc-900 text-white text-[10px] font-semibold rounded-full flex items-center justify-center ring-2 ring-white">
                    {todayEntries.length}
                  </span>
                )}
              </div>
              <span className="text-[10px] leading-tight mt-0.5 whitespace-nowrap">Daily Log</span>
            </button>

            {/* Central Record Visit Action Button */}
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
                className="w-10 h-10 rounded-full bg-zinc-900 text-white shadow-sm flex items-center justify-center active:scale-95 transition-all hover:bg-zinc-800"
              >
                <Plus className="w-5 h-5 stroke-[2.25]" />
              </button>
              <span className="text-[10px] font-medium text-zinc-700 leading-tight mt-0.5 whitespace-nowrap">
                Record
              </span>
            </div>

            <button
              type="button"
              onClick={() => openProgramsTab('hub')}
              className={`flex flex-col items-center justify-center py-1 px-0.5 rounded-xl transition-all relative ${
                effectiveScreen === 'programs'
                  ? 'text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-700 active:scale-95'
              }`}
            >
              <div
                className={`p-1 rounded-lg relative transition-colors ${
                  effectiveScreen === 'programs' ? 'bg-zinc-100 text-zinc-950' : ''
                }`}
              >
                <Stethoscope className="w-5 h-5" />
              </div>
              <span className="text-[10px] leading-tight mt-0.5 whitespace-nowrap">Programs</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveScreen('operations')}
              className={`flex flex-col items-center justify-center py-1 px-0.5 rounded-xl transition-all relative ${
                effectiveScreen === 'operations'
                  ? 'text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-700 active:scale-95'
              }`}
            >
              <div
                className={`p-1 rounded-lg relative transition-colors ${
                  effectiveScreen === 'operations' ? 'bg-zinc-100 text-zinc-950' : ''
                }`}
              >
                <Package className="w-5 h-5" />
              </div>
              <span className="text-[10px] leading-tight mt-0.5 whitespace-nowrap">Stock</span>
            </button>
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
