import React, { useState, useMemo, useDeferredValue } from 'react';
import {
  Search,
  Check,
  CheckSquare,
  Square,
  AlertCircle,
  Clock,
  X,
  Users,
  Pill,
  Package,
  RotateCcw,
  ClipboardList,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  searchStudents,
  classifyVisitShift,
  formatShiftPeriodLabel,
  formatHHMMTo12h,
  parseFractionalQuantity,
  DEFAULT_INFIRMARY_SETTINGS,
  type StudentRecord,
  type MedicineStatus,
  type VisitShiftPeriod,
  type MedicineInventoryRecord,
  type ItemInventoryRecord,
  type InfirmarySettings,
} from '../utils/nurseLogic';
import { getNowLocalDatetimeString, DEFAULT_STAFF_NAME } from '../utils/seedData';
import { CustomSelect } from './CustomSelect';

export interface BulkVisitPayload {
  studentIds: string[];
  template: {
    visit_datetime: string;
    shift_period: VisitShiftPeriod;
    shift_overridden: boolean;
    reason: string;
    observations: string;
    action_taken: string;
    medicine_status: MedicineStatus;
    medicine_name: string;
    medicine_id?: string;
    medicine_qty?: number;
    item_id?: string;
    item_name?: string;
    item_qty?: number;
    dosage: string;
    dosage_unit: string;
    route: string;
    administration_time: string;
    notes: string;
    recorded_by: string;
  };
}

export interface BulkVisitResult {
  count: number;
  totalMedDeducted: number;
  totalItemDeducted: number;
}

interface BulkVisitPanelProps {
  students: StudentRecord[];
  availableClasses: string[];
  visitedTodayStudentIds: Set<string>;
  medicines: MedicineInventoryRecord[];
  items: ItemInventoryRecord[];
  settings?: InfirmarySettings;
  activeNurseName: string;
  onSaveBulkVisits: (payload: BulkVisitPayload) => Promise<BulkVisitResult>;
  onViewTodaysVisits: () => void;
  onClose?: () => void;
}

const BULK_QUICK_REASONS = [
  'Cold',
  'Cough',
  'Fever / Sore Throat',
  'Headache / Fatigue',
  'Stomach Ache',
  'Swelling',
  'Allergic Sneezing',
  'Playground Scrape',
  'Skin problem',
  'Eye problem',
  'Ear problem',
];

const BULK_QUICK_ACTIONS = [
  'Steam inhalation',
  'Cold ice pack compression',
  'Oral hydration (ORS 200 ml) & 20 mins rest',
  'Temperature checked; cold sponging & observation',
  'Cleaned wound with saline & applied sterile dressing',
  'Skin inspection done',
  'Eye inspection done',
  'Ear inspection done',
  'Parent informed via school office',
  'NA',
];

const QUICK_QTY_PRESETS = [
  { label: '¼', qty: '0.25', dose: '1/4' },
  { label: '½', qty: '0.5', dose: '1/2' },
  { label: '1', qty: '1', dose: '1' },
  { label: '2', qty: '2', dose: '2' },
];

function isCountableMedicineUnit(unitStr: string | undefined | null): boolean {
  return /\b(?:tab|tabs|tablet|tablets|cap|caps|capsule|capsules|pill|pills|sachet|sachets|strip|strips|pcs|piece|pieces)\b/i.test(
    String(unitStr || '')
  );
}

function inferDosageUnitFromInventory(unitStr: string | undefined | null): string | null {
  const u = String(unitStr || '').trim().toLowerCase();
  if (!u) return null;
  if (/tab|cap|pill/.test(u)) return 'tablet';
  if (/drop/.test(u)) return 'drops';
  if (/ml|syrup|susp|liquid|bottle/.test(u)) return 'ml';
  if (/mg/.test(u)) return 'mg';
  if (/oint|cream|gel|tube|apply|topical/.test(u)) return 'application';
  return null;
}

