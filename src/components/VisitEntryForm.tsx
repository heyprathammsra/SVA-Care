import React, { useState, useMemo } from 'react';
import {
  Search,
  Check,
  AlertCircle,
  UserPlus,
  Printer,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  HeartPulse,
  Ruler,
  Clock,
  X,
} from 'lucide-react';
import {
  searchStudents,
  validateVisitInput,
  isDuplicateVisitSubmission,
  formatMedicineDisplay,
  getStudentVisitHistory,
  getStudentMeasurements,
  extractDatePart,
  formatTimeFromDatetime,
  type StudentRecord,
  type VisitRecord,
  type MeasurementRecord,
  type HealthProfileRecord,
  type VisitFormInput,
  type MedicineStatus,
} from '../utils/nurseLogic';
import {
  SCHOOL_CLASSES,
  getNowLocalDatetimeString,
  DEFAULT_STAFF_NAME,
} from '../utils/seedData';

interface VisitEntryFormProps {
  students: StudentRecord[];
  visits: VisitRecord[];
  measurements?: MeasurementRecord[];
  healthProfiles: HealthProfileRecord[];
  initialStudentId?: string;
  activeNurseName?: string;
  onChangeActiveNurse?: (name: string) => void;
  onSaveVisit: (input: VisitFormInput) => Promise<VisitRecord>;
  onQuickCreateStudent: (fullName: string, section: string, rollNumber: string) => StudentRecord;
  onOpenStudentProfile: (studentId: string) => void;
  onPrintSingleVisit: (student: StudentRecord, visit: VisitRecord) => void;
  onCancel?: () => void;
}

const QUICK_REASONS = [
  'Headache / Fatigue',
  'Playground Scrape',
  'Stomach Ache',
  'Fever / Sore Throat',
  'Allergic Sneezing',
];

const QUICK_ACTIONS = [
  'Cleaned wound with saline & applied sterile dressing',
  'Oral hydration (ORS 200 ml) & 20 mins rest',
  'Temperature checked; cold sponging & observation',
  'Parent informed via school office',
];

interface ClinicalTemplate {
  id: string;
  label: string;
  reason: string;
  observations: string;
  actionTaken: string;
  medicineStatus: MedicineStatus;
  medicineName: string;
  dosage: string;
  dosageUnit: string;
  route: string;
}

const CLINICAL_TEMPLATES: ClinicalTemplate[] = [
  {
    id: 'abrasion',
    label: 'Playground Scrape',
    reason: 'Superficial knee/elbow abrasion during recess',
    observations: 'Minor skin scrape; cleaned, no active bleeding, vitals normal.',
    actionTaken: 'Cleaned wound with normal saline and antiseptic solution; applied sterile gauze dressing.',
    medicineStatus: 'none',
    medicineName: '',
    dosage: '',
    dosageUnit: 'ml',
    route: 'Topical / Cutaneous',
  },
  {
    id: 'headache-ors',
    label: 'Headache + ORS',
    reason: 'Mild headache and fatigue after class period',
    observations: 'Afebrile (98.4°F), pulse normal. Mild dehydration suspected.',
    actionTaken: 'Provided oral rehydration (ORS 200 ml) and 20 minutes rest in infirmary.',
    medicineStatus: 'given',
    medicineName: 'ORS Electoral Solution',
    dosage: '200',
    dosageUnit: 'ml',
    route: 'Oral',
  },
  {
    id: 'fever-pcm',
    label: 'Fever + Paracetamol',
    reason: 'Low-grade fever and throat irritation',
    observations: 'Oral temperature 100.1°F; mild pharyngeal redness.',
    actionTaken: 'Cold sponging performed; parent informed via school office and paracetamol administered per consent.',
    medicineStatus: 'given',
    medicineName: 'Paracetamol Suspension',
    dosage: '5',
    dosageUnit: 'ml',
    route: 'Oral',
  },
  {
    id: 'stomach-rest',
    label: 'Stomach Ache + Rest',
    reason: 'Mild stomach discomfort after mid-day tiffin',
    observations: 'Abdomen soft, afebrile (98.2°F), no nausea.',
    actionTaken: 'Warm water given and rested in infirmary for 15 minutes.',
    medicineStatus: 'none',
    medicineName: '',
    dosage: '',
    dosageUnit: 'ml',
    route: 'Oral',
  },
  {
    id: 'allergy-cetirizine',
    label: 'Dust Allergy + Cetirizine',
    reason: 'Allergic sneezing and nasal irritation',
    observations: 'Clear chest, SpO2 99%, mild nasal congestion.',
    actionTaken: 'Face washed with cool water; rested in ventilated infirmary.',
    medicineStatus: 'given',
    medicineName: 'Cetirizine Syrup',
    dosage: '2.5',
    dosageUnit: 'ml',
    route: 'Oral',
  },
];

