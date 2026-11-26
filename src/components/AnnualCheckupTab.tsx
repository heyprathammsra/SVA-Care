import React, { useMemo, useState } from 'react';
import {
  ClipboardCheck,
  Search,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  CheckCircle2,
  UserCheck,
} from 'lucide-react';
import {
  calculateBmi,
  getCurrentAcademicYear,
  type StudentRecord,
  type AnnualCheckupRecord,
  type AnnualCheckupFitness,
} from '../utils/nurseLogic';
import { getTodayLocalDateString } from '../utils/seedData';
import { CustomSelect } from './CustomSelect';
import { ModalDialog } from './ModalDialog';
import type { ProgramsActionResult } from './ProgramsWorkspaceView';

interface AnnualCheckupTabProps {
  students: StudentRecord[];
  classes: string[];
  annualCheckups: AnnualCheckupRecord[];
  onUpsertAnnualCheckup: (record: Partial<AnnualCheckupRecord>) => Promise<ProgramsActionResult>;
  onDeleteAnnualCheckup: (checkupId: string) => Promise<ProgramsActionResult>;
  onSelectStudent?: (student: StudentRecord) => void;
}

const BLOOD_GROUPS = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const FITNESS_OPTIONS: AnnualCheckupFitness[] = ['Fit', 'Needs Follow-up', 'Referred'];
const DENTAL_PRESETS = ['Healthy', 'Routine Cleaning Advised', 'Caries Noted', 'Orthodontic Review', 'Dental Referral'];

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return clean;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const AnnualCheckupTab: React.FC<AnnualCheckupTabProps> = ({
  students,
  classes,
  annualCheckups,
  onUpsertAnnualCheckup,
  onDeleteAnnualCheckup,
  onSelectStudent,
}) => {
  const defaultYear = useMemo(() => getCurrentAcademicYear(getTodayLocalDateString()), []);
  const academicYearOptions = useMemo(() => {
    const baseYears = new Set<string>(['2025-26', '2026-27', '2027-28', defaultYear]);
    annualCheckups.forEach((c) => {
      if (c.academic_year) baseYears.add(c.academic_year);
    });
    return Array.from(baseYears).sort((a, b) => b.localeCompare(a));
  }, [annualCheckups, defaultYear]);

  const [selectedYear, setSelectedYear] = useState<string>(defaultYear);
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'all' | 'screened' | 'pending' | 'referral'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCheckup, setEditingCheckup] = useState<AnnualCheckupRecord | null>(null);
  const [targetStudent, setTargetStudent] = useState<StudentRecord | null>(null);
  const [pickerStudentId, setPickerStudentId] = useState('');
  const [pickerQuery, setPickerQuery] = useState('');

  // Form fields
  const [checkupDate, setCheckupDate] = useState(getTodayLocalDateString());
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [visionLeft, setVisionLeft] = useState('6/6');
  const [visionRight, setVisionRight] = useState('6/6');
  const [dentalStatus, setDentalStatus] = useState('Healthy');
  const [entNotes, setEntNotes] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [hemoglobin, setHemoglobin] = useState('');
  const [generalFitness, setGeneralFitness] = useState<AnnualCheckupFitness>('Fit');
  const [parentReferral, setParentReferral] = useState(false);
  const [doctorRemarks, setDoctorRemarks] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<AnnualCheckupRecord | null>(null);

  const activeStudents = useMemo(
    () =>
      students
        .filter((s) => s.active_status !== 'Inactive')
        .sort((a, b) => {
          const sec = a.section.localeCompare(b.section);
          if (sec !== 0) return sec;
          return a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true });
        }),
    [students]
  );

  const checkupsForYear = useMemo(
    () => annualCheckups.filter((c) => c.academic_year === selectedYear),
    [annualCheckups, selectedYear]
  );

  const checkupByStudentId = useMemo(() => {
    const map = new Map<string, AnnualCheckupRecord>();
    for (const c of checkupsForYear) {
      map.set(c.student_id, c);
    }
    return map;
  }, [checkupsForYear]);

  const classScopedStudents = useMemo(
    () =>
      selectedClass === 'ALL'
        ? activeStudents
        : activeStudents.filter((s) => s.section === selectedClass),
    [activeStudents, selectedClass]
  );

  const metrics = useMemo(() => {
    const total = classScopedStudents.length;
    let screened = 0;
    let referrals = 0;
    for (const stu of classScopedStudents) {
      const rec = checkupByStudentId.get(stu.student_id);
      if (rec) {
        screened++;
        if (rec.parent_referral || rec.general_fitness === 'Referred') {
          referrals++;
        }
      }
    }
    const pending = Math.max(0, total - screened);
    const pct = total > 0 ? Math.round((screened / total) * 100) : 0;
    return { total, screened, pending, referrals, pct };
  }, [classScopedStudents, checkupByStudentId]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return classScopedStudents
      .map((student) => ({
        student,
        checkup: checkupByStudentId.get(student.student_id) || null,
      }))
      .filter(({ student, checkup }) => {
        if (statusFilter === 'screened' && !checkup) return false;
        if (statusFilter === 'pending' && checkup) return false;
        if (
          statusFilter === 'referral' &&
          !(checkup && (checkup.parent_referral || checkup.general_fitness !== 'Fit'))
        ) {
          return false;
        }
        if (!q) return true;
        return (
          student.full_name.toLowerCase().includes(q) ||
          student.section.toLowerCase().includes(q) ||
          student.roll_number.toLowerCase().includes(q) ||
          (checkup?.doctor_remarks || '').toLowerCase().includes(q) ||
          (checkup?.dental_status || '').toLowerCase().includes(q) ||
          (checkup?.blood_group || '').toLowerCase().includes(q)
        );
      });
  }, [classScopedStudents, checkupByStudentId, statusFilter, searchQuery]);

  const liveBmi = useMemo(() => calculateBmi(heightCm, weightKg), [heightCm, weightKg]);

  const openModalForStudent = (student: StudentRecord | null, existing?: AnnualCheckupRecord | null) => {
    setFeedback(null);
    setTargetStudent(student);
    setPickerStudentId(student?.student_id || '');
    setPickerQuery('');
    setEditingCheckup(existing || null);
    setCheckupDate(existing?.checkup_date || getTodayLocalDateString());
    setHeightCm(existing?.height_cm !== undefined ? String(existing.height_cm) : '');
    setWeightKg(existing?.weight_kg !== undefined ? String(existing.weight_kg) : '');
    setVisionLeft(existing?.vision_left || '6/6');
    setVisionRight(existing?.vision_right || '6/6');
    setDentalStatus(existing?.dental_status || 'Healthy');
    setEntNotes(existing?.ent_notes || '');
    setBloodGroup(existing?.blood_group || '');
    setHemoglobin(existing?.hemoglobin || '');
    setGeneralFitness(existing?.general_fitness || 'Fit');
    setParentReferral(Boolean(existing?.parent_referral));
    setDoctorRemarks(existing?.doctor_remarks || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const stuId = targetStudent?.student_id || pickerStudentId;
    if (!stuId) {
      setFeedback({ type: 'error', text: 'Please select a student first.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await onUpsertAnnualCheckup({
        checkup_id: editingCheckup?.checkup_id,
        academic_year: selectedYear,
        student_id: stuId,
        checkup_date: checkupDate,
        height_cm: heightCm.trim() ? Number(heightCm) : undefined,
        weight_kg: weightKg.trim() ? Number(weightKg) : undefined,
        vision_left: visionLeft.trim(),
        vision_right: visionRight.trim(),
        dental_status: dentalStatus.trim(),
        ent_notes: entNotes.trim(),
        blood_group: bloodGroup.trim(),
        hemoglobin: hemoglobin.trim(),
        general_fitness: generalFitness,
        parent_referral: parentReferral,
        doctor_remarks: doctorRemarks.trim(),
      });
      setFeedback({ type: res.ok ? 'success' : 'error', text: res.message });
      if (res.ok) {
        setModalOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await onDeleteAnnualCheckup(deleteTarget.checkup_id);
      setFeedback({ type: res.ok ? 'success' : 'error', text: res.message });
      if (res.ok) setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const pickerFilteredStudents = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return activeStudents
      .filter((s) => {
        if (!q) return true;
        return (
          s.full_name.toLowerCase().includes(q) ||
          s.section.toLowerCase().includes(q) ||
          s.roll_number.toLowerCase().includes(q)
        );
      })
      .slice(0, 25);
  }, [activeStudents, pickerQuery]);

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-[13px] flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : 'bg-rose-50/90 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
            )}
            <span className="truncate">{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-medium opacity-70 hover:opacity-100 cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Unified 3-Column Metric Strip + Completion Progress */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-slate-100">
          <div className="px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
              Screened ({selectedYear})
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-lg sm:text-xl font-semibold text-teal-800 tabular-nums">
                {metrics.screened}
              </span>
              <span className="text-xs text-slate-400 tabular-nums">
                / {metrics.total}
              </span>
            </div>
          </div>
          <div className="px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
              Pending
            </div>
            <div className="mt-0.5 text-lg sm:text-xl font-semibold text-slate-900 tabular-nums">
              {metrics.pending}
            </div>
          </div>
          <div className="px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
              Parent Referrals
            </div>
            <div className="mt-0.5 text-lg sm:text-xl font-semibold text-amber-700 tabular-nums">
              {metrics.referrals}
            </div>
          </div>
        </div>
        <div className="px-3 sm:px-4 py-2 bg-slate-50/70 border-t border-slate-100 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
            <div
              className="h-full bg-teal-700 rounded-full transition-all duration-300"
              style={{ width: `${metrics.pct}%` }}
            />
          </div>
          <span className="text-[11.5px] tabular-nums font-medium text-slate-600 whitespace-nowrap">
            {metrics.pct}% complete
          </span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student, roll no, blood group, remarks..."
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5"
            />
          </div>
          <div className="w-32 shrink-0">
            <CustomSelect
              value={selectedYear}
              onChange={setSelectedYear}
              options={academicYearOptions.map((y) => ({ value: y, label: y }))}
              size="md"
            />
          </div>
          <div className="w-36 shrink-0">
            <CustomSelect
              value={selectedClass}
              onChange={setSelectedClass}
              options={[
                { value: 'ALL', label: 'All Classes' },
                ...classes.map((c) => ({ value: c, label: c })),
              ]}
              size="md"
            />
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2">
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/70">
            {(
              [
                ['all', 'All'],
                ['pending', 'Pending'],
                ['screened', 'Screened'],
                ['referral', 'Follow-up'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setStatusFilter(val)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === val
                    ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.03)]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => openModalForStudent(null, null)}
            className="h-10 px-3.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Checkup</span>
          </button>
        </div>
      </div>

      {/* Student Screening Roster */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
        {filteredRows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <ClipboardCheck className="w-8 h-8 text-slate-300 mx-auto mb-2.5" />
            <p className="text-sm font-medium text-slate-800">
              No students match the current annual checkup filters.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Switch the academic year, class, or status filter, or record a new annual physical exam.
            </p>
            <button
              type="button"
              onClick={() => openModalForStudent(null, null)}
              className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Checkup</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredRows.map(({ student, checkup }) => {
              const bmiVal = checkup ? checkup.bmi ?? calculateBmi(checkup.height_cm, checkup.weight_kg) : undefined;
              return (
                <div
                  key={student.student_id}
                  className="px-4 py-3.5 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {onSelectStudent ? (
                        <button
                          type="button"
                          onClick={() => onSelectStudent(student)}
                          className="text-[14px] font-semibold text-slate-900 hover:text-teal-800 hover:underline text-left cursor-pointer"
                        >
                          {student.full_name}
                        </button>
                      ) : (
                        <span className="text-[14px] font-semibold text-slate-900">
                          {student.full_name}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        {student.section} · Roll {student.roll_number}
                      </span>
                      {checkup ? (
                        <span
                          className={`text-xs font-medium ${
                            checkup.general_fitness === 'Referred' || checkup.parent_referral
                              ? 'text-amber-700'
                              : checkup.general_fitness === 'Needs Follow-up'
                                ? 'text-orange-700'
                                : 'text-emerald-700'
                          }`}
                        >
                          · {checkup.general_fitness || 'Fit'}
                          {checkup.parent_referral ? ' (Parent Referral)' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">· Not screened yet</span>
                      )}
                    </div>

                    {checkup ? (
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600">
                        <span className="tabular-nums">
                          {formatShortDate(checkup.checkup_date)}
                        </span>
                        {(checkup.height_cm || checkup.weight_kg) && (
                          <>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span className="tabular-nums">
                              {checkup.height_cm ? `${checkup.height_cm} cm` : '—'} /{' '}
                              {checkup.weight_kg ? `${checkup.weight_kg} kg` : '—'}
                              {bmiVal !== undefined ? ` (BMI ${bmiVal})` : ''}
                            </span>
                          </>
                        )}
                        {(checkup.vision_left || checkup.vision_right) && (
                          <>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span>
                              Vision {checkup.vision_left || '—'} / {checkup.vision_right || '—'}
                            </span>
                          </>
                        )}
                        {checkup.dental_status && (
                          <>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span>Dental: {checkup.dental_status}</span>
                          </>
                        )}
                        {checkup.blood_group && (
                          <>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span className="font-mono">Blood: {checkup.blood_group}</span>
                          </>
                        )}
                        {checkup.hemoglobin && (
                          <>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span className="font-mono">Hb: {checkup.hemoglobin}</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-slate-400">
                        Pending {selectedYear} annual physical examination
                      </div>
                    )}

                    {checkup && (checkup.ent_notes || checkup.doctor_remarks) && (
                      <div className="mt-1 text-xs text-slate-500 line-clamp-2">
                        {[
                          checkup.ent_notes ? `ENT: ${checkup.ent_notes}` : '',
                          checkup.doctor_remarks ? `Remarks: ${checkup.doctor_remarks}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    {checkup ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openModalForStudent(student, checkup)}
                          className="h-9 px-3 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(checkup)}
                          aria-label={`Delete checkup for ${student.full_name}`}
                          className="h-9 w-9 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg inline-flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openModalForStudent(student, null)}
                        className="h-9 px-3 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Screen Student</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Annual Checkup Modal */}
      <ModalDialog
        open={modalOpen}
        onClose={() => !busy && setModalOpen(false)}
        title={
          editingCheckup
            ? `Edit Annual Checkup (${selectedYear})`
            : `Record Annual Checkup (${selectedYear})`
        }
        subtitle="Complete yearly physical exam parameters including vision, dental, ENT, and BMI."
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {targetStudent ? (
            <div className="px-3.5 py-2.5 rounded-xl bg-teal-50/70 border border-teal-200/80 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {targetStudent.full_name}
                </div>
                <div className="text-xs text-teal-800">
                  {targetStudent.section} · Roll {targetStudent.roll_number}
                </div>
              </div>
              {!editingCheckup && (
                <button
                  type="button"
                  onClick={() => {
                    setTargetStudent(null);
                    setPickerStudentId('');
                  }}
                  className="text-xs font-medium text-teal-800 hover:text-teal-950 px-2.5 py-1 rounded-lg bg-white border border-teal-200 cursor-pointer"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Select Student *
              </label>
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Type student name, class, or roll number..."
                  className="w-full h-9 pl-8.5 pr-3 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-900 focus:outline-none focus:border-teal-600"
                />
              </div>
              <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                {pickerFilteredStudents.map((stu) => {
                  const alreadyScreened = checkupByStudentId.has(stu.student_id);
                  return (
                    <button
                      key={stu.student_id}
                      type="button"
                      onClick={() => {
                        const existing = checkupByStudentId.get(stu.student_id) || null;
                        openModalForStudent(stu, existing);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-teal-50/70 flex items-center justify-between text-xs cursor-pointer"
                    >
                      <span className="font-medium text-slate-900">
                        {stu.full_name}{' '}
                        <span className="text-slate-500 font-normal">
                          · {stu.section} Roll {stu.roll_number}
                        </span>
                      </span>
                      <span className={alreadyScreened ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                        {alreadyScreened ? 'Screened' : 'Pending'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Checkup Date *
              </label>
              <input
                type="date"
                required
                value={checkupDate}
                onChange={(e) => setCheckupDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Height (cm)
              </label>
              <input
                type="number"
                step="0.1"
                min="40"
                max="250"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="e.g. 148.5"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm tabular-nums text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Weight (kg){liveBmi !== undefined ? ` · BMI ${liveBmi}` : ''}
              </label>
              <input
                type="number"
                step="0.1"
                min="8"
                max="200"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="e.g. 41.2"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm tabular-nums text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Vision (Left)
              </label>
              <input
                type="text"
                value={visionLeft}
                onChange={(e) => setVisionLeft(e.target.value)}
                placeholder="6/6"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Vision (Right)
              </label>
              <input
                type="text"
                value={visionRight}
                onChange={(e) => setVisionRight(e.target.value)}
                placeholder="6/6"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Blood Group
              </label>
              <CustomSelect
                value={bloodGroup}
                onChange={setBloodGroup}
                options={BLOOD_GROUPS.map((bg) => ({ value: bg, label: bg || 'Not Recorded' }))}
                size="md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Hemoglobin (g/dL)
              </label>
              <input
                type="text"
                value={hemoglobin}
                onChange={(e) => setHemoglobin(e.target.value)}
                placeholder="e.g. 12.6 g/dL"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Dental Status
              </label>
              <input
                type="text"
                list="dental-status-presets"
                value={dentalStatus}
                onChange={(e) => setDentalStatus(e.target.value)}
                placeholder="Healthy / Caries noted / Cleaning advised"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-teal-600"
              />
              <datalist id="dental-status-presets">
                {DENTAL_PRESETS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ENT Notes
              </label>
              <input
                type="text"
                value={entNotes}
                onChange={(e) => setEntNotes(e.target.value)}
                placeholder="Normal / Ear wax / Tonsils"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                General Fitness
              </label>
              <CustomSelect
                value={generalFitness}
                onChange={(val) => setGeneralFitness(val as AnnualCheckupFitness)}
                options={FITNESS_OPTIONS.map((f) => ({ value: f, label: f }))}
                size="md"
              />
            </div>
            <label className="flex items-center gap-2.5 pt-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={parentReferral}
                onChange={(e) => setParentReferral(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span className="text-sm text-slate-800 font-medium">
                Notify parents / specialist follow-up advised
              </span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Doctor Remarks & Advice
            </label>
            <textarea
              rows={2}
              value={doctorRemarks}
              onChange={(e) => setDoctorRemarks(e.target.value)}
              placeholder="Clinical summary, glasses checkup advice, dietary notes..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-teal-600 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              disabled={busy}
              onClick={() => setModalOpen(false)}
              className="h-10 px-4 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || (!targetStudent && !pickerStudentId)}
              className="h-10 px-5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Saving...' : editingCheckup ? 'Save Changes' : 'Save Annual Checkup'}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Delete Confirmation Modal */}
      <ModalDialog
        open={Boolean(deleteTarget)}
        onClose={() => !busy && setDeleteTarget(null)}
        title="Delete Annual Checkup Record"
        subtitle="This removes the screening record from the selected academic year."
        maxWidthClass="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Remove the <span className="font-semibold">{deleteTarget?.academic_year}</span> annual checkup
            for <span className="font-semibold">{deleteTarget?.student_name || 'this student'}</span>?
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setDeleteTarget(null)}
              className="h-9 px-3.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleConfirmDelete}
              className="h-9 px-4 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-60 cursor-pointer"
            >
              {busy ? 'Deleting...' : 'Delete Record'}
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
};