export const BulkVisitPanel: React.FC<BulkVisitPanelProps> = ({
  students,
  availableClasses,
  visitedTodayStudentIds,
  medicines,
  items,
  settings = DEFAULT_INFIRMARY_SETTINGS,
  activeNurseName,
  onSaveBulkVisits,
  onViewTodaysVisits,
  onClose,
}) => {
  // Step 1: Shared Problem & Care
  const [reason, setReason] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [visitDatetime, setVisitDatetime] = useState(getNowLocalDatetimeString);
  const [shiftMode, setShiftMode] = useState<'auto' | VisitShiftPeriod>('auto');
  const [observations, setObservations] = useState('');
  const [notes, setNotes] = useState('');
  const [recordedBy, setRecordedBy] = useState(activeNurseName || DEFAULT_STAFF_NAME);

  // Step 2: Multi-Student Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const deferredSearch = useDeferredValue(studentSearch);
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const [showSelectedPreview, setShowSelectedPreview] = useState(false);

  // Step 3: Shared Medicine & Infirmary Item
  const [medicineStatus, setMedicineStatus] = useState<MedicineStatus>('none');
  const [selectedMedicineId, setSelectedMedicineId] = useState('');
  const [medicineName, setMedicineName] = useState('');
  const [medicineQty, setMedicineQty] = useState('1');
  const [dosage, setDosage] = useState('');
  const [dosageUnit, setDosageUnit] = useState('tablet');
  const [route, setRoute] = useState('Oral');
  const [adminTime, setAdminTime] = useState('');

  const [selectedItemId, setSelectedItemId] = useState('');
  const [itemQty, setItemQty] = useState('1');

  // Submission & Feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedSummary, setSavedSummary] = useState<{
    count: number;
    reason: string;
    medicineLabel: string;
    totalMedDeducted: number;
    medUnit: string;
    totalItemDeducted: number;
    itemName: string;
    itemUnit: string;
  } | null>(null);

  const autoShiftPeriod = useMemo(
    () => classifyVisitShift(visitDatetime, settings),
    [visitDatetime, settings]
  );
  const effectiveShiftPeriod: VisitShiftPeriod =
    shiftMode === 'auto' ? autoShiftPeriod : shiftMode;

  const filteredStudents = useMemo(
    () => searchStudents(students, deferredSearch, sectionFilter),
    [students, deferredSearch, sectionFilter]
  );

  const studentById = useMemo(
    () => new Map(students.map((s) => [s.student_id, s])),
    [students]
  );

  const selectedStudentsList = useMemo(() => {
    const arr: StudentRecord[] = [];
    for (const id of selectedIds) {
      const stu = studentById.get(id);
      if (stu) arr.push(stu);
    }
    return arr;
  }, [selectedIds, studentById]);

  const allShownSelected = useMemo(() => {
    if (filteredStudents.length === 0) return false;
    return filteredStudents.every((s) => selectedIds.has(s.student_id));
  }, [filteredStudents, selectedIds]);

  const shownSelectedCount = useMemo(
    () => filteredStudents.filter((s) => selectedIds.has(s.student_id)).length,
    [filteredStudents, selectedIds]
  );

  const selectedMedicineRecord = useMemo(
    () => medicines.find((m) => m.medicine_id === selectedMedicineId) || null,
    [medicines, selectedMedicineId]
  );

  const selectedItemRecord = useMemo(
    () => items.find((it) => it.item_id === selectedItemId) || null,
    [items, selectedItemId]
  );

  const parsedMedQtyPerStudent = parseFractionalQuantity(medicineQty) ?? 0;
  const parsedItemQtyPerStudent = parseFractionalQuantity(itemQty) ?? 0;

  const totalMedToDeduct =
    medicineStatus === 'given' && selectedMedicineRecord && parsedMedQtyPerStudent > 0
      ? Number((parsedMedQtyPerStudent * selectedIds.size).toFixed(2))
      : 0;

  const totalItemToDeduct =
    selectedItemRecord && parsedItemQtyPerStudent > 0
      ? Number((parsedItemQtyPerStudent * selectedIds.size).toFixed(2))
      : 0;

  const toggleStudent = (studentId: string) => {
    setErrorMessage(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const toggleSelectAllShown = () => {
    setErrorMessage(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allShownSelected) {
        for (const stu of filteredStudents) {
          next.delete(stu.student_id);
        }
      } else {
        for (const stu of filteredStudents) {
          next.add(stu.student_id);
        }
      }
      return next;
    });
  };

  const clearAllSelected = () => {
    setSelectedIds(new Set());
    setShowSelectedPreview(false);
  };

  const handleResetBatch = () => {
    setSavedSummary(null);
    setSelectedIds(new Set());
    setReason('');
    setActionTaken('');
    setObservations('');
    setNotes('');
    setMedicineStatus('none');
    setSelectedMedicineId('');
    setMedicineName('');
    setMedicineQty('1');
    setDosage('');
    setDosageUnit('tablet');
    setRoute('Oral');
    setAdminTime('');
    setSelectedItemId('');
    setItemQty('1');
    setVisitDatetime(getNowLocalDatetimeString());
    setShiftMode('auto');
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!reason.trim()) {
      setErrorMessage('Please select or type the problem / reason for visit.');
      return;
    }
    if (!actionTaken.trim()) {
      setErrorMessage('Please select or type the care provided (or tap NA).');
      return;
    }
    if (selectedIds.size === 0) {
      setErrorMessage('Please select at least one student.');
      return;
    }
    if (medicineStatus === 'given' && !medicineName.trim()) {
      setErrorMessage('Please choose or enter a medicine name when Medicine Given is selected.');
      return;
    }
    if (medicineStatus === 'given' && selectedMedicineRecord) {
      const parsed = parseFractionalQuantity(medicineQty);
      if (parsed === null || parsed <= 0) {
        setErrorMessage('Enter a valid medicine quantity per student (e.g. 0.5, 1/2, or 1).');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const medQtyNum =
        medicineStatus === 'given' && selectedMedicineRecord
          ? parseFractionalQuantity(medicineQty) ?? 1
          : undefined;
      const itemQtyNum =
        selectedItemRecord ? parseFractionalQuantity(itemQty) ?? 1 : undefined;

      const result = await onSaveBulkVisits({
        studentIds: Array.from(selectedIds),
        template: {
          visit_datetime: visitDatetime,
          shift_period: effectiveShiftPeriod,
          shift_overridden: shiftMode !== 'auto',
          reason: reason.trim(),
          observations: observations.trim(),
          action_taken: actionTaken.trim(),
          medicine_status: medicineStatus,
          medicine_name:
            medicineStatus === 'given' ? medicineName.trim() : '',
          medicine_id:
            medicineStatus === 'given' && selectedMedicineRecord
              ? selectedMedicineRecord.medicine_id
              : undefined,
          medicine_qty: medQtyNum,
          item_id: selectedItemRecord ? selectedItemRecord.item_id : undefined,
          item_name: selectedItemRecord ? selectedItemRecord.name : undefined,
          item_qty: itemQtyNum,
          dosage: medicineStatus === 'given' ? dosage.trim() : '',
          dosage_unit: medicineStatus === 'given' ? dosageUnit.trim() : '',
          route: medicineStatus === 'given' ? route.trim() : '',
          administration_time: medicineStatus === 'given' ? adminTime.trim() : '',
          notes: notes.trim(),
          recorded_by: recordedBy.trim() || activeNurseName || DEFAULT_STAFF_NAME,
        },
      });

      setSavedSummary({
        count: result.count,
        reason: reason.trim(),
        medicineLabel:
          medicineStatus === 'given'
            ? `${medicineName.trim()}${dosage ? ` (${dosage} ${dosageUnit})` : ''}`
            : medicineStatus === 'not_recorded'
              ? 'Not recorded'
              : 'No medicine given',
        totalMedDeducted: result.totalMedDeducted,
        medUnit: selectedMedicineRecord?.unit || '',
        totalItemDeducted: result.totalItemDeducted,
        itemName: selectedItemRecord?.name || '',
        itemUnit: selectedItemRecord?.unit || '',
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : 'Could not save bulk visits. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (savedSummary) {
    return (
      <div className="bg-white border border-stone-200/80 rounded-2xl shadow-2xs p-5 sm:p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200/80 text-teal-700 flex items-center justify-center mx-auto">
          <Check className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg sm:text-xl font-bold text-zinc-900 font-display">
            {savedSummary.count} {savedSummary.count === 1 ? 'visit' : 'visits'} recorded!
          </h3>
          <p className="text-xs sm:text-sm text-zinc-600">
            <span className="font-semibold text-zinc-800">{savedSummary.reason}</span> ·{' '}
            <span>{savedSummary.medicineLabel}</span>
          </p>
        </div>

        {(savedSummary.totalMedDeducted > 0 || savedSummary.totalItemDeducted > 0) && (
          <div className="inline-flex flex-wrap items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-stone-50 border border-stone-200/80 text-xs text-zinc-700">
            {savedSummary.totalMedDeducted > 0 && (
              <span>
                Stock deducted:{' '}
                <strong className="font-mono text-zinc-900">
                  -{savedSummary.totalMedDeducted} {savedSummary.medUnit}
                </strong>
              </span>
            )}
            {savedSummary.totalItemDeducted > 0 && (
              <span>
                Item used:{' '}
                <strong className="font-mono text-zinc-900">
                  -{savedSummary.totalItemDeducted} {savedSummary.itemUnit} ({savedSummary.itemName})
                </strong>
              </span>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={onViewTodaysVisits}
            className="w-full sm:w-auto h-10 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>View Today&apos;s Visits</span>
          </button>
          <button
            type="button"
            onClick={handleResetBatch}
            className="w-full sm:w-auto h-10 px-4 text-xs font-semibold text-zinc-700 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Record Another Batch</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header Banner */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 sm:px-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-950 font-display">
              Bulk Visit Entry
            </h2>
            {selectedIds.size > 0 && (
              <span className="px-2 py-0.5 text-[11px] font-semibold bg-zinc-900 text-white rounded-md tabular-nums">
                {selectedIds.size} selected
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Select a problem, choose all affected students, add medicine if given, and save everyone at once.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="hidden sm:inline-flex h-8 px-3 text-xs font-medium text-zinc-700 bg-white border border-zinc-200/90 hover:bg-zinc-50 rounded-lg items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Desk</span>
          </button>
        )}
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium flex items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-700 hover:text-rose-900 p-0.5 cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
        {/* STEP 1: PROBLEM & CARE PROVIDED */}
        <section className="order-1 lg:order-none lg:col-span-7 lg:col-start-1 bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-zinc-900 font-display">
                1. Problem &amp; Care Provided
              </h3>
              <span className="text-[11px] font-medium text-zinc-500">
                Applied to all selected students
              </span>
            </div>

            {/* Reason for Visit */}
            <div className="space-y-2">
              <label htmlFor="bulk-reason" className="block text-xs font-semibold text-zinc-700">
                Reason for Visit *
              </label>
              <div className="flex flex-wrap gap-1.5">
                {BULK_QUICK_REASONS.map((preset) => {
                  const isActive = reason.trim().toLowerCase() === preset.toLowerCase();
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setReason(preset);
                        setErrorMessage(null);
                      }}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-zinc-900 text-white border-zinc-900'
                          : 'bg-stone-50 text-zinc-700 border-stone-200 hover:bg-stone-100 hover:text-zinc-900'
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
              <input
                id="bulk-reason"
                type="text"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="Or type custom problem (e.g. Seasonal cold, Routine eye check...)"
                className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>

            {/* Care Provided */}
            <div className="space-y-2">
              <label htmlFor="bulk-action" className="block text-xs font-semibold text-zinc-700">
                Care Provided *
              </label>
              <div className="flex flex-wrap gap-1.5">
                {BULK_QUICK_ACTIONS.map((preset) => {
                  const isActive = actionTaken.trim().toLowerCase() === preset.toLowerCase();
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setActionTaken(preset);
                        setErrorMessage(null);
                      }}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors text-left cursor-pointer ${
                        isActive
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-stone-50 text-zinc-700 border-stone-200 hover:bg-stone-100 hover:text-zinc-900'
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
              <input
                id="bulk-action"
                type="text"
                value={actionTaken}
                onChange={(e) => {
                  setActionTaken(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="Or type care provided..."
                className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>

            {/* Optional Date/Time, Shift & Notes (Collapsed by default for speed) */}
            <div className="pt-1 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowOptionalDetails((v) => !v)}
                className="w-full flex items-center justify-between py-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>
                    Time &amp; Notes ({formatShiftPeriodLabel(effectiveShiftPeriod, true)} ·{' '}
                    {visitDatetime.replace('T', ' ')})
                  </span>
                </span>
                {showOptionalDetails ? (
                  <ChevronUp className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                )}
              </button>

              {showOptionalDetails && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="bulk-dt" className="block text-xs font-semibold text-zinc-700 mb-1">
                        Visit Date &amp; Time
                      </label>
                      <input
                        id="bulk-dt"
                        type="datetime-local"
                        value={visitDatetime}
                        onChange={(e) => setVisitDatetime(e.target.value)}
                        className="w-full h-10 px-3 text-xs font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Shift Period (School: {formatHHMMTo12h(settings.school_hours_start)} –{' '}
                        {formatHHMMTo12h(settings.school_hours_end)})
                      </label>
                      <div className="grid grid-cols-3 gap-1 p-1 bg-stone-100 rounded-xl text-[11px] font-semibold">
                        {(
                          [
                            { id: 'auto', label: 'Auto' },
                            { id: 'school_hours', label: 'School' },
                            { id: 'night', label: 'Night' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setShiftMode(opt.id)}
                            className={`h-8 rounded-lg transition-colors cursor-pointer ${
                              shiftMode === opt.id
                                ? 'bg-white text-zinc-900 shadow-2xs'
                                : 'text-zinc-600 hover:text-zinc-900'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="bulk-obs" className="block text-xs font-semibold text-zinc-700 mb-1">
                        Observations (Optional)
                      </label>
                      <input
                        id="bulk-obs"
                        type="text"
                        value={observations}
                        onChange={(e) => setObservations(e.target.value)}
                        placeholder="e.g. Afebrile, mild nasal congestion"
                        className="w-full h-10 px-3 text-xs bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                      />
                    </div>
                    <div>
                      <label htmlFor="bulk-notes" className="block text-xs font-semibold text-zinc-700 mb-1">
                        Additional Notes (Optional)
                      </label>
                      <input
                        id="bulk-notes"
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional batch note"
                        className="w-full h-10 px-3 text-xs bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="bulk-nurse" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Recorded By
                    </label>
                    <input
                      id="bulk-nurse"
                      type="text"
                      value={recordedBy}
                      onChange={(e) => setRecordedBy(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

        {/* STEP 3: MEDICINE & ITEM GIVEN */}
        <section className="order-3 lg:order-none lg:col-span-7 lg:col-start-1 bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-zinc-900 font-display flex items-center gap-1.5">
                <Pill className="w-4 h-4 text-teal-700" />
                <span>3. Medicine &amp; Stock Used (Optional)</span>
              </h3>
            </div>

            {/* 3-Way Medicine Status */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-stone-100 rounded-xl text-xs font-semibold">
              {(
                [
                  { id: 'none', label: 'No Medicine' },
                  { id: 'given', label: 'Medicine Given' },
                  { id: 'not_recorded', label: 'Not Recorded' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setMedicineStatus(opt.id);
                    setErrorMessage(null);
                  }}
                  className={`py-2 px-2 rounded-lg transition-all cursor-pointer ${
                    medicineStatus === opt.id
                      ? 'bg-white text-zinc-900 shadow-2xs font-bold'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {medicineStatus === 'given' && (
              <div className="space-y-3 pt-1">
                {medicines.length > 0 && (
                  <div>
                    <label htmlFor="bulk-med-stock" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Select from Medicine Stock (auto-deducts total for all selected students)
                    </label>
                    <CustomSelect
                      id="bulk-med-stock"
                      ariaLabel="Select medicine from stock"
                      variant="subtle"
                      className="w-full"
                      value={selectedMedicineId}
                      onChange={(val) => {
                        setSelectedMedicineId(val);
                        const chosen = medicines.find((m) => m.medicine_id === val);
                        if (chosen) {
                          setMedicineName(
                            chosen.form_strength
                              ? `${chosen.name} (${chosen.form_strength})`
                              : chosen.name
                          );
                          const inferred = inferDosageUnitFromInventory(chosen.unit);
                          if (inferred) setDosageUnit(inferred);
                          if (!dosage) setDosage(medicineQty || '1');
                        }
                      }}
                      options={[
                        { value: '', label: '— Choose from inventory or type below —' },
                        ...medicines.map((m) => ({
                          value: m.medicine_id,
                          label: `${m.name}${m.form_strength ? ` (${m.form_strength})` : ''} · Stock: ${m.current_stock} ${m.unit}`,
                        })),
                      ]}
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="bulk-med-name" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Medicine Name *
                  </label>
                  <input
                    id="bulk-med-name"
                    type="text"
                    value={medicineName}
                    onChange={(e) => setMedicineName(e.target.value)}
                    placeholder="e.g. Paracetamol 500mg, Cetirizine, ORS"
                    className="w-full h-10 px-3 text-sm bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                  />
                </div>

                {/* Qty per student + Fractional Presets */}
                {selectedMedicineRecord && (
                  <div className="p-3 rounded-xl bg-teal-50/60 border border-teal-200/70 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor="bulk-med-qty" className="text-xs font-semibold text-teal-900">
                        Stock qty per student ({selectedMedicineRecord.unit})
                      </label>
                      {isCountableMedicineUnit(selectedMedicineRecord.unit) && (
                        <div className="flex items-center gap-1">
                          {QUICK_QTY_PRESETS.map((p) => {
                            const active = parseFractionalQuantity(medicineQty) === Number(p.qty);
                            return (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() => {
                                  setMedicineQty(p.qty);
                                  setDosage(p.dose);
                                }}
                                className={`h-7 px-2 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-teal-700 text-white border-teal-700'
                                    : 'bg-white text-teal-900 border-teal-200 hover:bg-teal-100/60'
                                }`}
                              >
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id="bulk-med-qty"
                        type="text"
                        inputMode="decimal"
                        value={medicineQty}
                        onChange={(e) => setMedicineQty(e.target.value)}
                        placeholder="e.g. 0.5, 1/2, 1"
                        className="w-28 h-9 px-3 text-sm font-mono bg-white border border-teal-200 rounded-lg focus:outline-none focus:border-teal-700"
                      />
                      <span className="text-xs text-teal-900">
                        {selectedIds.size > 0 ? (
                          <>
                            Total:{' '}
                            <strong className="font-mono">
                              {totalMedToDeduct} {selectedMedicineRecord.unit}
                            </strong>{' '}
                            <span className="text-teal-700">
                              (Stock: {selectedMedicineRecord.current_stock} →{' '}
                              {Math.max(
                                0,
                                Number((selectedMedicineRecord.current_stock - totalMedToDeduct).toFixed(2))
                              )}
                              )
                            </span>
                          </>
                        ) : (
                          <span className="text-teal-700">
                            Available: {selectedMedicineRecord.current_stock} {selectedMedicineRecord.unit}
                          </span>
                        )}
                      </span>
                    </div>

                    {selectedIds.size > 0 && totalMedToDeduct > selectedMedicineRecord.current_stock && (
                      <p className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        Note: Total needed ({totalMedToDeduct} {selectedMedicineRecord.unit}) exceeds current stock ({selectedMedicineRecord.current_stock}). Stock will go down to 0.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label htmlFor="bulk-dosage" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Dosage
                    </label>
                    <input
                      id="bulk-dosage"
                      type="text"
                      value={dosage}
                      onChange={(e) => setDosage(e.target.value)}
                      placeholder="e.g. 1/2, 5"
                      className="w-full h-9 px-2.5 text-xs bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                    />
                  </div>
                  <div>
                    <label htmlFor="bulk-dosage-unit" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Unit
                    </label>
                    <CustomSelect
                      id="bulk-dosage-unit"
                      ariaLabel="Dosage unit"
                      size="sm"
                      variant="subtle"
                      className="w-full"
                      value={dosageUnit}
                      onChange={setDosageUnit}
                      options={[
                        { value: 'tablet', label: 'tablet' },
                        { value: 'ml', label: 'ml' },
                        { value: 'mg', label: 'mg' },
                        { value: 'drops', label: 'drops' },
                        { value: 'application', label: 'application' },
                        { value: 'sachet', label: 'sachet' },
                      ]}
                    />
                  </div>
                  <div>
                    <label htmlFor="bulk-route" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Route
                    </label>
                    <CustomSelect
                      id="bulk-route"
                      ariaLabel="Route"
                      size="sm"
                      variant="subtle"
                      className="w-full"
                      value={route}
                      onChange={setRoute}
                      options={[
                        { value: 'Oral', label: 'Oral' },
                        { value: 'Topical / Cutaneous', label: 'Topical' },
                        { value: 'Inhalation / Steam', label: 'Inhalation' },
                        { value: 'Ophthalmic (Eye)', label: 'Eye Drops' },
                        { value: 'Otic (Ear)', label: 'Ear Drops' },
                      ]}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Optional Infirmary Item Used */}
            {items.length > 0 && (
              <div className="pt-3 border-t border-stone-100 space-y-2">
                <label htmlFor="bulk-item-stock" className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Infirmary Item Used per Student (Optional)</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2">
                    <CustomSelect
                      id="bulk-item-stock"
                      ariaLabel="Select infirmary item"
                      variant="subtle"
                      className="w-full"
                      value={selectedItemId}
                      onChange={setSelectedItemId}
                      options={[
                        { value: '', label: '— None —' },
                        ...items.map((it) => ({
                          value: it.item_id,
                          label: `${it.name} · Stock: ${it.current_stock} ${it.unit}`,
                        })),
                      ]}
                    />
                  </div>
                  {selectedItemRecord && (
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="Item quantity per student"
                      value={itemQty}
                      onChange={(e) => setItemQty(e.target.value)}
                      placeholder="Qty / student"
                      className="h-10 px-3 text-xs font-mono bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                    />
                  )}
                </div>
                {selectedItemRecord && selectedIds.size > 0 && totalItemToDeduct > 0 && (
                  <p className="text-[11px] text-zinc-600">
                    Total item deduction:{' '}
                    <strong className="font-mono text-zinc-900">
                      -{totalItemToDeduct} {selectedItemRecord.unit}
                    </strong>{' '}
                    ({selectedItemRecord.current_stock} →{' '}
                    {Math.max(0, Number((selectedItemRecord.current_stock - totalItemToDeduct).toFixed(2)))})
                  </p>
                )}
              </div>
            )}
        </section>

        {/* STEP 2: MULTI-STUDENT SELECTOR (SECOND ON MOBILE, RIGHT COLUMN ON DESKTOP) */}
        <section className="order-2 lg:order-none lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:row-span-2 bg-white border border-stone-200/80 rounded-2xl shadow-2xs overflow-hidden flex flex-col lg:h-[640px]">
          <div className="px-4 py-3.5 border-b border-stone-100 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Users className="w-4 h-4 text-teal-700 shrink-0" />
              <h3 className="text-sm font-bold text-zinc-900 font-display truncate">
                2. Select Students
              </h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSelectedPreview((v) => !v)}
                  className="text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded-lg cursor-pointer"
                >
                  {selectedIds.size} selected
                </button>
              )}
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={clearAllSelected}
                  className="text-[11px] font-medium text-zinc-500 hover:text-rose-700 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Expandable Selected Students Chips */}
          {showSelectedPreview && selectedStudentsList.length > 0 && (
            <div className="px-3.5 py-2.5 bg-teal-50/50 border-b border-teal-100 max-h-32 overflow-y-auto shrink-0">
              <div className="flex flex-wrap gap-1.5">
                {selectedStudentsList.map((stu) => (
                  <span
                    key={stu.student_id}
                    className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-[11px] font-medium bg-white border border-teal-200 text-teal-900 rounded-md"
                  >
                    <span className="truncate max-w-[140px]">{stu.full_name}</span>
                    <button
                      type="button"
                      onClick={() => toggleStudent(stu.student_id)}
                      aria-label={`Remove ${stu.full_name}`}
                      className="text-teal-700 hover:text-rose-700 p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Search bar */}
          <div className="relative border-b border-stone-100 shrink-0">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5 pointer-events-none" />
            <input
              type="text"
              aria-label="Search students for bulk visit"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search name, roll number, or class..."
              className="w-full h-11 pl-10 pr-9 text-sm text-zinc-900 bg-transparent placeholder:text-zinc-400 focus:outline-none"
            />
            {studentSearch && (
              <button
                type="button"
                onClick={() => setStudentSearch('')}
                aria-label="Clear search"
                className="absolute right-3 top-3 p-0.5 text-zinc-400 hover:text-zinc-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Class Filter + Select All Shown Bar */}
          <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100 flex items-center justify-between gap-2 shrink-0">
            <CustomSelect
              ariaLabel="Filter students by class"
              size="sm"
              menuMinWidth={160}
              value={sectionFilter}
              onChange={setSectionFilter}
              options={[
                { value: 'ALL', label: `All Classes (${students.length})` },
                ...availableClasses.map((sec) => ({
                  value: sec,
                  label: sec,
                })),
              ]}
            />

            <button
              type="button"
              onClick={toggleSelectAllShown}
              disabled={filteredStudents.length === 0}
              className={`h-8 px-2.5 text-xs font-semibold rounded-lg border inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0 ${
                allShownSelected
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-teal-800 border-teal-200 hover:bg-teal-50'
              }`}
            >
              {allShownSelected ? (
                <CheckSquare className="w-3.5 h-3.5" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              <span>
                {allShownSelected
                  ? `Deselect (${filteredStudents.length})`
                  : `Select All (${filteredStudents.length})`}
              </span>
            </button>
          </div>

          {/* Student Multi-Select List */}
          <div className="flex-1 max-h-[380px] lg:max-h-none overflow-y-auto divide-y divide-stone-100">
            {filteredStudents.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No students match your filter.
              </div>
            ) : (
              filteredStudents.map((stu) => {
                const isSelected = selectedIds.has(stu.student_id);
                const seenToday = visitedTodayStudentIds.has(stu.student_id);
                return (
                  <button
                    key={stu.student_id}
                    type="button"
                    onClick={() => toggleStudent(stu.student_id)}
                    aria-pressed={isSelected}
                    className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer select-none ${
                      isSelected
                        ? 'bg-teal-50/70 hover:bg-teal-50'
                        : 'hover:bg-stone-50/80 active:bg-stone-100/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-teal-700 border-teal-700 text-white'
                            : 'bg-white border-stone-300 text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </span>
                      <span className="w-7 h-7 rounded-lg bg-stone-100 text-zinc-600 text-[11px] font-mono font-semibold flex items-center justify-center shrink-0">
                        {stu.roll_number}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-zinc-900 truncate">
                          {stu.full_name}
                        </p>
                        <p className="text-[11px] text-zinc-500 truncate">
                          {stu.section}
                          {seenToday && (
                            <span className="text-teal-700 font-medium"> · Seen today</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="px-3.5 py-2 bg-stone-50/70 border-t border-stone-100 flex items-center justify-between text-[11px] text-zinc-500 shrink-0">
            <span>
              Shown: <strong className="text-zinc-700">{shownSelectedCount}</strong> /{' '}
              {filteredStudents.length}
            </span>
            <span>
              Total selected: <strong className="text-teal-800">{selectedIds.size}</strong>
            </span>
          </div>
        </section>
      </div>

      {/* Prominent Bottom Action Bar */}
      <div className="sticky bottom-16 sm:bottom-4 z-20 bg-white/95 backdrop-blur-sm border border-stone-200 rounded-2xl p-3 sm:px-5 shadow-md flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="text-xs text-zinc-600 min-w-0">
          {selectedIds.size === 0 ? (
            <span>Select students and enter problem &amp; care to save in one tap.</span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <strong className="text-zinc-900">
                {selectedIds.size} {selectedIds.size === 1 ? 'student' : 'students'}
              </strong>
              {reason.trim() && (
                <>
                  <span className="text-zinc-300">·</span>
                  <span className="text-zinc-800 font-medium truncate max-w-[200px]">
                    {reason.trim()}
                  </span>
                </>
              )}
              {totalMedToDeduct > 0 && selectedMedicineRecord && (
                <>
                  <span className="text-zinc-300">·</span>
                  <span className="text-teal-800 font-medium">
                    -{totalMedToDeduct} {selectedMedicineRecord.unit} stock
                  </span>
                </>
              )}
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting || selectedIds.size === 0}
          className="h-11 sm:h-10 px-5 text-xs sm:text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
        >
          <Check className="w-4 h-4" />
          <span>
            {isSubmitting
              ? `Saving ${selectedIds.size} Visits...`
              : selectedIds.size > 0
                ? `Save ${selectedIds.size} ${selectedIds.size === 1 ? 'Visit' : 'Visits'}`
                : 'Save Bulk Visits'}
          </span>
        </button>
      </div>
    </form>
  );
};
