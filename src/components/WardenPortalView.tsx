import React, { useState, useMemo } from 'react';
import {
  Search,
  Send,
  Clock,
  HeartPulse,
  Ruler,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  LogOut,
  User,
  ShieldCheck,
  ChevronRight,
  Info,
} from 'lucide-react';
import {
  searchStudents,
  getStudentVisitHistory,
  getStudentMeasurements,
  formatMedicineDisplay,
  formatTimeFromDatetime,
  extractDatePart,
  type StudentRecord,
  type VisitRecord,
  type MeasurementRecord,
  type HealthProfileRecord,
  type WardenDispatchRecord,
} from '../utils/nurseLogic';
import { type AuthUser } from '../utils/auth';
import { SCHOOL_NAME, SCHOOL_LOGO_URL, SCHOOL_LOGO_FALLBACK_URL } from '../utils/seedData';

interface WardenPortalViewProps {
  currentUser: AuthUser;
  students: StudentRecord[];
  visits: VisitRecord[];
  measurements: MeasurementRecord[];
  healthProfiles: HealthProfileRecord[];
  dispatches: WardenDispatchRecord[];
  onDispatchStudent: (student: StudentRecord, reason: string, notes: string) => Promise<void>;
  onCancelDispatch: (dispatchId: string) => Promise<void>;
  onLogout: () => void;
}

const COMMON_REASONS = [
  'Headache / Dizziness',
  'Fever / Chills',
  'Stomach Pain / Vomiting',
  'Physical Injury / Sprain',
  'Cough / Cold / Throat',
  'Eye / Ear Issue',
  'Allergy / Skin Rash',
  'General Weakness / Fatigue',
  'Routine Dressing / Follow-up',
];

