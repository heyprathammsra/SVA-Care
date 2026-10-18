import React, { useState, useMemo } from 'react';
import {
  Search,
  Printer,
  Plus,
  ArrowLeft,
  Upload,
  Check,
  X,
  HeartPulse,
  Ruler,
  Clock,
  UserCheck,
} from 'lucide-react';
import {
  searchStudents,
  getStudentVisitHistory,
  getStudentMeasurements,
  formatMedicineDisplay,
  extractDatePart,
  formatTimeFromDatetime,
  parseStudentImportText,
  type StudentRecord,
  type VisitRecord,
  type MeasurementRecord,
  type HealthProfileRecord,
} from '../utils/nurseLogic';
import { SCHOOL_CLASSES, getTodayLocalDateString, DEFAULT_STAFF_NAME } from '../utils/seedData';

interface StudentProfileViewProps {
  students: StudentRecord[];
  visits: VisitRecord[];
  measurements: MeasurementRecord[];
  healthProfiles: HealthProfileRecord[];
  selectedStudentId: string | null;
  onSelectStudentId: (studentId: string | null) => void;
  onStartVisitForStudent: (studentId: string) => void;
  onAddMeasurement: (input: {
    student_id: string;
    measurement_date: string;
    height_cm: number;
    weight_kg: number;
    notes: string;
    recorded_by: string;
  }) => Promise<void>;
  onSaveHealthNote: (input: {
    student_id: string;
    condition_or_note: string;
    status: 'Active' | 'Monitoring' | 'Resolved';
  }) => Promise<void>;
  onCreateStudent: (fullName: string, section: string, rollNumber: string) => StudentRecord;
  onBulkImportStudents: (
    rows: Array<{ rollNumber: string; fullName: string; section: string }>,
    replaceAll: boolean
  ) => void;
  onPrintSingleVisit: (student: StudentRecord, visit: VisitRecord) => void;
  onPrintStudentHistory: (
    student: StudentRecord,
    visits: VisitRecord[],
    dateRange?: { startDate?: string; endDate?: string }
  ) => void;
}

type ProfileSectionTab = 'all' | 'visit-history' | 'overview' | 'medical-conditions' | 'height-weight';

