import React, { useState, useEffect, useMemo } from 'react';
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
  Cloud,
  HeartPulse,
} from 'lucide-react';
import {
  generatePermanentId,
  searchStudents,
  formatMedicineDisplay,
  formatTimeFromDatetime,
  extractDatePart,
  getDailyVisitLog,
  getStudentMeasurements,
  normalizeSheetSyncPayload,
  normalizeSectionName,
  normalizeDatetimeString,
  normalizeDateOnlyString,
  normalizeTimeOnlyString,
  type NurseDatabase,
  type StudentRecord,
  type VisitRecord,
  type MeasurementRecord,
  type HealthProfileRecord,
  type VisitFormInput,
  type DailyLogEntry,
} from './utils/nurseLogic';
import {
  createInitialSeedDatabase,
  getTodayLocalDateString,
  SCHOOL_NAME,
  SCHOOL_LOGO_URL,
  SCHOOL_LOGO_FALLBACK_URL,
  DEFAULT_STAFF_NAME,
  DEFAULT_APPS_SCRIPT_URL,
} from './utils/seedData';
import { VisitEntryForm } from './components/VisitEntryForm';
import { StudentProfileView } from './components/StudentProfileView';
import { DailyLogView } from './components/DailyLogView';
import { SheetsSetupView } from './components/SheetsSetupView';
import { PrintableReport, type PrintReportConfig } from './components/PrintableReport';

type ActiveScreen = 'home' | 'new-visit' | 'students' | 'daily-log' | 'sheets-setup';
type RosterFilterMode = 'all' | 'visited-today' | 'health-notes';

const STORAGE_KEY = 'sva_infirmary_db_v5';
const APPS_SCRIPT_URL_KEY = 'sva_infirmary_apps_script_url_v1';

function normalizeDatabaseSections(inputDb: NurseDatabase): NurseDatabase {
  return {
    students: (inputDb.students || []).map((s) => ({
      ...s,
      section: normalizeSectionName(s.section),
    })),
    visits: (inputDb.visits || []).map((v) => ({
      ...v,
      visit_datetime: normalizeDatetimeString(v.visit_datetime),
      administration_time: normalizeTimeOnlyString(v.administration_time),
    })),
    measurements: (inputDb.measurements || []).map((m) => ({
      ...m,
      measurement_date: normalizeDateOnlyString(m.measurement_date),
    })),
    healthProfiles: (inputDb.healthProfiles || []).map((h) => ({
      ...h,
      date_recorded: normalizeDateOnlyString(h.date_recorded),
      last_reviewed: normalizeDateOnlyString(h.last_reviewed),
    })),
  };
}