export const WardenPortalView: React.FC<WardenPortalViewProps> = ({
  currentUser,
  students,
  visits,
  measurements,
  healthProfiles,
  dispatches,
  onDispatchStudent,
  onCancelDispatch,
  onLogout,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);
  const [dispatchReason, setDispatchReason] = useState(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'send' | 'active' | 'history'>('send');

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
    return list;
  }, [students]);

  const filteredStudents = useMemo(() => {
    return searchStudents(students, searchQuery, sectionFilter);
  }, [students, searchQuery, sectionFilter]);

  // Medical profile data for selected student
  const studentVisits = useMemo(() => {
    if (!selectedStudent) return [];
    return getStudentVisitHistory(visits, selectedStudent.student_id);
  }, [visits, selectedStudent]);

  const studentMeasurements = useMemo(() => {
    if (!selectedStudent) return [];
    return getStudentMeasurements(measurements, selectedStudent.student_id);
  }, [measurements, selectedStudent]);

  const studentHealthAlerts = useMemo(() => {
    if (!selectedStudent) return [];
    return healthProfiles.filter((h) => h.student_id === selectedStudent.student_id);
  }, [healthProfiles, selectedStudent]);

  // Dispatches breakdown
  const activeDispatches = useMemo(() => {
    return dispatches.filter((d) => d.status === 'in_transit');
  }, [dispatches]);

  const pastDispatches = useMemo(() => {
    return dispatches.filter((d) => d.status !== 'in_transit');
  }, [dispatches]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    const finalReason = customReason.trim() ? customReason.trim() : dispatchReason;
    if (!finalReason) return;

    setIsSubmitting(true);
    try {
      await onDispatchStudent(selectedStudent, finalReason, dispatchNotes.trim());
      setSuccessToast(`Dispatched ${selectedStudent.full_name} to Infirmary. Nurse has been notified.`);
      setCustomReason('');
      setDispatchNotes('');
      setSelectedStudent(null);
      setSearchQuery('');
      setTimeout(() => setSuccessToast(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBFAF8] text-zinc-900 flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900">
      {/* Header matching exact nurse top-bar style with NO outline badge */}
      <header className="sticky top-0 z-30 bg-[#FBFAF8]/95 backdrop-blur-md border-b border-stone-200/80 px-4 py-2.5 sm:px-8 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={SCHOOL_LOGO_URL}
              onError={(e) => {
                const target = e.currentTarget;
                if (target.src !== SCHOOL_LOGO_FALLBACK_URL) {
                  target.src = SCHOOL_LOGO_FALLBACK_URL;
                }
              }}
              alt={SCHOOL_NAME}
              className="h-9 w-auto object-contain mix-blend-multiply select-none shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.06)]"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold tracking-wider uppercase text-teal-800">
                  Hostel Warden Portal
                </span>
                <span className="hidden sm:inline text-zinc-300">·</span>
                <span className="hidden sm:inline-flex text-xs text-zinc-500 font-display truncate">
                  {SCHOOL_NAME}
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-bold font-display text-zinc-900 leading-tight truncate">
                Student Infirmary Pass Dispatcher
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end text-right">
              <span className="text-xs font-medium text-zinc-700 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
                {currentUser.displayName}
              </span>
              <span className="text-[11px] text-zinc-400 font-mono">Verified Staff</span>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-stone-100 hover:bg-stone-200/80 rounded-lg transition-colors cursor-pointer"
              title="Log out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Log Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Success Toast */}
      {successToast && (
        <div className="fixed top-16 right-4 z-50 max-w-md bg-emerald-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-lg border border-emerald-700 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 flex-1 flex flex-col gap-6">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-stone-200 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('send')}
              className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                activeTab === 'send'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-stone-100'
              }`}
            >
              Send Student to Infirmary
            </button>
            <button
              onClick={() => setActiveTab('active')}
              className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-stone-100'
              }`}
            >
              <span>Students in Transit</span>
              {activeDispatches.length > 0 && (
                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-amber-500 text-white text-[11px] font-bold">
                  {activeDispatches.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-stone-100'
              }`}
            >
              Recent Dispatch Log
            </button>
          </div>

          <div className="text-xs text-zinc-500 hidden sm:block">
            {students.length} students enrolled
          </div>
        </div>

        {/* TAB 1: SEND STUDENT TO INFIRMARY */}
        {activeTab === 'send' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Student Selector (5 cols) */}
            <div className="lg:col-span-5 bg-white border border-stone-200/90 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-teal-700" />
                  1. Select Student
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Search by student name, roll number, or class
                </p>
              </div>

              {/* Search Box */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, roll number, or class..."
                  className="w-full pl-10 pr-4 py-2.5 bg-stone-50/80 focus:bg-white text-zinc-900 text-xs sm:text-sm rounded-xl border border-stone-200 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 outline-none transition-all placeholder:text-zinc-400"
                />
              </div>

              {/* Class Filter Bar matching Nurse UI */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <select
                  aria-label="Filter by class section"
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="h-8 px-2.5 text-xs font-medium text-zinc-800 bg-stone-50/80 border border-stone-200 rounded-lg focus:outline-none focus:border-zinc-900 shrink-0"
                >
                  <option value="ALL">All Classes ({students.length})</option>
                  {availableSections.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSectionFilter('ALL')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      sectionFilter === 'ALL'
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-stone-100'
                    }`}
                  >
                    All
                  </button>
                  {availableSections.map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setSectionFilter(sec)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                        sectionFilter === sec
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-stone-100'
                      }`}
                    >
                      {sec}
                    </button>
                  ))}
                </div>
              </div>

              {/* Student List */}
              <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-1 divide-y divide-stone-100">
                {filteredStudents.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-400">
                    No matching students found
                  </div>
                ) : (
                  filteredStudents.map((s) => {
                    const isSelected = selectedStudent?.student_id === s.student_id;
                    const hasAlerts = healthProfiles.some((h) => h.student_id === s.student_id);
                    return (
                      <button
                        key={s.student_id}
                        type="button"
                        onClick={() => setSelectedStudent(s)}
                        className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-teal-50/80 border border-teal-300/80 shadow-xs'
                            : 'hover:bg-stone-50 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 flex items-center justify-center rounded-lg bg-stone-100 font-mono text-xs font-bold text-zinc-700 shrink-0">
                            {s.roll_number}
                          </span>
                          <div>
                            <div className="text-xs sm:text-sm font-semibold text-zinc-900 flex items-center gap-1.5">
                              {s.full_name}
                              {hasAlerts && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">
                                  Alert
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400">Class {s.section}</div>
                          </div>
                        </div>
                        <ChevronRight
                          className={`w-4 h-4 transition-transform ${
                            isSelected ? 'text-teal-700 translate-x-0.5' : 'text-zinc-300'
                          }`}
                        />
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Medical Review + Dispatch Form (7 cols) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {selectedStudent ? (
                <>
                  {/* Student Dossier Summary */}
                  <div className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-xs">
                    <div className="flex items-start justify-between border-b border-stone-100 pb-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">
                          Student Medical Dossier
                        </div>
                        <h3 className="text-base font-bold text-zinc-900">
                          {selectedStudent.full_name}
                        </h3>
                        <div className="text-xs text-zinc-500">
                          Class: {selectedStudent.section} · Roll No: {selectedStudent.roll_number}
                        </div>
                      </div>

                      {studentMeasurements.length > 0 && (
                        <div className="text-right">
                          <div className="text-[11px] text-zinc-400">Latest Vitals</div>
                          <div className="text-xs font-semibold text-zinc-700">
                            {studentMeasurements[0].height_cm} cm · {studentMeasurements[0].weight_kg} kg
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Medical Alerts Banner */}
                    {studentHealthAlerts.length > 0 ? (
                      <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
                        <div className="flex items-center gap-2 text-xs font-bold text-rose-800">
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                          Health Alert / Known Conditions
                        </div>
                        <ul className="mt-1.5 space-y-1 pl-6 list-disc text-xs text-rose-700">
                          {studentHealthAlerts.map((h) => (
                            <li key={h.health_record_id}>
                              <span className="font-semibold">{h.condition_or_note}</span>
                              <span className="text-[11px] text-rose-600 ml-1.5">
                                ({h.status} · Recorded {h.date_recorded})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="mt-3 p-2.5 rounded-xl bg-stone-50 border border-stone-100 text-xs text-zinc-500 flex items-center gap-2">
                        <Info className="w-4 h-4 text-zinc-400 shrink-0" />
                        No chronic conditions or allergies on file for this student.
                      </div>
                    )}

                    {/* Recent Visit History for Warden Review */}
                    <div className="mt-4">
                      <div className="text-xs font-bold text-zinc-800 flex items-center gap-1.5 mb-2">
                        <Clock className="w-3.5 h-3.5 text-zinc-400" />
                        Recent Infirmary Visits ({studentVisits.length})
                      </div>
                      {studentVisits.length === 0 ? (
                        <p className="text-xs text-zinc-400 italic">No past infirmary visits recorded.</p>
                      ) : (
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {studentVisits.slice(0, 3).map((v) => (
                            <div
                              key={v.visit_id}
                              className="p-2.5 bg-stone-50/70 border border-stone-100 rounded-xl text-xs space-y-0.5"
                            >
                              <div className="flex items-center justify-between font-medium text-zinc-800">
                                <span className="font-semibold text-zinc-900">{v.reason}</span>
                                <span className="text-[11px] text-zinc-400 font-mono">
                                  {extractDatePart(v.visit_datetime)} · {formatTimeFromDatetime(v.visit_datetime)}
                                </span>
                              </div>
                              <div className="text-zinc-600 text-[11px]">
                                Action: {v.action_taken || 'Treated in nurse room'}
                              </div>
                              <div className="text-[11px] font-mono text-zinc-500">
                                Medicine: {formatMedicineDisplay(v)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dispatch Authorization Form */}
                  <form
                    onSubmit={handleSend}
                    className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-xs flex flex-col gap-4"
                  >
                    <div>
                      <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                        <Send className="w-4 h-4 text-teal-700" />
                        2. Send to Nurse Infirmary
                      </h2>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Nurse will be notified discreetly that student is in transit with your pass
                      </p>
                    </div>

                    {/* Reason Selector */}
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        Visit Reason / Chief Complaint
                      </label>
                      <select
                        value={dispatchReason}
                        onChange={(e) => setDispatchReason(e.target.value)}
                        className="w-full px-3 py-2 bg-stone-50/80 text-zinc-900 text-xs sm:text-sm rounded-xl border border-stone-200 focus:border-zinc-900 outline-none"
                      >
                        {COMMON_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Custom note or specific details */}
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        Specific Symptoms or Warden Note (Optional)
                      </label>
                      <input
                        type="text"
                        value={customReason}
                        onChange={(e) => setCustomReason(e.target.value)}
                        placeholder="e.g. Has mild fever since 3 PM, vomiting sensation..."
                        className="w-full px-3.5 py-2 bg-stone-50/80 text-zinc-900 text-xs sm:text-sm rounded-xl border border-stone-200 focus:border-zinc-900 outline-none placeholder:text-zinc-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                        Escort / Transit Note (Optional)
                      </label>
                      <input
                        type="text"
                        value={dispatchNotes}
                        onChange={(e) => setDispatchNotes(e.target.value)}
                        placeholder="e.g. Sent with student monitor Rohan from Hostel Block B"
                        className="w-full px-3.5 py-2 bg-stone-50/80 text-zinc-900 text-xs sm:text-sm rounded-xl border border-stone-200 focus:border-zinc-900 outline-none placeholder:text-zinc-400"
                      />
                    </div>

                    {/* Dispatch Action Button */}
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 py-2.5 px-4 bg-teal-800 hover:bg-teal-900 active:scale-[0.99] text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                      >
                        <Send className="w-4 h-4" />
                        {isSubmitting ? 'Dispatching...' : `Dispatch ${selectedStudent.full_name} to Infirmary`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStudent(null)}
                        className="px-4 py-2.5 text-xs text-zinc-600 hover:text-zinc-900 bg-stone-100 hover:bg-stone-200 rounded-xl transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="bg-white border border-stone-200/90 rounded-2xl p-12 text-center shadow-xs flex flex-col items-center justify-center text-zinc-400">
                  <User className="w-10 h-10 mb-3 text-stone-300" />
                  <h3 className="text-sm font-semibold text-zinc-700">No Student Selected</h3>
                  <p className="text-xs text-zinc-400 max-w-xs mt-1">
                    Select a student from the left panel to review their complete medical dossier and issue an infirmary transit pass.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ACTIVE DISPATCHES IN TRANSIT */}
        {activeTab === 'active' && (
          <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-zinc-900">
                  Students Currently in Transit to Infirmary
                </h2>
                <p className="text-xs text-zinc-500">
                  These passes are live on the Nurse screen. Once the nurse admits the student, status updates to Arrived.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                {activeDispatches.length} Active Pass{activeDispatches.length === 1 ? '' : 'es'}
              </span>
            </div>

            {activeDispatches.length === 0 ? (
              <div className="py-12 text-center text-zinc-400">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-stone-300" />
                <p className="text-xs">No students currently in transit.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeDispatches.map((d) => (
                  <div
                    key={d.dispatch_id}
                    className="p-4 bg-amber-50/40 border border-amber-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-zinc-900">{d.student_name}</span>
                        <span className="text-xs font-mono text-zinc-500">
                          Class {d.section} · Roll {d.roll_number}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white animate-pulse">
                          In Transit
                        </span>
                      </div>
                      <div className="text-xs text-zinc-700 mt-1">
                        <span className="font-semibold text-zinc-900">Reason:</span> {d.reason}
                      </div>
                      {d.notes && (
                        <div className="text-xs text-zinc-500 mt-0.5">
                          <span className="font-semibold">Note:</span> {d.notes}
                        </div>
                      )}
                      <div className="text-[11px] text-zinc-400 mt-1 font-mono">
                        Sent by {d.dispatched_by} at {new Date(d.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onCancelDispatch(d.dispatch_id)}
                        className="px-3 py-1.5 text-xs text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                      >
                        Cancel Pass
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PAST DISPATCH HISTORY */}
        {activeTab === 'history' && (
          <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-xs">
            <h2 className="text-base font-bold text-zinc-900 mb-1">Recent Pass History</h2>
            <p className="text-xs text-zinc-500 mb-4">
              All students who were dispatched and either arrived at the infirmary or had their passes cancelled.
            </p>

            {pastDispatches.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 text-xs">
                No past dispatch records logged yet.
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {pastDispatches.map((d) => (
                  <div key={d.dispatch_id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs sm:text-sm font-semibold text-zinc-900 flex items-center gap-2">
                        {d.student_name}
                        <span className="text-[11px] text-zinc-400 font-mono">
                          Class {d.section} (Roll {d.roll_number})
                        </span>
                      </div>
                      <div className="text-xs text-zinc-600 mt-0.5">{d.reason}</div>
                      <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                        Dispatched {new Date(d.dispatched_at).toLocaleDateString()} at{' '}
                        {new Date(d.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    <div>
                      {d.status === 'arrived' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Admitted by Nurse
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-stone-100 text-zinc-600">
                          <XCircle className="w-3.5 h-3.5 text-zinc-400" />
                          Cancelled
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