const MEDICINE_PRESETS = [
  { label: 'ORS 200 ml', name: 'ORS Electoral Solution', dosage: '200', unit: 'ml', route: 'Oral' },
  { label: 'Paracetamol 5 ml', name: 'Paracetamol Suspension', dosage: '5', unit: 'ml', route: 'Oral' },
  { label: 'Cetirizine 2.5 ml', name: 'Cetirizine Syrup', dosage: '2.5', unit: 'ml', route: 'Oral' },
  { label: 'Antacid 5 ml', name: 'Digene Antacid Gel', dosage: '5', unit: 'ml', route: 'Oral' },
  { label: 'Povidone Ointment', name: 'Povidone-Iodine Ointment', dosage: '1', unit: 'application', route: 'Topical / Cutaneous' },
];

export const VisitEntryForm: React.FC<VisitEntryFormProps> = ({
  students,
  visits,
  measurements = [],
  healthProfiles,
  initialStudentId = '',
  activeNurseName,
  onChangeActiveNurse,
  onSaveVisit,
  onQuickCreateStudent,
  onOpenStudentProfile,
  onPrintSingleVisit,
  onCancel,
}) => {
  const [studentSearch, setStudentSearch] = useState('');
  const [pickerSectionFilter, setPickerSectionFilter] = useState('ALL');
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId);
  const [showQuickAddStudent, setShowQuickAddStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentSection, setNewStudentSection] = useState('Sparkle');
  const [newStudentRoll, setNewStudentRoll] = useState('');

  const [visitDatetime, setVisitDatetime] = useState(getNowLocalDatetimeString);
  const [reason, setReason] = useState('');
  const [observations, setObservations] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [medicineStatus, setMedicineStatus] = useState<MedicineStatus>('none');
  const [medicineName, setMedicineName] = useState('');
  const [dosage, setDosage] = useState('');
  const [dosageUnit, setDosageUnit] = useState('ml');
  const [route, setRoute] = useState('Oral');
  const [adminTime, setAdminTime] = useState('');
  const [notes, setNotes] = useState('');
  const [recordedBy, setRecordedBy] = useState(activeNurseName || DEFAULT_STAFF_NAME);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedVisit, setSavedVisit] = useState<VisitRecord | null>(null);

  const studentById = useMemo(() => {
    const map = new Map<string, StudentRecord>();
    for (const s of students) {
      map.set(s.student_id, s);
    }
    return map;
  }, [students]);

  const allergyStudentIds = useMemo(() => {
    const set = new Set<string>();
    for (const h of healthProfiles) {
      set.add(h.student_id);
    }
    return set;
  }, [healthProfiles]);

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

  const selectedStudent = useMemo(
    () => (selectedStudentId ? studentById.get(selectedStudentId) || null : null),
    [studentById, selectedStudentId]
  );

  const selectedStudentConditions = useMemo(
    () => healthProfiles.filter((h) => h.student_id === selectedStudentId),
    [healthProfiles, selectedStudentId]
  );

  const selectedStudentVisits = useMemo(
    () => (selectedStudentId ? getStudentVisitHistory(visits, selectedStudentId) : []),
    [visits, selectedStudentId]
  );

  const selectedStudentLatestMeas = useMemo(
    () => (selectedStudentId ? getStudentMeasurements(measurements, selectedStudentId)[0] || null : null),
    [measurements, selectedStudentId]
  );

  const filteredStudents = useMemo(
    () => searchStudents(students, studentSearch, pickerSectionFilter),
    [students, studentSearch, pickerSectionFilter]
  );

  // Genuine clinical priority list: students who actually have a recorded health note OR recent visit
  const clinicalPriorityStudents = useMemo(() => {
    const items: Array<{
      student: StudentRecord;
      badge: string;
      detail: string;
      isAlert: boolean;
    }> = [];

    const seenIds = new Set<string>();

    // 1. Students with recorded medical conditions / allergies first
    healthProfiles.forEach((hp) => {
      const stu = studentById.get(hp.student_id);
      if (stu && !seenIds.has(stu.student_id)) {
        seenIds.add(stu.student_id);
        items.push({
          student: stu,
          badge: hp.status,
          detail: hp.condition_or_note,
          isAlert: true,
        });
      }
    });

    // 2. Students with recent visits
    const sortedVisits = [...visits].sort((a, b) =>
      b.visit_datetime.localeCompare(a.visit_datetime)
    );
    sortedVisits.forEach((v) => {
      const stu = studentById.get(v.student_id);
      if (stu && !seenIds.has(stu.student_id)) {
        seenIds.add(stu.student_id);
        items.push({
          student: stu,
          badge: extractDatePart(v.visit_datetime),
          detail: `Last visit: ${v.reason}`,
          isAlert: false,
        });
      }
    });

    return items;
  }, [studentById, healthProfiles, visits]);

  const handleSelectStudent = (student: StudentRecord) => {
    setSelectedStudentId(student.student_id);
    setStudentSearch('');
    setErrors((prev) => {
      const next = { ...prev };
      delete next.student_id;
      return next;
    });
  };

  const applyClinicalTemplate = (tpl: ClinicalTemplate) => {
    setActiveTemplateId(tpl.id);
    setReason(tpl.reason);
    setObservations(tpl.observations);
    setActionTaken(tpl.actionTaken);
    setMedicineStatus(tpl.medicineStatus);
    if (tpl.medicineStatus === 'given') {
      setMedicineName(tpl.medicineName);
      setDosage(tpl.dosage);
      setDosageUnit(tpl.dosageUnit);
      setRoute(tpl.route);
      if (!adminTime && visitDatetime.length >= 16) {
        setAdminTime(visitDatetime.slice(11, 16));
      }
    } else {
      setMedicineName('');
      setDosage('');
    }
    setErrors({});
  };

  const handleQuickAddStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !newStudentSection.trim() || !newStudentRoll.trim()) return;
    const created = onQuickCreateStudent(
      newStudentName.trim(),
      newStudentSection.trim(),
      newStudentRoll.trim().padStart(2, '0')
    );
    setSelectedStudentId(created.student_id);
    setShowQuickAddStudent(false);
    setNewStudentName('');
    setNewStudentRoll('');
  };

  const resetFormForNextVisit = () => {
    setSelectedStudentId('');
    setStudentSearch('');
    setVisitDatetime(getNowLocalDatetimeString());
    setReason('');
    setObservations('');
    setActionTaken('');
    setMedicineStatus('none');
    setMedicineName('');
    setDosage('');
    setDosageUnit('ml');
    setRoute('Oral');
    setAdminTime('');
    setNotes('');
    setActiveTemplateId(null);
    setErrors({});
    setSavedVisit(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const formInput: VisitFormInput = {
      student_id: selectedStudentId,
      visit_datetime: visitDatetime,
      reason,
      observations,
      action_taken: actionTaken,
      medicine_status: medicineStatus,
      medicine_name: medicineStatus === 'given' ? medicineName : '',
      dosage: medicineStatus === 'given' ? dosage : '',
      dosage_unit: medicineStatus === 'given' ? dosageUnit : '',
      route: medicineStatus === 'given' ? route : '',
      administration_time: medicineStatus === 'given' ? adminTime : '',
      notes,
      recorded_by: recordedBy.trim() || DEFAULT_STAFF_NAME,
    };

    const validation = validateVisitInput(formInput);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    if (isDuplicateVisitSubmission(visits, formInput)) {
      setErrors({
        submit:
          'This exact visit was already recorded moments ago. Duplicate submission prevented.',
      });
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    try {
      const created = await onSaveVisit(formInput);
      setSavedVisit(created);
    } catch (err) {
      setErrors({
        submit:
          err instanceof Error
            ? err.message
            : 'Unable to save visit. Entered details have been preserved—please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Post-save confirmation screen
  if (savedVisit && selectedStudent) {
    return (
      <div
        data-testid="visit-save-confirmation"
        className="max-w-xl mx-auto bg-white border border-stone-200/80 rounded-2xl p-5 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.03)]"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-zinc-900 font-display">
              Visit Recorded
            </h2>
            <p className="text-xs text-zinc-500">
              {selectedStudent.full_name} · {selectedStudent.section} · Roll {selectedStudent.roll_number}
            </p>
          </div>
        </div>

        <dl className="space-y-3.5 py-5 border-y border-stone-100 text-xs sm:text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-400 shrink-0">Time</dt>
            <dd className="font-mono text-xs text-zinc-800">
              {savedVisit.visit_datetime.replace('T', ' ')}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-400 shrink-0">Reason</dt>
            <dd className="text-zinc-900 font-medium text-right">{savedVisit.reason}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-400 shrink-0">Care Provided</dt>
            <dd className="text-zinc-800 text-right">{savedVisit.action_taken}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-400 shrink-0">Medicine</dt>
            <dd className="text-zinc-800 text-right">{formatMedicineDisplay(savedVisit)}</dd>
          </div>
        </dl>

        <div className="pt-6 flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={resetFormForNextVisit}
            className="h-10 px-4 text-xs font-semibold text-white bg-zinc-900 rounded-xl hover:bg-zinc-800 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Record Another Visit
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPrintSingleVisit(selectedStudent, savedVisit)}
              className="h-10 px-3.5 text-xs font-medium text-zinc-700 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Slip
            </button>
            <button
              type="button"
              onClick={() => onOpenStudentProfile(selectedStudent.student_id)}
              className="h-10 px-3.5 text-xs font-medium text-zinc-700 bg-stone-100 hover:bg-stone-200/80 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              Student History
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-3.5 sm:space-y-6">
      {/* Desktop Header (Preserved for PC) */}
      <div className="hidden sm:flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-teal-700">
            Infirmary Clinical Entry
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 font-display tracking-tight mt-0.5">
            Record Infirmary Visit
          </h1>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-3 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-white border border-stone-200/80 rounded-xl flex items-center gap-1.5 transition-colors shrink-0 shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Infirmary</span>
          </button>
        )}
      </div>

      {errors.submit && (
        <div
          role="alert"
          className="p-3.5 bg-red-50/80 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-800"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{errors.submit}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* LEFT COLUMN (7 COLS): STREAMLINED CLINICAL ENTRY FORM */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="lg:col-span-7 bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-7 shadow-[0_4px_24px_rgb(0,0,0,0.02)] space-y-5 pb-24 sm:pb-7"
        >
          {/* STEP 1: STUDENT SELECTOR OR SELECTED STUDENT HEADER */}
          <div>
            {selectedStudent ? (
              <div className="pb-4 sm:pb-5 border-b border-stone-100 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200/60 text-teal-800 font-mono text-sm font-bold flex items-center justify-center shrink-0">
                      {selectedStudent.roll_number}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base sm:text-xl font-semibold text-zinc-900 font-display leading-snug">
                        {selectedStudent.full_name}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 mt-0.5">
                        <span className="font-mono font-semibold text-teal-700">
                          Roll {selectedStudent.roll_number}
                        </span>
                        <span className="text-zinc-300" aria-hidden="true">·</span>
                        <span>{selectedStudent.section}</span>
                        {selectedStudentLatestMeas && (
                          <span className="font-mono text-zinc-500">
                            · {selectedStudentLatestMeas.height_cm} cm / {selectedStudentLatestMeas.weight_kg} kg
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedStudentId('')}
                    className="h-8 px-2.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-stone-100 hover:bg-stone-200/70 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Change
                  </button>
                </div>

                {/* Mobile Inline Clinical Summary Strip (visible on <lg so staff sees allergies above the fold) */}
                <div className="lg:hidden">
                  {selectedStudentConditions.length > 0 ? (
                    <div className="p-2.5 bg-amber-50/90 border border-amber-200/80 rounded-xl text-xs text-amber-950 flex items-start gap-2">
                      <HeartPulse className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold">Health Alert: </span>
                        <span>{selectedStudentConditions[0].condition_or_note}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 py-2 bg-stone-50 border border-stone-200/60 rounded-xl text-xs text-zinc-600 flex items-center justify-between gap-2">
                      <span>
                        No known allergies · {selectedStudentVisits.length} past{' '}
                        {selectedStudentVisits.length === 1 ? 'visit' : 'visits'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenStudentProfile(selectedStudent.student_id)}
                        className="text-teal-700 font-semibold whitespace-nowrap"
                      >
                        Dossier →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                data-testid="visit-student-picker"
                className="space-y-3 pb-5 border-b border-stone-100"
              >
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="visit-student-search"
                    className="text-xs font-semibold text-zinc-800"
                  >
                    1. Select Student *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowQuickAddStudent((v) => !v)}
                    className="text-xs font-medium text-teal-700 hover:text-teal-800 flex items-center gap-1 shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {showQuickAddStudent ? 'Cancel' : 'New student'}
                  </button>
                </div>

                {showQuickAddStudent && (
                  <div className="p-3.5 bg-stone-50 rounded-xl space-y-3 border border-stone-200/60">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      <input
                        id="quick-student-name"
                        type="text"
                        aria-label="New student full name"
                        value={newStudentName}
                        onChange={(e) => setNewStudentName(e.target.value)}
                        placeholder="Full name"
                        className="sm:col-span-2 h-9 px-3 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-zinc-900"
                      />
                      <select
                        id="quick-student-section"
                        aria-label="New student section"
                        value={newStudentSection}
                        onChange={(e) => setNewStudentSection(e.target.value)}
                        className="h-9 px-2.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-zinc-900"
                      >
                        {availableSections.map((sec) => (
                          <option key={sec} value={sec}>
                            {sec}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <input
                          id="quick-student-roll"
                          type="text"
                          aria-label="New student roll number"
                          value={newStudentRoll}
                          onChange={(e) => setNewStudentRoll(e.target.value)}
                          placeholder="Roll #"
                          className="w-20 h-9 px-2.5 text-xs font-mono bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-zinc-900"
                        />
                        <button
                          type="button"
                          onClick={handleQuickAddStudentSubmit}
                          className="flex-1 h-9 px-3 text-xs font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 whitespace-nowrap"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3 pointer-events-none" />
                    <input
                      id="visit-student-search"
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && filteredStudents.length > 0) {
                          e.preventDefault();
                          handleSelectStudent(filteredStudents[0]);
                        }
                      }}
                      placeholder="Search name, roll number, or class..."
                      className="w-full h-10 pl-10 pr-8 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900 transition-colors"
                    />
                    {studentSearch && (
                      <button
                        type="button"
                        onClick={() => setStudentSearch('')}
                        aria-label="Clear student search"
                        className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* 1-Tap Class Filter Strip for Mobile & Desktop */}
                  <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
                    <button
                      type="button"
                      onClick={() => setPickerSectionFilter('ALL')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        pickerSectionFilter === 'ALL'
                          ? 'bg-zinc-900 text-white font-semibold'
                          : 'bg-stone-100 text-zinc-600 hover:bg-stone-200/70'
                      }`}
                    >
                      All ({students.length})
                    </button>
                    {availableSections.map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setPickerSectionFilter(sec)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                          pickerSectionFilter.toLowerCase() === sec.toLowerCase()
                            ? 'bg-teal-700 text-white font-semibold'
                            : 'bg-stone-100 text-zinc-600 hover:bg-stone-200/70'
                        }`}
                      >
                        {sec}
                      </button>
                    ))}
                  </div>
                </div>
                {errors.student_id && (
                  <p className="text-xs text-red-600">{errors.student_id}</p>
                )}

                <div className="max-h-56 overflow-y-auto divide-y divide-stone-100 border border-stone-200/70 rounded-xl bg-white">
                  {filteredStudents.length === 0 ? (
                    <div className="py-6 px-4 text-center text-xs text-zinc-500">
                      No matching student found.
                    </div>
                  ) : (
                    filteredStudents.map((stu) => {
                      const hasAllergy = allergyStudentIds.has(stu.student_id);
                      return (
                        <button
                          key={stu.student_id}
                          type="button"
                          onClick={() => handleSelectStudent(stu)}
                          className="w-full px-3.5 py-2.5 text-left hover:bg-stone-50 active:bg-stone-100 transition-colors flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-6 h-6 rounded-md bg-stone-100 text-zinc-700 font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                              {stu.roll_number}
                            </span>
                            <span className="font-medium text-zinc-900 truncate">
                              {stu.full_name}
                            </span>
                          </div>
                          <span className="text-[11px] text-zinc-400 shrink-0">
                            {hasAllergy ? (
                              <span className="text-amber-700 font-medium">{stu.section} · Health Note</span>
                            ) : (
                              stu.section
                            )}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* COMMON VISIT PRESETS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-700">
                Quick Visit Presets (1-Tap Fill)
              </span>
              {activeTemplateId && (
                <span className="text-[11px] text-teal-700 font-medium">✓ Preset applied</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pb-1">
              {CLINICAL_TEMPLATES.map((tpl) => {
                const isSelected = activeTemplateId === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyClinicalTemplate(tpl)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap shrink-0 shadow-2xs ${
                      isSelected
                        ? 'bg-teal-700 border-teal-700 text-white font-semibold'
                        : 'bg-stone-50 border-stone-200/90 text-zinc-700 hover:bg-stone-100 hover:text-zinc-900'
                    }`}
                  >
                    {tpl.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 2: REASON & CARE */}
          <div className="space-y-4 pt-1">
            <div>
              <label htmlFor="visit-reason" className="block text-xs font-semibold text-zinc-800 mb-1.5">
                Reason for Visit / Reported Problem *
              </label>
              <input
                id="visit-reason"
                type="text"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (errors.reason) setErrors((prev) => ({ ...prev, reason: '' }));
                }}
                placeholder="e.g. Headache and fatigue after recess"
                className="w-full h-10 px-3.5 text-sm bg-stone-50/60 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900 transition-colors"
              />
              {errors.reason && <p className="text-xs text-red-600 mt-1">{errors.reason}</p>}
              {!reason && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {QUICK_REASONS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setReason(preset);
                        if (errors.reason) setErrors((prev) => ({ ...prev, reason: '' }));
                      }}
                      className="px-2 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-900 bg-stone-100/70 hover:bg-stone-200/60 rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="visit-action" className="block text-xs font-semibold text-zinc-800 mb-1.5">
                Action Taken or Resolution *
              </label>
              <input
                id="visit-action"
                type="text"
                value={actionTaken}
                onChange={(e) => {
                  setActionTaken(e.target.value);
                  if (errors.action_taken) setErrors((prev) => ({ ...prev, action_taken: '' }));
                }}
                placeholder="e.g. Oral ORS 200 ml and 20 mins rest"
                className="w-full h-10 px-3.5 text-sm bg-stone-50/60 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900 transition-colors"
              />
              {errors.action_taken && (
                <p className="text-xs text-red-600 mt-1">{errors.action_taken}</p>
              )}
              {!actionTaken && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {QUICK_ACTIONS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setActionTaken(preset);
                        if (errors.action_taken) setErrors((prev) => ({ ...prev, action_taken: '' }));
                      }}
                      className="px-2 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-900 bg-stone-100/70 hover:bg-stone-200/60 rounded-md transition-colors text-left"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* MEDICATION TOGGLE (CONSISTENT TOP-ALIGNED LABEL) */}
            <div>
              <span className="block text-xs font-semibold text-zinc-800 mb-1.5">
                Medicine Administered
              </span>
              <div
                role="radiogroup"
                aria-label="Medication status"
                className="grid grid-cols-3 gap-1 p-1 bg-stone-100 rounded-xl"
              >
                <button
                  type="button"
                  onClick={() => setMedicineStatus('none')}
                  className={`px-2 sm:px-3 py-2 text-xs font-medium rounded-lg transition-colors text-center ${
                    medicineStatus === 'none'
                      ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  None Given
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMedicineStatus('given');
                    if (!adminTime && visitDatetime.length >= 16) {
                      setAdminTime(visitDatetime.slice(11, 16));
                    }
                  }}
                  className={`px-2 sm:px-3 py-2 text-xs font-medium rounded-lg transition-colors text-center ${
                    medicineStatus === 'given'
                      ? 'bg-white text-teal-800 shadow-xs font-semibold'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  Medicine Given
                </button>
                <button
                  type="button"
                  onClick={() => setMedicineStatus('not_recorded')}
                  className={`px-2 sm:px-3 py-2 text-xs font-medium rounded-lg transition-colors text-center ${
                    medicineStatus === 'not_recorded'
                      ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  Not Recorded
                </button>
              </div>

              {medicineStatus === 'given' && (
                <div className="mt-3 p-3.5 sm:p-4 bg-stone-50/80 border border-stone-200/80 rounded-xl space-y-3">
                  {/* 1-Click Common Infirmary Medicine Presets */}
                  <div className="space-y-1.5">
                    <span className="block text-[11px] font-medium text-zinc-500">
                      Quick Medicine Fill:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {MEDICINE_PRESETS.map((med) => (
                        <button
                          key={med.label}
                          type="button"
                          onClick={() => {
                            setMedicineName(med.name);
                            setDosage(med.dosage);
                            setDosageUnit(med.unit);
                            setRoute(med.route);
                            if (!adminTime && visitDatetime.length >= 16) {
                              setAdminTime(visitDatetime.slice(11, 16));
                            }
                            if (errors.medicine_name) {
                              setErrors((prev) => ({ ...prev, medicine_name: '' }));
                            }
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100/80 border border-teal-200/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          {med.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 sm:gap-3">
                    <div className="col-span-2 sm:col-span-3">
                      <label htmlFor="medicine-name" className="block text-xs text-zinc-600 mb-1">
                        Medicine Name *
                      </label>
                      <input
                        id="medicine-name"
                        type="text"
                        value={medicineName}
                        onChange={(e) => setMedicineName(e.target.value)}
                        placeholder="e.g. Paracetamol, ORS"
                        className="w-full h-9 px-3 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-zinc-900"
                      />
                      {errors.medicine_name && (
                        <p className="text-xs text-red-600 mt-1">{errors.medicine_name}</p>
                      )}
                    </div>
                    <div className="col-span-1 sm:col-span-1">
                      <label htmlFor="medicine-dosage" className="block text-xs text-zinc-600 mb-1">
                        Dose
                      </label>
                      <input
                        id="medicine-dosage"
                        type="text"
                        value={dosage}
                        onChange={(e) => setDosage(e.target.value)}
                        placeholder="5"
                        className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-zinc-900"
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                      <label htmlFor="medicine-unit" className="block text-xs text-zinc-600 mb-1">
                        Unit
                      </label>
                      <select
                        id="medicine-unit"
                        value={dosageUnit}
                        onChange={(e) => setDosageUnit(e.target.value)}
                        className="w-full h-9 px-2.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-zinc-900"
                      >
                        <option value="ml">ml</option>
                        <option value="mg">mg</option>
                        <option value="tablet">tablet(s)</option>
                        <option value="drops">drops</option>
                        <option value="application">topical</option>
                      </select>
                    </div>
                    <div className="col-span-1 sm:col-span-3">
                      <label htmlFor="medicine-route" className="block text-xs text-zinc-600 mb-1">
                        Route
                      </label>
                      <select
                        id="medicine-route"
                        value={route}
                        onChange={(e) => setRoute(e.target.value)}
                        className="w-full h-9 px-2.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-zinc-900"
                      >
                        <option value="Oral">Oral</option>
                        <option value="Topical / Cutaneous">Topical / Cutaneous</option>
                        <option value="Inhalation">Inhalation</option>
                        <option value="Ophthalmic (Eye Drops)">Eye Drops</option>
                      </select>
                    </div>
                    <div className="col-span-1 sm:col-span-3">
                      <label htmlFor="medicine-time" className="block text-xs text-zinc-600 mb-1">
                        Time Given
                      </label>
                      <input
                        id="medicine-time"
                        type="text"
                        value={adminTime}
                        onChange={(e) => setAdminTime(e.target.value)}
                        placeholder="10:15 AM"
                        className="w-full h-9 px-3 text-xs font-mono bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-zinc-900"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* QUIET SUPPORTING FIELDS: OBSERVATIONS, TIME, RECORDED BY & NOTES */}
            <div className="pt-4 border-t border-stone-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="visit-observations" className="block text-xs text-zinc-500 mb-1">
                  Observations (Optional)
                </label>
                <input
                  id="visit-observations"
                  type="text"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Temp, pulse, physical findings..."
                  className="w-full h-9 px-3 text-xs bg-stone-50/60 border border-stone-200 rounded-lg focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div>
                <label htmlFor="visit-datetime" className="block text-xs text-zinc-500 mb-1">
                  Visit Date &amp; Time *
                </label>
                <input
                  id="visit-datetime"
                  type="datetime-local"
                  value={visitDatetime}
                  onChange={(e) => setVisitDatetime(e.target.value)}
                  className="w-full h-9 px-3 text-xs font-mono tabular-nums bg-stone-50/60 border border-stone-200 rounded-lg focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div>
                <label htmlFor="visit-notes" className="block text-xs text-zinc-500 mb-1">
                  Additional Notes (Optional)
                </label>
                <input
                  id="visit-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any note for class teacher or parent..."
                  className="w-full h-9 px-3 text-xs bg-stone-50/60 border border-stone-200 rounded-lg focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div>
                <label htmlFor="visit-recorded-by" className="block text-xs text-zinc-500 mb-1">
                  Recorded By (Staff / In-Charge)
                </label>
                <input
                  id="visit-recorded-by"
                  type="text"
                  value={recordedBy}
                  onChange={(e) => setRecordedBy(e.target.value)}
                  placeholder="Staff or in-charge name (optional)..."
                  className="w-full h-9 px-3 text-xs bg-stone-50/60 border border-stone-200 rounded-lg focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>
            </div>
          </div>

          {/* SUBMIT BAR (DESKTOP ONLY) */}
          <div className="hidden sm:flex pt-2 items-center justify-end gap-3">
            <button
              type="button"
              onClick={resetFormForNextVisit}
              className="h-11 px-4 text-xs font-medium text-zinc-500 hover:text-zinc-900 bg-transparent rounded-xl transition-colors"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-11 px-6 text-xs font-semibold text-white bg-zinc-900 rounded-xl hover:bg-zinc-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {isSubmitting ? 'Saving...' : 'Save Visit to Record'}
            </button>
          </div>

          {/* MOBILE STICKY SAVE BAR (MOBILE ONLY - DOCKED AT BOTTOM) */}
          <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] flex items-center gap-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
            <button
              type="button"
              onClick={resetFormForNextVisit}
              className="h-10 px-3.5 text-xs font-semibold text-zinc-600 bg-stone-100 rounded-xl active:bg-stone-200 shrink-0"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 h-10 px-4 text-xs font-bold text-white bg-zinc-900 rounded-xl shadow-xs active:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{isSubmitting ? 'Saving...' : 'Save Visit to Record'}</span>
            </button>
          </div>
        </form>

        {/* RIGHT COLUMN (5 COLS): LIVE PATIENT CLINICAL CONTEXT SIDEBAR */}
        <aside className="lg:col-span-5 space-y-5">
          {selectedStudent ? (
            <div className="bg-white border border-stone-200/80 rounded-2xl p-5 sm:p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)] space-y-5">
              <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-stone-100">
                <div>
                  <span className="text-[11px] font-semibold text-teal-700">
                    Patient Clinical Context
                  </span>
                  <h3 className="text-base font-semibold text-zinc-900 font-display">
                    {selectedStudent.full_name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenStudentProfile(selectedStudent.student_id)}
                  className="px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-stone-100 hover:bg-stone-200/70 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  Full Dossier
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* 1. Allergies & Medical Conditions */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
                  <HeartPulse className="w-3.5 h-3.5 text-teal-700" />
                  <span>Medical Conditions &amp; Allergies</span>
                </div>
                {selectedStudentConditions.length === 0 ? (
                  <p className="text-xs text-zinc-500 bg-stone-50/80 px-3 py-2 rounded-xl border border-stone-200/50">
                    No pre-existing conditions or drug allergies recorded on file.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedStudentConditions.map((cond) => (
                      <div
                        key={cond.health_record_id}
                        className="p-3 bg-amber-50/80 border border-amber-200/70 rounded-xl text-xs text-amber-950 space-y-0.5"
                      >
                        <p className="font-medium">{cond.condition_or_note}</p>
                        <p className="text-[11px] text-amber-700 font-mono">
                          Status: {cond.status} · Reviewed {cond.last_reviewed}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Latest Height & Weight (For Pediatric Medication Dosing) */}
              <div className="space-y-2 pt-3 border-t border-stone-100">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
                  <Ruler className="w-3.5 h-3.5 text-teal-700" />
                  <span>Anthropometry (Dosing Reference)</span>
                </div>
                {selectedStudentLatestMeas ? (
                  <div className="p-3 bg-stone-50/80 border border-stone-200/60 rounded-xl flex items-center justify-between text-xs">
                    <div className="font-mono font-semibold text-zinc-900">
                      {selectedStudentLatestMeas.height_cm} cm · {selectedStudentLatestMeas.weight_kg} kg
                    </div>
                    <span className="font-mono text-[11px] text-zinc-400">
                      Recorded {selectedStudentLatestMeas.measurement_date}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 bg-stone-50/80 px-3 py-2 rounded-xl border border-stone-200/50">
                    Height and weight not recorded yet.
                  </p>
                )}
              </div>

              {/* 3. Past Infirmary Visits for This Student */}
              <div className="space-y-2.5 pt-3 border-t border-stone-100">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-800">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-teal-700" />
                    Previous Visits ({selectedStudentVisits.length})
                  </span>
                </div>

                {selectedStudentVisits.length === 0 ? (
                  <p className="text-xs text-zinc-500 bg-stone-50/80 px-3 py-2 rounded-xl border border-stone-200/50">
                    First infirmary visit for {selectedStudent.full_name}.
                  </p>
                ) : (
                  <div className="divide-y divide-stone-100 border border-stone-200/60 rounded-xl overflow-hidden">
                    {selectedStudentVisits.slice(0, 4).map((v) => (
                      <div key={v.visit_id} className="p-3 bg-white space-y-1 text-xs">
                        <div className="flex items-center justify-between font-mono text-[11px] text-zinc-400">
                          <span>{extractDatePart(v.visit_datetime)}</span>
                          <span>{formatTimeFromDatetime(v.visit_datetime)}</span>
                        </div>
                        <p className="font-semibold text-zinc-900">{v.reason}</p>
                        <p className="text-zinc-500">{formatMedicineDisplay(v)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="hidden lg:block bg-white border border-stone-200/80 rounded-2xl p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)] space-y-4">
              <div>
                <span className="text-[11px] font-semibold text-teal-700">
                  Clinical Watchlist
                </span>
                <h3 className="text-base font-semibold text-zinc-900 font-display mt-0.5">
                  Students with Health Alerts &amp; Recent Visits
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Select a student with an active medical condition or recent infirmary visit to load their chart immediately.
                </p>
              </div>

              <div className="divide-y divide-stone-100 border border-stone-200/70 rounded-xl overflow-hidden">
                {clinicalPriorityStudents.map(({ student: stu, badge, detail, isAlert }) => (
                  <button
                    key={stu.student_id}
                    type="button"
                    onClick={() => handleSelectStudent(stu)}
                    className="w-full p-3.5 text-left hover:bg-stone-50 transition-colors flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <span className="w-6 h-6 rounded-md bg-stone-100 text-zinc-700 font-mono text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
                        {stu.roll_number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-900 truncate">
                            {stu.full_name}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md shrink-0 ${
                              isAlert
                                ? 'bg-amber-50 text-amber-800 border border-amber-200/60 font-medium'
                                : 'bg-stone-100 text-zinc-500'
                            }`}
                          >
                            {badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                          {detail}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] text-teal-700 font-semibold shrink-0 pt-0.5">
                      Select →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