export default function App() {
  const [deviceId] = useState<string>(() => `dev-${Math.random().toString(36).slice(2, 10)}`);

  const [db, setDb] = useState<NurseDatabase>(() => {
    const seedDb = normalizeDatabaseSections(createInitialSeedDatabase());
    try {
      const saved =
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem('sva_nurse_room_db_v5') ||
        localStorage.getItem('sva_nurse_room_db_v4');
      if (saved) {
        const parsed = normalizeDatabaseSections(JSON.parse(saved) as NurseDatabase);
        if (parsed && Array.isArray(parsed.students) && Array.isArray(parsed.visits)) {
          if (parsed.students.length < seedDb.students.length) {
            const existingIds = new Set(parsed.students.map((s) => s.student_id));
            const mergedStudents = [...parsed.students];
            for (const seedStu of seedDb.students) {
              if (!existingIds.has(seedStu.student_id)) {
                mergedStudents.push(seedStu);
              }
            }
            return { ...parsed, students: mergedStudents };
          }
          return parsed;
        }
      }
    } catch {
      // Fallback to seed database
    }
    return seedDb;
  });

  const [appsScriptUrl, setAppsScriptUrl] = useState<string>(DEFAULT_APPS_SCRIPT_URL);

  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    try {
      const saved =
        localStorage.getItem('sva_infirmary_auto_sync_v1') ||
        localStorage.getItem('sva_nurse_auto_sync_v1');
      return saved ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'students') return 'students';
    if (hash === 'daily-log') return 'daily-log';
    if (hash === 'sheets-setup') return 'sheets-setup';
    if (hash === 'new-visit' || hash === 'record') return 'new-visit';
    return 'home';
  });
  const [preselectedStudentIdForVisit, setPreselectedStudentIdForVisit] = useState<string>('');
  const [selectedProfileStudentId, setSelectedProfileStudentId] = useState<string | null>(null);
  const [printReportConfig, setPrintReportConfig] = useState<PrintReportConfig | null>(null);

  // Sync hash changes with activeScreen for browser navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'students') setActiveScreen('students');
      else if (hash === 'daily-log') setActiveScreen('daily-log');
      else if (hash === 'sheets-setup') setActiveScreen('sheets-setup');
      else if (hash === 'new-visit' || hash === 'record') setActiveScreen('new-visit');
      else if (hash === 'home' || !hash) setActiveScreen('home');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [homeSearchQuery, setHomeSearchQuery] = useState('');
  const [homeSectionFilter, setHomeSectionFilter] = useState<string>('ALL');
  const [rosterFilter, setRosterFilter] = useState<RosterFilterMode>('all');
  const [mobileHomeTab, setMobileHomeTab] = useState<'roster' | 'visits'>('roster');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Ignore storage quota errors
    }
  }, [db]);

  // Connect to shared school server & real-time SSE stream so all phones/laptops share live data
  useEffect(() => {
    let isMounted = true;
    fetch('/api/state')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data || data.status !== 'ok') return;
        if (data.db) {
          const serverDb = normalizeDatabaseSections(data.db);
          const serverVisitIds = new Set(serverDb.visits.map((v) => v.visit_id));
          const serverMeasIds = new Set(serverDb.measurements.map((m) => m.measurement_id));
          const serverProfileIds = new Set(
            serverDb.healthProfiles.map((h) => h.health_record_id)
          );

          // Reconcile any local phone visits/measurements/profiles not yet on server or Google Sheet
          setDb((prev) => {
            const localUnsyncedVisits = prev.visits.filter(
              (v) => v.visit_id && !serverVisitIds.has(v.visit_id)
            );
            for (const visit of localUnsyncedVisits) {
              fetch('/api/mutate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'recordVisit', visit, deviceId }),
              }).catch(() => {});
            }

            const localUnsyncedMeas = prev.measurements.filter(
              (m) => m.measurement_id && !serverMeasIds.has(m.measurement_id)
            );
            for (const measurement of localUnsyncedMeas) {
              fetch('/api/mutate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'addMeasurement', measurement, deviceId }),
              }).catch(() => {});
            }

            const localUnsyncedProfiles = prev.healthProfiles.filter(
              (h) => h.health_record_id && !serverProfileIds.has(h.health_record_id)
            );
            for (const healthProfile of localUnsyncedProfiles) {
              fetch('/api/mutate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'addHealthProfile', healthProfile, deviceId }),
              }).catch(() => {});
            }

            return normalizeDatabaseSections(normalizeSheetSyncPayload(serverDb, prev));
          });
        }
        if (typeof data.appsScriptUrl === 'string' && data.appsScriptUrl) {
          setAppsScriptUrl(data.appsScriptUrl);
        }
        if (typeof data.autoSyncEnabled === 'boolean') {
          setAutoSyncEnabled(data.autoSyncEnabled);
        }
      })
      .catch(() => {});

    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/stream');
      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg && msg.type === 'state-update' && msg.sourceDeviceId !== deviceId && msg.db) {
            setDb((prev) =>
              normalizeDatabaseSections(normalizeSheetSyncPayload(msg.db, prev))
            );
            if (typeof msg.appsScriptUrl === 'string') {
              setAppsScriptUrl(msg.appsScriptUrl);
            }
          }
        } catch {
          // Ignore malformed event
        }
      };
    } catch {
      // Fallback if EventSource unavailable
    }

    return () => {
      isMounted = false;
      es?.close();
    };
  }, [deviceId]);

  const syncWithSheetUrl = async (targetUrl: string, silent: boolean = false) => {
    if (!targetUrl) return;
    try {
      const serverRes = await fetch('/api/sheets-sync', { method: 'POST' }).catch(() => null);
      if (serverRes && serverRes.ok) {
        const sData = await serverRes.json();
        if (sData && sData.db) {
          setDb((prev) =>
            normalizeDatabaseSections(normalizeSheetSyncPayload(sData.db, prev))
          );
        }
        if (sData && sData.status === 'ok') {
          setSyncStatusMessage(`${sData.message} (${new Date().toLocaleTimeString()})`);
          return;
        }
      }

      const res = await fetch(targetUrl, { method: 'GET' });
      const data = await res.json();
      if (data && data.status === 'ok') {
        const nowIso = new Date().toISOString();
        const remoteVisitIds = new Set(
          (Array.isArray(data.visits) ? data.visits : []).map((v: Partial<VisitRecord>) =>
            String(v?.visit_id || '').trim()
          )
        );
        const unsyncedVisits = db.visits.filter(
          (v) => v.visit_id && !remoteVisitIds.has(v.visit_id)
        );
        for (const visit of unsyncedVisits) {
          fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'createVisit', visit }),
          }).catch(() => {});
        }

        let updatedStudentCount = db.students.length;
        setDb((prev) => {
          const merged = normalizeDatabaseSections(
            normalizeSheetSyncPayload(data, prev, nowIso)
          );
          updatedStudentCount = merged.students.length;
          return merged;
        });

        setSyncStatusMessage(
          `Synced with Google Sheets (${updatedStudentCount} students) at ${new Date().toLocaleTimeString()}.`
        );
      } else if (!silent) {
        setSyncStatusMessage(`Sheets returned: ${data?.message || 'Unexpected response'}`);
      }
    } catch (err) {
      if (!silent) {
        setSyncStatusMessage(
          `Unable to reach Apps Script URL (${err instanceof Error ? err.message : 'Network error'}). Shared school database remains active.`
        );
      }
    }
  };

  // Smart auto-sync on tab visibility focus and 15s background check when active
  useEffect(() => {
    if (!autoSyncEnabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetch('/api/state')
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d && d.db) {
              setDb((prev) =>
                normalizeDatabaseSections(normalizeSheetSyncPayload(d.db, prev))
              );
            }
          })
          .catch(() => {});
        if (appsScriptUrl) {
          syncWithSheetUrl(appsScriptUrl, true);
        }
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && appsScriptUrl) {
        syncWithSheetUrl(appsScriptUrl, true);
      }
    }, 15000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appsScriptUrl, autoSyncEnabled]);

  const handleToggleAutoSync = (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    try {
      localStorage.setItem('sva_infirmary_auto_sync_v1', String(enabled));
    } catch {
      // Ignore
    }
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoSyncEnabled: enabled, deviceId }),
    }).catch(() => {});
  };

  const handleSaveAppsScriptUrl = (url: string) => {
    setAppsScriptUrl(url);
    try {
      localStorage.setItem(APPS_SCRIPT_URL_KEY, url);
    } catch {
      // Ignore
    }
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appsScriptUrl: url, triggerSync: Boolean(url), deviceId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.db) {
          setDb((prev) =>
            normalizeDatabaseSections(normalizeSheetSyncPayload(d.db, prev))
          );
        }
      })
      .catch(() => {});

    if (url) {
      setSyncStatusMessage('Automated sync activated: syncing with Google Sheets...');
      handlePushToSheets().then(() => syncWithSheetUrl(url, true));
    } else {
      setSyncStatusMessage('Cleared Google Sheet URL. School device sync remains active.');
    }
  };

  const handleSyncFromSheets = async () => {
    await syncWithSheetUrl(appsScriptUrl);
  };

  const handlePushToSheets = async () => {
    if (!appsScriptUrl) return;
    try {
      setSyncStatusMessage('Syncing all school records with Google Sheets...');
      const serverPush = await fetch('/api/sheets-push', { method: 'POST' }).catch(() => null);
      if (serverPush && serverPush.ok) {
        const sRes = await serverPush.json();
        if (sRes && sRes.db) {
          setDb((prev) =>
            normalizeDatabaseSections(normalizeSheetSyncPayload(sRes.db, prev))
          );
        }
        setSyncStatusMessage(`${sRes.message} (${new Date().toLocaleTimeString()})`);
        return;
      }

      await syncWithSheetUrl(appsScriptUrl);
    } catch (err) {
      setSyncStatusMessage(
        `Unable to sync with Google Sheets (${err instanceof Error ? err.message : 'Network error'}).`
      );
    }
  };

  const handleSaveVisit = async (input: VisitFormInput): Promise<VisitRecord> => {
    const visitId = generatePermanentId(
      'VIS',
      db.visits.map((v) => v.visit_id)
    );
    const nowIso = new Date().toISOString();

    const newVisit: VisitRecord = {
      visit_id: visitId,
      student_id: input.student_id,
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
      recorded_by: input.recorded_by.trim() || DEFAULT_STAFF_NAME,
      created_at: nowIso,
    };

    setDb((prev) => ({
      ...prev,
      visits: [newVisit, ...prev.visits],
    }));

    // Sync to shared school server (which forwards action: 'createVisit' to Google Sheets & broadcasts to all phones)
    fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'recordVisit', visit: newVisit, deviceId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((resData) => {
        if (!resData || resData.sheetSynced === false) {
          // Direct browser fallback to Google Apps Script if server couldn't reach it
          if (appsScriptUrl) {
            fetch(appsScriptUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'createVisit', visit: newVisit }),
            }).catch(() => {});
          }
        }
      })
      .catch(() => {
        if (appsScriptUrl) {
          fetch(appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'createVisit', visit: newVisit }),
          }).catch(() => {});
        }
      });

    return newVisit;
  };

  const handleCreateStudent = (
    fullName: string,
    section: string,
    rollNumber: string
  ): StudentRecord => {
    const studentId = generatePermanentId(
      'STU',
      db.students.map((s) => s.student_id)
    );
    const nowIso = new Date().toISOString();
    const newStudent: StudentRecord = {
      student_id: studentId,
      full_name: fullName,
      section: normalizeSectionName(section),
      roll_number: rollNumber,
      active_status: 'Active',
      created_at: nowIso,
      updated_at: nowIso,
    };

    setDb((prev) => ({
      ...prev,
      students: [...prev.students, newStudent],
    }));

    fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'createStudent', student: newStudent, deviceId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((resData) => {
        if ((!resData || resData.sheetSynced === false) && appsScriptUrl) {
          fetch(appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'createStudent', student: newStudent }),
          }).catch(() => {});
        }
      })
      .catch(() => {
        if (appsScriptUrl) {
          fetch(appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'createStudent', student: newStudent }),
          }).catch(() => {});
        }
      });

    return newStudent;
  };

  const handleAddMeasurement = (
    studentId: string,
    date: string,
    heightCm: number,
    weightKg: number,
    notes: string
  ) => {
    const measurementId = generatePermanentId(
      'MSR',
      db.measurements.map((m) => m.measurement_id)
    );
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

    fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addMeasurement', measurement: newMeas, deviceId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((resData) => {
        if ((!resData || resData.sheetSynced === false) && appsScriptUrl) {
          fetch(appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'addMeasurement', measurement: newMeas }),
          }).catch(() => {});
        }
      })
      .catch(() => {
        if (appsScriptUrl) {
          fetch(appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'addMeasurement', measurement: newMeas }),
          }).catch(() => {});
        }
      });
  };

  const handleAddHealthProfile = (
    studentId: string,
    conditionOrNote: string,
    status: 'Active' | 'Monitoring' | 'Resolved'
  ) => {
    const recordId = generatePermanentId(
      'HPR',
      db.healthProfiles.map((h) => h.health_record_id)
    );
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

    fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addHealthProfile', healthProfile: newProfile, deviceId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((resData) => {
        if ((!resData || resData.sheetSynced === false) && appsScriptUrl) {
          fetch(appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'addHealthProfile', healthProfile: newProfile }),
          }).catch(() => {});
        }
      })
      .catch(() => {
        if (appsScriptUrl) {
          fetch(appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'addHealthProfile', healthProfile: newProfile }),
          }).catch(() => {});
        }
      });
  };

  const startNewVisitForStudent = (studentId: string = '') => {
    setPreselectedStudentIdForVisit(studentId);
    setActiveScreen('new-visit');
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

  const homeAvailableSections = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const s of db.students) {
      const sec = s.section.trim();
      if (sec && !seen.has(sec.toLowerCase())) {
        seen.add(sec.toLowerCase());
        list.push(sec);
      }
    }
    return list;
  }, [db.students]);

  const homeFilteredStudents = useMemo(() => {
    const matches = searchStudents(db.students, homeSearchQuery, homeSectionFilter);
    if (rosterFilter === 'visited-today') {
      return matches.filter((s) => visitedTodayStudentIds.has(s.student_id));
    }
    if (rosterFilter === 'health-notes') {
      return matches.filter((s) => healthNoteByStudentId.has(s.student_id));
    }
    return matches;
  }, [db.students, homeSearchQuery, homeSectionFilter, rosterFilter, visitedTodayStudentIds, healthNoteByStudentId]);

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
      {/* DESKTOP HEADER (Preserved exactly for PC) */}
      <header className="no-print hidden sm:flex sticky top-0 z-30 bg-[#FBFAF8]/95 backdrop-blur-md border-b border-stone-200/80 px-8 py-2.5 items-center justify-between gap-8">
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
              activeScreen === 'daily-log'
                ? 'text-zinc-900 font-semibold underline decoration-2 underline-offset-8'
                : ''
            }`}
          >
            Daily Log
          </a>
          <a
            href="#sheets-setup"
            onClick={(e) => {
              e.preventDefault();
              setActiveScreen('sheets-setup');
            }}
            className={`hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 py-0.5 ${
              activeScreen === 'sheets-setup'
                ? 'text-zinc-900 font-semibold underline decoration-2 underline-offset-8'
                : ''
            }`}
          >
            Google Sheets
          </a>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() =>
              startNewVisitForStudent(
                activeScreen === 'students' && selectedProfileStudentId
                  ? selectedProfileStudentId
                  : ''
              )
            }
            className="h-9 px-3.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.99]"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.25]" />
            <span>Record Visit</span>
          </button>
        </div>
      </header>

      {/* MOBILE HEADER (School Branding given full space - NEVER cut off) */}
      <header className="no-print sm:hidden sticky top-0 z-40 bg-[#FBFAF8]/95 backdrop-blur-md border-b border-stone-200/80 px-3 py-2.5 flex items-center justify-between gap-2 shadow-2xs">
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
        ) : activeScreen === 'sheets-setup' ? (
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
              Google Sheets Sync
            </span>
            <span className="w-8" />
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

            {activeScreen !== 'home' && (
              <div className="flex items-center gap-1.5 shrink-0">
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
                  className="h-8 px-2.5 rounded-lg bg-white border border-stone-200/90 shadow-2xs flex items-center gap-1 text-xs font-medium text-zinc-700 active:bg-stone-100 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5 text-zinc-600" />
                  <span className="hidden min-[380px]:inline text-[11px]">Print Log</span>
                </button>
              </div>
            )}
          </>
        )}
      </header>

      {/* MAIN CONTENT VIEWPORT */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3.5 sm:px-8 py-3.5 sm:py-8 pb-28 sm:pb-8">
        {/* SCREEN 1: INFIRMARY WORKSPACE */}
        {activeScreen === 'home' && (
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
                    <select
                      aria-label="Filter by class section"
                      value={homeSectionFilter}
                      onChange={(e) => setHomeSectionFilter(e.target.value)}
                      className="h-7 px-2 text-[11px] sm:text-xs font-medium text-zinc-800 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-zinc-900 shrink-0"
                    >
                      <option value="ALL">All Classes ({db.students.length})</option>
                      {homeAvailableSections.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec}
                        </option>
                      ))}
                    </select>
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

                {/* Student Rows (Natural page scroll on mobile, equal-height scrollable panel on lg desktop) */}
                <div
                  data-testid="home-search-results"
                  className="divide-y divide-stone-100 lg:flex-1 lg:overflow-y-auto"
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
                          className="group px-3.5 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-stone-50/90 active:bg-stone-100/70 transition-colors cursor-pointer select-none focus:outline-none focus-visible:bg-stone-50"
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

                <div className="divide-y divide-stone-100 lg:flex-1 lg:overflow-y-auto">
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
        {activeScreen === 'new-visit' && (
          <VisitEntryForm
            students={db.students}
            visits={db.visits}
            measurements={db.measurements}
            healthProfiles={db.healthProfiles}
            initialStudentId={preselectedStudentIdForVisit}
            onSaveVisit={handleSaveVisit}
            onQuickCreateStudent={handleCreateStudent}
            onOpenStudentProfile={openStudentProfile}
            onCancel={() => setActiveScreen('home')}
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
        {activeScreen === 'students' && (
          <StudentProfileView
            students={db.students}
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
                fetch('/api/mutate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'bulkImportStudents',
                    students: batchToSync,
                    replaceAll,
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
        {activeScreen === 'daily-log' && (
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

        {/* SCREEN 5: GOOGLE SHEETS & APPS SCRIPT SYNC */}
        {activeScreen === 'sheets-setup' && (
          <SheetsSetupView
            db={db}
            appsScriptUrl={appsScriptUrl}
            onSaveAppsScriptUrl={handleSaveAppsScriptUrl}
            onSyncFromSheets={handleSyncFromSheets}
            onPushToSheets={handlePushToSheets}
            autoSyncEnabled={autoSyncEnabled}
            onToggleAutoSync={handleToggleAutoSync}
            syncStatusMessage={syncStatusMessage}
            onBackToHome={() => setActiveScreen('home')}
          />
        )}
      </main>

      {/* FOOTER: QUIET DESKTOP FOOTER */}
      <footer className="no-print hidden sm:block border-t border-stone-200/60 px-4 sm:px-8 py-4 mt-6 sm:mt-10">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-400">
          <span>{SCHOOL_NAME} · School Infirmary</span>
          <button
            type="button"
            onClick={() => setActiveScreen('sheets-setup')}
            className={`inline-flex items-center gap-1.5 transition-colors ${
              activeScreen === 'sheets-setup'
                ? 'text-zinc-900 font-semibold'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                appsScriptUrl ? 'bg-teal-600' : 'bg-stone-300'
              }`}
              aria-hidden="true"
            />
            Google Sheets Sync &amp; CSV Backup
          </button>
        </div>
      </footer>

      {/* MOBILE FIXED 5-ITEM BOTTOM NAVIGATION BAR WITH CENTRAL RECORD VISIT ACTION */}
      {activeScreen !== 'new-visit' && (
        <nav
          aria-label="Mobile Bottom Navigation"
          className="no-print sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-1"
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

            <button
              type="button"
              onClick={() => setActiveScreen('sheets-setup')}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all relative ${
                activeScreen === 'sheets-setup'
                  ? 'text-teal-900 font-bold'
                  : 'text-zinc-400 hover:text-zinc-700 active:scale-95'
              }`}
            >
              <div
                className={`p-1 rounded-lg relative transition-colors ${
                  activeScreen === 'sheets-setup' ? 'bg-teal-100/80 text-teal-800' : ''
                }`}
              >
                <Cloud className="w-5 h-5" />
                <span
                  className={`absolute top-0 right-0 w-2 h-2 rounded-full ring-2 ring-white ${
                    appsScriptUrl ? 'bg-teal-600' : 'bg-stone-300'
                  }`}
                />
              </div>
              <span className="text-[10px] leading-tight mt-0.5">Cloud Sync</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