export const StudentProfileView: React.FC<StudentProfileViewProps> = ({
  students,
  visits,
  measurements,
  healthProfiles,
  selectedStudentId,
  onSelectStudentId,
  onStartVisitForStudent,
  onAddMeasurement,
  onSaveHealthNote,
  onCreateStudent,
  onBulkImportStudents,
  onPrintSingleVisit,
  onPrintStudentHistory,
}) => {
  const [directorySearch, setDirectorySearch] = useState('');
  const [activeTab, setActiveTab] = useState<ProfileSectionTab>('all');

  // Date range filter for Visit History & Printing
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal state for inspecting an individual visit
  const [inspectedVisit, setInspectedVisit] = useState<VisitRecord | null>(null);

  // Add Student Modal
  const [showAddStudentForm, setShowAddStudentForm] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentSection, setNewStudentSection] = useState('Sparkle');
  const [newStudentRoll, setNewStudentRoll] = useState('');

  // Bulk Paste Class List Modal
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [bulkSection, setBulkSection] = useState('Sparkle');
  const [bulkRawText, setBulkRawText] = useState('');
  const [replaceExistingRoster, setReplaceExistingRoster] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  // Measurement form state
  const [showMeasForm, setShowMeasForm] = useState(false);
  const [measDate, setMeasDate] = useState(getTodayLocalDateString);
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [measNotes, setMeasNotes] = useState('');
  const [measError, setMeasError] = useState('');

  // Medical Condition form state
  const [showConditionForm, setShowConditionForm] = useState(false);
  const [conditionInput, setConditionInput] = useState('');
  const [conditionStatus, setConditionStatus] = useState<'Active' | 'Monitoring' | 'Resolved'>('Active');

  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('All');

  const availableSections = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const s of students) {
      const sec = s.section.trim();
      if (sec && !seen.has(sec.toLowerCase())) {
        seen.add(sec.toLowerCase());
        list.push(sec);
      }
    }
    return list.length > 0 ? list : SCHOOL_CLASSES;
  }, [students]);

  const filteredDirectory = useMemo(() => {
    let list = searchStudents(students, directorySearch);
    if (selectedSectionFilter !== 'All') {
      list = list.filter((s) => s.section.trim().toLowerCase() === selectedSectionFilter.trim().toLowerCase());
    }
    return list;
  }, [students, directorySearch, selectedSectionFilter]);

  // Pre-compute visit counts, latest measurements, health conditions, and section counts for O(1) directory rendering
  const visitCountByStudent = useMemo(() => {
    const map = new Map<string, number>();
    visits.forEach((v) => {
      map.set(v.student_id, (map.get(v.student_id) || 0) + 1);
    });
    return map;
  }, [visits]);

  const latestMeasByStudent = useMemo(() => {
    const map = new Map<string, MeasurementRecord>();
    const sorted = [...measurements].sort((a, b) => {
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
  }, [measurements]);

  const conditionByStudent = useMemo(() => {
    const map = new Map<string, HealthProfileRecord>();
    for (const h of healthProfiles) {
      if (!map.has(h.student_id)) {
        map.set(h.student_id, h);
      }
    }
    return map;
  }, [healthProfiles]);

  const countBySection = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of students) {
      const key = s.section.trim().toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [students]);

  const parsedBulkPreview = useMemo(() => {
    const res = parseStudentImportText(
      bulkRawText,
      students,
      measurements,
      healthProfiles,
      undefined,
      bulkSection
    );
    return res.newStudents.map((s) => ({
      rollNumber: s.roll_number,
      fullName: s.full_name,
      section: s.section,
    }));
  }, [bulkRawText, students, measurements, healthProfiles, bulkSection]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.student_id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const studentVisits = useMemo(() => {
    if (!selectedStudent) return [];
    return getStudentVisitHistory(visits, selectedStudent.student_id, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  }, [visits, selectedStudent, startDate, endDate]);

  const allStudentVisitsCount = useMemo(() => {
    if (!selectedStudent) return 0;
    return visits.filter((v) => v.student_id === selectedStudent.student_id).length;
  }, [visits, selectedStudent]);

  const studentMeasurements = useMemo(() => {
    if (!selectedStudent) return [];
    return getStudentMeasurements(measurements, selectedStudent.student_id);
  }, [measurements, selectedStudent]);

  const studentConditions = useMemo(() => {
    if (!selectedStudent) return [];
    return healthProfiles.filter((h) => h.student_id === selectedStudent.student_id);
  }, [healthProfiles, selectedStudent]);

  const handleCreateStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !newStudentSection.trim() || !newStudentRoll.trim()) return;
    const created = onCreateStudent(
      newStudentName.trim(),
      newStudentSection.trim(),
      newStudentRoll.trim().padStart(2, '0')
    );
    setNewStudentName('');
    setNewStudentRoll('');
    setShowAddStudentForm(false);
    onSelectStudentId(created.student_id);
  };

  const handleBulkImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedBulkPreview.length === 0) return;
    onBulkImportStudents(parsedBulkPreview, replaceExistingRoster);
    setImportFeedback(
      `Imported ${parsedBulkPreview.length} student records into ${bulkSection}.`
    );
    setBulkRawText('');
    setShowBulkImportModal(false);
  };

  const handleSaveMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    const h = parseFloat(heightCm);
    const w = parseFloat(weightKg);
    if (isNaN(h) || h <= 30 || h > 250 || isNaN(w) || w <= 5 || w > 200) {
      setMeasError('Please enter valid height (cm) and weight (kg) values.');
      return;
    }
    setMeasError('');
    await onAddMeasurement({
      student_id: selectedStudent.student_id,
      measurement_date: measDate,
      height_cm: Number(h.toFixed(1)),
      weight_kg: Number(w.toFixed(1)),
      notes: measNotes.trim(),
      recorded_by: DEFAULT_STAFF_NAME,
    });
    setHeightCm('');
    setWeightKg('');
    setMeasNotes('');
    setShowMeasForm(false);
  };

  const handleSaveCondition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !conditionInput.trim()) return;
    await onSaveHealthNote({
      student_id: selectedStudent.student_id,
      condition_or_note: conditionInput.trim(),
      status: conditionStatus,
    });
    setConditionInput('');
    setShowConditionForm(false);
  };

  // ============================================================================
  // SELECTED STUDENT DOSSIER (UNIFIED 4-SECTION VIEW + FILTER TABS)
  // ============================================================================
  if (selectedStudent) {
    const latestMeas = studentMeasurements[0] || null;
    const showOverview = activeTab === 'all' || activeTab === 'overview';
    const showVisitHistory = activeTab === 'all' || activeTab === 'visit-history';
    const showConditions = activeTab === 'all' || activeTab === 'medical-conditions';
    const showMeasurements = activeTab === 'all' || activeTab === 'height-weight';

    return (
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
        {/* Top Action Bar (Preserved for desktop PC) */}
        <div className="hidden sm:flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onSelectStudentId(null)}
            className="h-9 px-3 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-white border border-stone-200/80 rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Students</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const allVisits = getStudentVisitHistory(visits, selectedStudent.student_id);
                onPrintStudentHistory(selectedStudent, allVisits);
              }}
              className="h-9 px-3 text-xs font-medium text-zinc-700 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Complete History</span>
            </button>
            <button
              type="button"
              onClick={() => onStartVisitForStudent(selectedStudent.student_id)}
              className="h-9 px-3.5 text-xs font-semibold text-white bg-zinc-900 rounded-xl hover:bg-zinc-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Visit for {selectedStudent.full_name.split(' ')[0]}</span>
            </button>
          </div>
        </div>

        {/* SECTION 1: STUDENT OVERVIEW BANNER */}
        <div className="bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-7 shadow-[0_4px_24px_rgb(0,0,0,0.02)] space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 sm:gap-6">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-teal-50 border border-teal-200/60 text-teal-800 font-mono text-sm sm:text-base font-bold flex items-center justify-center shrink-0">
                {selectedStudent.roll_number}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                  <span className="font-semibold text-teal-700">{selectedStudent.section}</span>
                  <span className="text-zinc-300" aria-hidden="true">·</span>
                  <span className="font-mono">Roll #{selectedStudent.roll_number}</span>
                  <span className="text-zinc-300 hidden sm:inline" aria-hidden="true">·</span>
                  <span className="font-mono text-zinc-400 hidden sm:inline">{selectedStudent.student_id}</span>
                </div>
                <h1 className="text-xl sm:text-3xl font-semibold text-zinc-900 font-display tracking-tight mt-0.5 leading-snug">
                  {selectedStudent.full_name}
                </h1>
              </div>
            </div>

            {/* Key Vital Summary Strip (3-col grid on mobile, inline flex on sm+) */}
            <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-2 sm:gap-6 text-xs bg-stone-50/90 border border-stone-200/70 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3">
              <div className="min-w-0">
                <span className="block text-[10px] sm:text-[11px] text-zinc-400 truncate">Height / Weight</span>
                <span className="font-mono text-[11px] sm:text-xs font-semibold text-zinc-900 mt-0.5 block">
                  {latestMeas ? (
                    <>
                      <span className="sm:hidden">{`${latestMeas.height_cm}cm/${latestMeas.weight_kg}kg`}</span>
                      <span className="hidden sm:inline">{`${latestMeas.height_cm} cm · ${latestMeas.weight_kg} kg`}</span>
                    </>
                  ) : (
                    'Not recorded'
                  )}
                </span>
              </div>
              <div className="h-7 w-px bg-stone-200 hidden sm:block" />
              <div className="min-w-0 border-l sm:border-l-0 border-stone-200/80 pl-2 sm:pl-0">
                <span className="block text-[10px] sm:text-[11px] text-zinc-400 truncate">Visits</span>
                <span className="font-mono text-[11px] sm:text-xs font-semibold text-zinc-900 mt-0.5 block truncate">
                  {allStudentVisitsCount} {allStudentVisitsCount === 1 ? 'visit' : 'visits'}
                </span>
              </div>
              <div className="h-7 w-px bg-stone-200 hidden sm:block" />
              <div className="min-w-0 border-l sm:border-l-0 border-stone-200/80 pl-2 sm:pl-0">
                <span className="block text-[10px] sm:text-[11px] text-zinc-400 truncate">Health Profile</span>
                <span className="text-[11px] sm:text-xs font-medium text-zinc-900 mt-0.5 block truncate">
                  {studentConditions.length > 0
                    ? `${studentConditions.length} note${studentConditions.length === 1 ? '' : 's'}`
                    : 'No allergies'}
                </span>
              </div>
            </div>
          </div>

          {/* Mobile-only Action Buttons */}
          <div className="sm:hidden pt-1">
            <button
              type="button"
              onClick={() => {
                const allVisits = getStudentVisitHistory(visits, selectedStudent.student_id);
                onPrintStudentHistory(selectedStudent, allVisits);
              }}
              className="w-full h-10 px-3 text-xs font-semibold text-zinc-700 bg-white border border-stone-200/90 rounded-xl active:bg-stone-50 flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-zinc-500" />
              <span>Print Complete History &amp; Slip</span>
            </button>
          </div>

          {/* Section Filter Tabs (Single-line horizontal scroller on mobile) */}
          <div
            role="tablist"
            aria-label="Student profile sections"
            className="flex items-center gap-1.5 pt-4 mt-4 border-t border-stone-100 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1"
          >
            {(
              [
                { id: 'all', label: 'Complete Dossier' },
                { id: 'visit-history', label: `Visit History (${allStudentVisitsCount})` },
                { id: 'overview', label: 'Overview' },
                { id: 'medical-conditions', label: `Medical Conditions (${studentConditions.length})` },
                { id: 'height-weight', label: `Height & Weight (${studentMeasurements.length})` },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-500 hover:text-zinc-900 hover:bg-stone-100'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Dedicated Overview details when Overview tab is explicitly selected */}
          {activeTab === 'overview' && showOverview && (
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-xs pt-5 mt-4 border-t border-stone-100">
              <div>
                <dt className="text-zinc-400">Student Name</dt>
                <dd className="text-sm font-semibold text-zinc-900 mt-1">{selectedStudent.full_name}</dd>
              </div>
              <div>
                <dt className="text-zinc-400">Section &amp; Roll Number</dt>
                <dd className="text-sm font-mono font-medium text-zinc-900 mt-1">
                  {selectedStudent.section} · Roll {selectedStudent.roll_number}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Permanent Student ID</dt>
                <dd className="text-sm font-mono text-zinc-600 mt-1">{selectedStudent.student_id}</dd>
              </div>
              <div>
                <dt className="text-zinc-400">Latest Height &amp; Weight</dt>
                <dd className="text-sm font-mono text-zinc-900 mt-1">
                  {latestMeas
                    ? `${latestMeas.height_cm} cm · ${latestMeas.weight_kg} kg (${latestMeas.measurement_date})`
                    : 'Not recorded'}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Total Infirmary Visits</dt>
                <dd className="text-sm font-mono font-semibold text-zinc-900 mt-1">
                  {allStudentVisitsCount}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Enrollment Status</dt>
                <dd className="text-sm font-medium text-teal-700 mt-1 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5" />
                  {selectedStudent.active_status}
                </dd>
              </div>
            </dl>
          )}
        </div>

        {/* UNIFIED 2-COLUMN WORKSPACE: VISIT HISTORY + HEALTH & GROWTH SIDEBAR */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
          {/* LEFT / MAIN COLUMN: VISIT HISTORY */}
          {showVisitHistory && (
            <div
              className={`${
                activeTab === 'all' ? 'lg:col-span-7' : 'lg:col-span-12'
              } bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)] space-y-4 sm:space-y-5`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-700" />
                  <h2 className="text-base font-semibold text-zinc-900 font-display">
                    Visit History ({studentVisits.length})
                  </h2>
                </div>

                {/* Date Range Filter */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <input
                    id="history-start-date"
                    type="date"
                    aria-label="Filter from date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 px-2 text-xs font-mono bg-stone-50 border border-stone-200 rounded-lg flex-1 sm:flex-initial min-w-[118px]"
                  />
                  <span className="text-zinc-400">to</span>
                  <input
                    id="history-end-date"
                    type="date"
                    aria-label="Filter to date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 px-2 text-xs font-mono bg-stone-50 border border-stone-200 rounded-lg flex-1 sm:flex-initial min-w-[118px]"
                  />
                  {(startDate || endDate) && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setStartDate('');
                          setEndDate('');
                        }}
                        className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-900"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onPrintStudentHistory(selectedStudent, studentVisits, {
                            startDate: startDate || undefined,
                            endDate: endDate || undefined,
                          })
                        }
                        className="px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <Printer className="w-3 h-3" />
                        Print Range
                      </button>
                    </>
                  )}
                </div>
              </div>

              {studentVisits.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <p className="text-xs text-zinc-500">
                    No infirmary visits recorded for {selectedStudent.full_name} in this period.
                  </p>
                  <button
                    type="button"
                    onClick={() => onStartVisitForStudent(selectedStudent.student_id)}
                    className="px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Log First Visit
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-stone-100">
                  {studentVisits.map((visit) => (
                    <div
                      key={visit.visit_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setInspectedVisit(visit)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setInspectedVisit(visit);
                        }
                      }}
                      className="group py-3.5 px-2 -mx-2 rounded-xl flex items-start justify-between gap-3 hover:bg-stone-50/80 active:bg-stone-100/60 transition-colors cursor-pointer select-none"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-medium text-zinc-700">
                            {extractDatePart(visit.visit_datetime)}
                          </span>
                          <span className="font-mono text-zinc-400">
                            {formatTimeFromDatetime(visit.visit_datetime)}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-zinc-900 group-hover:text-teal-700 transition-colors leading-snug">
                          {visit.reason}
                        </p>
                        <p className="text-xs text-zinc-600 leading-relaxed">
                          {visit.action_taken}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Medicine: <span className="text-zinc-700 font-medium">{formatMedicineDisplay(visit)}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPrintSingleVisit(selectedStudent, visit);
                          }}
                          className="px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 border border-stone-200/80 bg-white hover:bg-stone-100 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Printer className="w-3 h-3" />
                          Slip
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* RIGHT SIDEBAR COLUMN: MEDICAL CONDITIONS + HEIGHT & WEIGHT */}
          {(showConditions || showMeasurements) && (
            <div
              className={`${
                activeTab === 'all' ? 'lg:col-span-5' : 'lg:col-span-12'
              } space-y-6`}
            >
              {/* SECTION 3: MEDICAL CONDITIONS & ALLERGIES */}
              {showConditions && (
                <div className="bg-white border border-stone-200/80 rounded-2xl p-5 sm:p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)] space-y-4">
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <HeartPulse className="w-4 h-4 text-teal-700" />
                      <h2 className="text-base font-semibold text-zinc-900 font-display">
                        Medical Conditions
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowConditionForm((v) => !v)}
                      className="text-xs font-medium text-teal-700 hover:text-teal-800 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {showConditionForm ? 'Cancel' : 'Add Note'}
                    </button>
                  </div>

                  {studentConditions.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-2">
                      No pre-existing medical conditions or allergies recorded.
                    </p>
                  ) : (
                    <div className="divide-y divide-stone-100">
                      {studentConditions.map((item) => (
                        <div key={item.health_record_id} className="py-2.5 first:pt-0 last:pb-0 space-y-1 text-xs">
                          <p className="font-medium text-zinc-900">{item.condition_or_note}</p>
                          <p className="text-[11px] text-zinc-400 font-mono">
                            {item.status} · Reviewed {item.last_reviewed}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {(showConditionForm || activeTab === 'medical-conditions') && (
                    <form onSubmit={handleSaveCondition} className="p-3.5 bg-stone-50 rounded-xl space-y-2.5 border border-stone-200/60">
                      <label htmlFor="condition-note-input" className="block text-xs font-semibold text-zinc-700">
                        Add Condition, Allergy, or Care Note
                      </label>
                      <input
                        id="condition-note-input"
                        type="text"
                        value={conditionInput}
                        onChange={(e) => setConditionInput(e.target.value)}
                        placeholder="e.g. Mild dust allergy; parent authorized Cetirizine"
                        className="w-full h-9 px-3 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-zinc-900"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          id="condition-status-select"
                          aria-label="Condition status"
                          value={conditionStatus}
                          onChange={(e) =>
                            setConditionStatus(e.target.value as 'Active' | 'Monitoring' | 'Resolved')
                          }
                          className="h-8 px-2.5 text-xs bg-white border border-stone-200 rounded-lg flex-1"
                        >
                          <option value="Active">Active</option>
                          <option value="Monitoring">Monitoring</option>
                          <option value="Resolved">Resolved</option>
                        </select>
                        <button
                          type="submit"
                          className="px-3.5 h-8 text-xs font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 whitespace-nowrap"
                        >
                          Save Note
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* SECTION 4: HEIGHT & WEIGHT LOG */}
              {showMeasurements && (
                <div className="bg-white border border-stone-200/80 rounded-2xl p-5 sm:p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)] space-y-4">
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <Ruler className="w-4 h-4 text-teal-700" />
                      <h2 className="text-base font-semibold text-zinc-900 font-display">
                        Height &amp; Weight
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMeasForm((v) => !v)}
                      className="text-xs font-medium text-teal-700 hover:text-teal-800 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {showMeasForm ? 'Cancel' : 'Add Entry'}
                    </button>
                  </div>

                  {studentMeasurements.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-2">
                      No height or weight measurements recorded yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-stone-100">
                      {studentMeasurements.map((m, idx) => (
                        <div key={m.measurement_id} className="py-2.5 first:pt-0 last:pb-0 space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2 font-mono">
                            <span className="text-zinc-900 font-semibold">
                              {m.height_cm} cm · {m.weight_kg} kg
                            </span>
                            <span className="text-zinc-400">{m.measurement_date}</span>
                          </div>
                          {(m.notes || idx === 0) && (
                            <p className="text-[11px] text-zinc-500">
                              {m.notes || 'Latest recorded measurement'}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {(showMeasForm || activeTab === 'height-weight') && (
                    <form onSubmit={handleSaveMeasurement} className="p-3.5 bg-stone-50 rounded-xl space-y-3 border border-stone-200/60">
                      <p className="text-xs font-semibold text-zinc-700">
                        Add Dated Measurement
                      </p>
                      {measError && <p className="text-xs text-red-600">{measError}</p>}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label htmlFor="meas-date" className="block text-[11px] text-zinc-500 mb-1">
                            Date *
                          </label>
                          <input
                            id="meas-date"
                            type="date"
                            value={measDate}
                            onChange={(e) => setMeasDate(e.target.value)}
                            className="w-full h-8 px-2 text-xs font-mono bg-white border border-stone-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label htmlFor="meas-height" className="block text-[11px] text-zinc-500 mb-1">
                            Height (cm) *
                          </label>
                          <input
                            id="meas-height"
                            type="number"
                            step="0.1"
                            value={heightCm}
                            onChange={(e) => setHeightCm(e.target.value)}
                            placeholder="144.5"
                            className="w-full h-8 px-2.5 text-xs font-mono bg-white border border-stone-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label htmlFor="meas-weight" className="block text-[11px] text-zinc-500 mb-1">
                            Weight (kg) *
                          </label>
                          <input
                            id="meas-weight"
                            type="number"
                            step="0.1"
                            value={weightKg}
                            onChange={(e) => setWeightKg(e.target.value)}
                            placeholder="36.0"
                            className="w-full h-8 px-2.5 text-xs font-mono bg-white border border-stone-200 rounded-lg"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="w-full h-8 px-4 text-xs font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 whitespace-nowrap"
                      >
                        Save Entry
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Individual Visit Modal */}
        {inspectedVisit && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="inspect-visit-title"
            className="fixed inset-0 z-50 bg-zinc-900/30 backdrop-blur-[1px] flex items-center justify-center p-4"
          >
            <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-stone-100">
                <div>
                  <h3 id="inspect-visit-title" className="text-base font-semibold text-zinc-900 font-display">
                    Visit Details
                  </h3>
                  <p className="text-xs font-mono text-zinc-500">
                    {extractDatePart(inspectedVisit.visit_datetime)} · {formatTimeFromDatetime(inspectedVisit.visit_datetime)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedVisit(null)}
                  aria-label="Close visit details"
                  className="p-1 text-zinc-400 hover:text-zinc-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <dl className="space-y-3 text-xs">
                <div>
                  <dt className="text-zinc-400">Reason</dt>
                  <dd className="font-medium text-sm text-zinc-900 mt-0.5">{inspectedVisit.reason}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">Observations</dt>
                  <dd className="text-zinc-800 mt-0.5">{inspectedVisit.observations || 'None recorded'}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">Action Taken</dt>
                  <dd className="text-zinc-800 mt-0.5">{inspectedVisit.action_taken}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">Medicine</dt>
                  <dd className="font-medium text-zinc-900 mt-0.5">{formatMedicineDisplay(inspectedVisit)}</dd>
                </div>
                {inspectedVisit.notes && (
                  <div>
                    <dt className="text-zinc-400">Notes</dt>
                    <dd className="text-zinc-800 mt-0.5">{inspectedVisit.notes}</dd>
                  </div>
                )}
              </dl>

              <div className="pt-3 border-t border-stone-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const v = inspectedVisit;
                    setInspectedVisit(null);
                    onPrintSingleVisit(selectedStudent, v);
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-white bg-zinc-900 rounded-xl hover:bg-zinc-800 flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Slip
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // DIRECTORY VIEW (30 STUDENTS IN 6 SPARKLE)
  // ============================================================================
  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
        <div>
          <p className="text-[11px] sm:text-xs font-medium text-teal-700">
            Student Directory · All Sections
          </p>
          <h1 className="text-xl sm:text-3xl font-semibold text-zinc-900 font-display tracking-tight mt-0.5">
            School Student Roster ({students.length})
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            Tap any student row to open their complete health dossier or log a visit.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowBulkImportModal((v) => !v);
              setShowAddStudentForm(false);
            }}
            className="h-9 px-3 sm:px-3.5 text-xs font-medium text-zinc-700 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import List</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddStudentForm((v) => !v);
              setShowBulkImportModal(false);
            }}
            className="h-9 px-3 sm:px-3.5 text-xs font-semibold text-white bg-zinc-900 rounded-xl hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {importFeedback && (
        <div className="p-3.5 bg-teal-50/80 border border-teal-200 rounded-xl flex items-center justify-between text-xs text-teal-900">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 text-teal-700" />
            {importFeedback}
          </span>
          <button
            type="button"
            onClick={() => setImportFeedback(null)}
            className="text-teal-700 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {showBulkImportModal && (
        <form
          onSubmit={handleBulkImportSubmit}
          className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 font-display">
              Paste Class Teacher Student List
            </h2>
            <button
              type="button"
              onClick={() => setShowBulkImportModal(false)}
              className="text-xs text-zinc-500 hover:text-zinc-900"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bulk-section-input" className="block text-xs text-zinc-600 mb-1">
                Class / Section Name
              </label>
              <input
                id="bulk-section-input"
                type="text"
                list="school-classes-datalist"
                value={bulkSection}
                onChange={(e) => setBulkSection(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-stone-50 border border-stone-200 rounded-lg"
              />
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceExistingRoster}
                  onChange={(e) => setReplaceExistingRoster(e.target.checked)}
                />
                Replace current roster with pasted list
              </label>
            </div>
          </div>
          <div>
            <label htmlFor="bulk-raw-textarea" className="block text-xs text-zinc-600 mb-1">
              Paste lines (Roll No + Full Name)
            </label>
            <textarea
              id="bulk-raw-textarea"
              rows={5}
              value={bulkRawText}
              onChange={(e) => setBulkRawText(e.target.value)}
              placeholder={`01 Ajinkya Balu Gurav\n02 Ankita Rangnath Ghige\n03 Anushka Balasaheb Jalhare`}
              className="w-full p-3 text-xs font-mono bg-stone-50 border border-stone-200 rounded-xl focus:bg-white focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              Detected {parsedBulkPreview.length} students
            </span>
            <button
              type="submit"
              disabled={parsedBulkPreview.length === 0}
              className="px-4 py-2 text-xs font-semibold text-white bg-zinc-900 rounded-xl hover:bg-zinc-800 disabled:opacity-50"
            >
              Import {parsedBulkPreview.length} Students
            </button>
          </div>
        </form>
      )}

      {showAddStudentForm && (
        <form
          onSubmit={handleCreateStudentSubmit}
          className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 font-display">
              Add Student Record
            </h2>
            <button
              type="button"
              onClick={() => setShowAddStudentForm(false)}
              className="text-xs text-zinc-500 hover:text-zinc-900"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              id="dir-student-name"
              type="text"
              aria-label="Student full name"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              placeholder="Student Full Name *"
              className="sm:col-span-2 h-9 px-3 text-xs bg-stone-50 border border-stone-200 rounded-lg"
            />
            <input
              id="dir-student-section"
              type="text"
              list="school-classes-datalist"
              aria-label="Section"
              value={newStudentSection}
              onChange={(e) => setNewStudentSection(e.target.value)}
              placeholder="Class (e.g. Sparkle)"
              className="h-9 px-3 text-xs bg-stone-50 border border-stone-200 rounded-lg"
            />
            <div className="flex gap-2">
              <input
                id="dir-student-roll"
                type="text"
                aria-label="Roll number"
                value={newStudentRoll}
                onChange={(e) => setNewStudentRoll(e.target.value)}
                placeholder="Roll #"
                className="w-20 h-9 px-2.5 text-xs font-mono bg-stone-50 border border-stone-200 rounded-lg"
              />
              <button
                type="submit"
                className="flex-1 h-9 px-3 text-xs font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 whitespace-nowrap"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      )}

      <datalist id="school-classes-datalist">
        {availableSections.map((sec) => (
          <option key={sec} value={sec} />
        ))}
      </datalist>

      {/* Search & Class Filters */}
      <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgb(0,0,0,0.02)]">
        {/* Class Filter Pills */}
        <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-1.5 overflow-x-auto sm:flex-wrap no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedSectionFilter('All')}
            className={`px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap transition-colors ${
              selectedSectionFilter === 'All'
                ? 'bg-zinc-900 text-white font-semibold'
                : 'bg-stone-100 text-zinc-600 hover:bg-stone-200'
            }`}
          >
            All Classes ({students.length})
          </button>
          {availableSections.map((cls) => {
            const count = countBySection.get(cls.trim().toLowerCase()) || 0;
            const isSelected = selectedSectionFilter.trim().toLowerCase() === cls.trim().toLowerCase();
            return (
              <button
                key={cls}
                type="button"
                onClick={() => setSelectedSectionFilter(cls)}
                className={`px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'bg-teal-700 text-white font-semibold'
                    : 'bg-stone-100 text-zinc-600 hover:bg-stone-200'
                }`}
              >
                {cls} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative border-b border-stone-100">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 sm:left-4 top-3.5 pointer-events-none" />
          <input
            type="text"
            aria-label="Search students by name, section, or roll number"
            value={directorySearch}
            onChange={(e) => setDirectorySearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filteredDirectory.length > 0) {
                e.preventDefault();
                onSelectStudentId(filteredDirectory[0].student_id);
              }
            }}
            placeholder="Search name, roll number, or section..."
            className={`w-full h-11 pl-10 sm:pl-11 ${directorySearch ? 'pr-10' : 'pr-4'} text-sm bg-transparent focus:outline-none`}
          />
          {directorySearch && (
            <button
              type="button"
              onClick={() => setDirectorySearch('')}
              aria-label="Clear student search"
              className="absolute right-3 top-3 p-0.5 text-zinc-400 hover:text-zinc-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="divide-y divide-stone-100">
          {filteredDirectory.length === 0 ? (
            <div className="py-12 px-6 text-center text-xs text-zinc-500">
              No students match your current search or section filter.{' '}
              <button
                type="button"
                onClick={() => {
                  setDirectorySearch('');
                  setSelectedSectionFilter('All');
                }}
                className="text-teal-700 font-semibold hover:underline ml-1"
              >
                Reset filter
              </button>
            </div>
          ) : (
            filteredDirectory.map((stu) => {
              const visitCount = visitCountByStudent.get(stu.student_id) || 0;
              const latestMeas = latestMeasByStudent.get(stu.student_id);
              const condition = conditionByStudent.get(stu.student_id);

              return (
                <div
                  key={stu.student_id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open health dossier for ${stu.full_name}, Roll ${stu.roll_number}`}
                  onClick={() => onSelectStudentId(stu.student_id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectStudentId(stu.student_id);
                    }
                  }}
                  className="group px-3.5 sm:px-5 py-3 flex items-center justify-between gap-3 hover:bg-stone-50/90 active:bg-stone-100/70 transition-colors cursor-pointer select-none focus:outline-none focus-visible:bg-stone-50"
                >
                  <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1 overflow-hidden">
                    <span className="w-8 h-8 rounded-lg bg-stone-100 text-zinc-700 group-hover:bg-teal-50 group-hover:text-teal-800 font-mono tabular-nums text-xs font-semibold flex items-center justify-center shrink-0 transition-colors">
                      {stu.roll_number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-zinc-900 group-hover:text-teal-700 truncate block text-left transition-colors">
                        {stu.full_name}
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-400 mt-0.5">
                        <span>{stu.section}</span>
                        {visitCount > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-zinc-500">
                              {visitCount} {visitCount === 1 ? 'visit' : 'visits'}
                            </span>
                          </>
                        )}
                        {latestMeas && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-zinc-500">
                              {latestMeas.height_cm} cm / {latestMeas.weight_kg} kg
                            </span>
                          </>
                        )}
                        {condition && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-700 font-medium truncate max-w-[220px] sm:max-w-[320px]">
                              {condition.condition_or_note}
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
                        onStartVisitForStudent(stu.student_id);
                      }}
                      aria-label={`Record visit for ${stu.full_name}`}
                      className="h-8 px-3 text-xs font-semibold text-teal-800 bg-teal-50/90 hover:bg-teal-100 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      Visit
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
