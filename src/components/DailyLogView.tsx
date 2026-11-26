import React, { useState, useMemo } from 'react';
import { Printer, Search, ArrowRight, Pencil, Check, X, Plus } from 'lucide-react';
import {
  formatTimeFromDatetime,
  formatMedicineDisplay,
  resolveVisitShiftPeriod,
  formatShiftPeriodLabel,
  getDailyVisitLog,
  getAllClassSections,
  DEFAULT_INFIRMARY_SETTINGS,
  type DailyLogEntry,
  type StudentRecord,
  type VisitRecord,
  type MedicineStatus,
  type VisitShiftPeriod,
  type InfirmarySettings,
} from '../utils/nurseLogic';
import { getTodayLocalDateString } from '../utils/seedData';
import { CustomSelect } from './CustomSelect';
import { ModalDialog } from './ModalDialog';

interface DailyLogViewProps {
  students: StudentRecord[];
  visits: VisitRecord[];
  settings?: InfirmarySettings;
  isAdmin?: boolean;
  onOpenPrintPreview: (date: string, entries: DailyLogEntry[]) => void;
  onOpenStudentProfile: (studentId: string) => void;
  onStartNewVisit: () => void;
  onPrintSingleVisit?: (entry: DailyLogEntry) => void;
  onUpdateVisit?: (
    visitId: string,
    updates: Partial<
      Pick<
        VisitRecord,
        | 'visit_datetime'
        | 'shift_period'
        | 'shift_overridden'
        | 'reason'
        | 'observations'
        | 'action_taken'
        | 'medicine_status'
        | 'medicine_name'
        | 'dosage'
        | 'dosage_unit'
        | 'route'
        | 'administration_time'
        | 'notes'
        | 'recorded_by'
      >
    >
  ) => Promise<void> | void;
}

export const DailyLogView: React.FC<DailyLogViewProps> = ({
  students,
  visits,
  settings = DEFAULT_INFIRMARY_SETTINGS,
  isAdmin = false,
  onOpenPrintPreview,
  onOpenStudentProfile,
  onStartNewVisit,
  onPrintSingleVisit,
  onUpdateVisit,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocalDateString);
  const [sectionFilter, setSectionFilter] = useState<string>('ALL');
  const [shiftFilter, setShiftFilter] = useState<'ALL' | VisitShiftPeriod>('ALL');
  const [query, setQuery] = useState<string>('');
  const [editingEntry, setEditingEntry] = useState<DailyLogEntry | null>(null);
  const [editDatetime, setEditDatetime] = useState('');
  const [editShiftPeriod, setEditShiftPeriod] = useState<VisitShiftPeriod>('school_hours');
  const [editReason, setEditReason] = useState('');
  const [editAction, setEditAction] = useState('');
  const [editObservations, setEditObservations] = useState('');
  const [editMedStatus, setEditMedStatus] = useState<MedicineStatus>('none');
  const [editMedName, setEditMedName] = useState('');
  const [editDosage, setEditDosage] = useState('');
  const [editDosageUnit, setEditDosageUnit] = useState('');
  const [editRoute, setEditRoute] = useState('Oral');
  const [editNotes, setEditNotes] = useState('');
  const [editRecordedBy, setEditRecordedBy] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const entries = useMemo(
    () => getDailyVisitLog(visits, students, selectedDate),
    [visits, students, selectedDate]
  );

  const availableSections = useMemo(
    () => getAllClassSections(students),
    [students]
  );

  const openEditVisitModal = (entry: DailyLogEntry) => {
    const v = entry.visit;
    setEditingEntry(entry);
    setEditDatetime(v.visit_datetime.slice(0, 16));
    setEditShiftPeriod(resolveVisitShiftPeriod(v, settings));
    setEditReason(v.reason || '');
    setEditAction(v.action_taken || '');
    setEditObservations(v.observations || '');
    setEditMedStatus(v.medicine_status || 'none');
    setEditMedName(v.medicine_name || '');
    setEditDosage(v.dosage || '');
    setEditDosageUnit(v.dosage_unit || '');
    setEditRoute(v.route || 'Oral');
    setEditNotes(v.notes || '');
    setEditRecordedBy(v.recorded_by || '');
  };

  const handleSaveEditVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry || !onUpdateVisit) return;
    if (!editReason.trim() || !editAction.trim()) return;
    setEditSaving(true);
    try {
      await onUpdateVisit(editingEntry.visit.visit_id, {
        visit_datetime: editDatetime || editingEntry.visit.visit_datetime,
        shift_period: editShiftPeriod,
        shift_overridden: true,
        reason: editReason.trim(),
        action_taken: editAction.trim(),
        observations: editObservations.trim(),
        medicine_status: editMedStatus,
        medicine_name: editMedStatus === 'given' ? editMedName.trim() : '',
        dosage: editMedStatus === 'given' ? editDosage.trim() : '',
        dosage_unit: editMedStatus === 'given' ? editDosageUnit.trim() : '',
        route: editMedStatus === 'given' ? editRoute.trim() : '',
        notes: editNotes.trim(),
        recorded_by: editRecordedBy.trim() || editingEntry.visit.recorded_by,
      });
      setEditingEntry(null);
    } finally {
      setEditSaving(false);
    }
  };

  const shiftCounts = entries.reduce(
    (acc, item) => {
      const sp = resolveVisitShiftPeriod(item.visit, settings);
      acc[sp] += 1;
      return acc;
    },
    { school_hours: 0, night: 0 }
  );

  const filteredEntries = entries.filter(({ visit, student }) => {
    if (sectionFilter !== 'ALL' && student.section !== sectionFilter) {
      return false;
    }
    if (shiftFilter !== 'ALL' && resolveVisitShiftPeriod(visit, settings) !== shiftFilter) {
      return false;
    }
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      student.full_name.toLowerCase().includes(q) ||
      student.roll_number.toLowerCase().includes(q) ||
      student.section.toLowerCase().includes(q) ||
      visit.reason.toLowerCase().includes(q) ||
      visit.action_taken.toLowerCase().includes(q) ||
      visit.medicine_name.toLowerCase().includes(q)
    );
  });

  const medicineGivenCount = filteredEntries.filter(
    (e) => e.visit.medicine_status === 'given'
  ).length;

  return (
    <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
      {/* Header & Date Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-zinc-950 font-display tracking-tight">
            Daily Visit Log
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            <span data-testid="daily-log-count" className="font-semibold text-zinc-800 tabular-nums">
              {filteredEntries.length} {filteredEntries.length === 1 ? 'visit' : 'visits'}
            </span>{' '}
            on <span className="font-mono text-zinc-700">{selectedDate}</span> ·{' '}
            <span className="tabular-nums">{medicineGivenCount} with medicine</span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            id="daily-log-date"
            type="date"
            aria-label="Filter visits by date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 sm:flex-initial h-9 px-3 text-xs font-mono bg-white border border-zinc-200/90 rounded-xl focus:outline-none focus:border-zinc-900"
          />

          <button
            type="button"
            onClick={onStartNewVisit}
            className="h-9 px-3 text-xs font-medium text-zinc-700 bg-white border border-zinc-200/90 rounded-xl hover:bg-zinc-50 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Record Visit</span>
            <span className="sm:hidden">Visit</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenPrintPreview(selectedDate, filteredEntries)}
            className="h-9 px-3.5 text-xs font-semibold text-white bg-zinc-900 rounded-xl hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Log</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-2.5 pointer-events-none" />
          <input
            type="text"
            aria-label="Search within daily log"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by student, symptom, or medicine..."
            className={`w-full h-9 pl-9 ${query ? 'pr-9' : 'pr-3'} text-xs bg-white border border-zinc-200/90 rounded-xl focus:outline-none focus:border-zinc-900`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear log filter"
              className="absolute right-2.5 top-2.5 p-0.5 text-zinc-400 hover:text-zinc-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Filter visits by shift"
            className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-zinc-200/60 rounded-xl w-full sm:w-auto shrink-0"
          >
            {(
              [
                { key: 'ALL', mobileLabel: `All (${entries.length})`, label: `All (${entries.length})` },
                { key: 'school_hours', mobileLabel: `School (${shiftCounts.school_hours})`, label: `School Hours (${shiftCounts.school_hours})` },
                { key: 'night', mobileLabel: `Night (${shiftCounts.night})`, label: `Night (${shiftCounts.night})` },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setShiftFilter(opt.key)}
                className={`px-2.5 py-1.5 sm:py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap text-center cursor-pointer ${
                  shiftFilter === opt.key
                    ? 'bg-white text-zinc-950 shadow-2xs font-semibold'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <span className="sm:hidden">{opt.mobileLabel}</span>
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            ))}
          </div>

          <CustomSelect
            ariaLabel="Filter by section"
            size="sm"
            value={sectionFilter}
            onChange={setSectionFilter}
            options={[
              { value: 'ALL', label: 'All Classes' },
              ...availableSections.map((sec) => ({
                value: sec,
                label: sec,
              })),
            ]}
            className="w-full sm:w-44 shrink-0"
          />
        </div>
      </div>

      {/* Chronological Visit List */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl overflow-hidden">
        {filteredEntries.length === 0 ? (
          <div
            data-testid="daily-log-empty"
            className="py-16 px-4 text-center max-w-sm mx-auto"
          >
            <p className="text-sm font-semibold text-zinc-900 font-display">
              No visits recorded on {selectedDate}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Choose another date above or clear active filters to view visits.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {filteredEntries.map((entry, idx) => {
              const { visit, student } = entry;
              return (
                <div
                  key={visit.visit_id}
                  className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:bg-zinc-50/70 transition-colors"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <span className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-500 font-mono text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <button
                          type="button"
                          onClick={() => onOpenStudentProfile(student.student_id)}
                          className="text-sm font-medium text-zinc-950 hover:text-teal-700 text-left transition-colors cursor-pointer"
                        >
                          {student.full_name}
                        </button>
                        <span className="text-xs text-zinc-400">
                          {student.section} · Roll {student.roll_number}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-400">
                          · {formatTimeFromDatetime(visit.visit_datetime)}
                        </span>
                        <span className="text-[11px] font-medium text-zinc-500">
                          · {formatShiftPeriodLabel(resolveVisitShiftPeriod(visit, settings), true)}
                        </span>
                      </div>

                      <p className="text-xs font-medium text-zinc-900 pt-0.5">
                        {visit.reason}
                      </p>

                      {visit.observations && (
                        <p className="text-xs text-zinc-500">
                          Observations: {visit.observations}
                        </p>
                      )}

                      <p className="text-xs text-zinc-600 leading-relaxed">
                        {visit.action_taken} ·{' '}
                        <span className="font-medium text-zinc-800">
                          {formatMedicineDisplay(visit)}
                        </span>
                      </p>

                      {visit.notes && (
                        <p className="text-[11px] text-zinc-400 italic">
                          Note: {visit.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 pl-10 sm:pl-0">
                    {isAdmin && onUpdateVisit && (
                      <button
                        type="button"
                        onClick={() => openEditVisitModal(entry)}
                        className="h-8 px-2.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200/80 hover:bg-zinc-50 rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                    )}
                    {onPrintSingleVisit && (
                      <button
                        type="button"
                        onClick={() => onPrintSingleVisit(entry)}
                        className="h-8 px-2.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 border border-zinc-200/80 bg-white hover:bg-zinc-50 rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Printer className="w-3 h-3" />
                        Slip
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenStudentProfile(student.student_id)}
                      className="h-8 px-2.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 bg-zinc-100/80 hover:bg-zinc-200/70 rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      Profile
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ADMIN-ONLY: EDIT VISIT RECORD MODAL */}
      <ModalDialog
        open={Boolean(isAdmin && onUpdateVisit && editingEntry)}
        onClose={() => setEditingEntry(null)}
        title="Edit Visit Entry"
        titleId="edit-visit-modal-title"
        subtitle={
          editingEntry
            ? `${editingEntry.student.full_name} · ${editingEntry.student.section} (Roll ${editingEntry.student.roll_number})`
            : undefined
        }
        maxWidthClass="max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingEntry(null)}
              className="h-9 px-3.5 text-xs font-medium text-zinc-600 bg-white border border-zinc-200/90 hover:bg-zinc-50 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="daily-log-edit-visit-form"
              disabled={editSaving}
              className="h-9 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl disabled:opacity-60 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{editSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </>
        }
      >
        <form
          id="daily-log-edit-visit-form"
          onSubmit={handleSaveEditVisit}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-visit-datetime" className="block text-xs font-medium text-zinc-700 mb-1.5">
                Date &amp; Time *
              </label>
              <input
                id="edit-visit-datetime"
                type="datetime-local"
                value={editDatetime}
                onChange={(e) => setEditDatetime(e.target.value)}
                className="w-full h-10 px-3 text-xs font-mono bg-zinc-50/70 border border-zinc-200/90 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>
            <div>
              <label htmlFor="edit-visit-recorded-by" className="block text-xs font-medium text-zinc-700 mb-1.5">
                Recorded By
              </label>
              <input
                id="edit-visit-recorded-by"
                type="text"
                value={editRecordedBy}
                onChange={(e) => setEditRecordedBy(e.target.value)}
                className="w-full h-10 px-3 text-xs bg-zinc-50/70 border border-zinc-200/90 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              Visit Shift
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: 'school_hours', label: 'School Hours' },
                  { key: 'night', label: 'Night / After-School' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setEditShiftPeriod(opt.key)}
                  className={`h-9 px-3 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                    editShiftPeriod === opt.key
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="edit-visit-reason" className="block text-xs font-medium text-zinc-700 mb-1.5">
              Reason for Visit *
            </label>
            <input
              id="edit-visit-reason"
              type="text"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              className="w-full h-10 px-3 text-xs bg-zinc-50/70 border border-zinc-200/90 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
            />
          </div>

          <div>
            <label htmlFor="edit-visit-action" className="block text-xs font-medium text-zinc-700 mb-1.5">
              Care Provided *
            </label>
            <input
              id="edit-visit-action"
              type="text"
              value={editAction}
              onChange={(e) => setEditAction(e.target.value)}
              className="w-full h-10 px-3 text-xs bg-zinc-50/70 border border-zinc-200/90 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
            />
          </div>

          <div>
            <label htmlFor="edit-visit-observations" className="block text-xs font-medium text-zinc-700 mb-1.5">
              Observations
            </label>
            <input
              id="edit-visit-observations"
              type="text"
              value={editObservations}
              onChange={(e) => setEditObservations(e.target.value)}
              className="w-full h-10 px-3 text-xs bg-zinc-50/70 border border-zinc-200/90 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-visit-med-status" className="block text-xs font-medium text-zinc-700 mb-1.5">
                Medicine Status
              </label>
              <CustomSelect
                id="edit-visit-med-status"
                ariaLabel="Medicine status"
                variant="subtle"
                value={editMedStatus}
                onChange={(val) => setEditMedStatus(val as MedicineStatus)}
                options={[
                  { value: 'none', label: 'No Medicine Given' },
                  { value: 'given', label: 'Medicine Given' },
                  { value: 'not_recorded', label: 'Not Recorded' },
                ]}
                className="w-full"
              />
            </div>

            {editMedStatus === 'given' && (
              <div>
                <label htmlFor="edit-visit-med-name" className="block text-xs font-medium text-zinc-700 mb-1.5">
                  Medicine Name
                </label>
                <input
                  id="edit-visit-med-name"
                  type="text"
                  value={editMedName}
                  onChange={(e) => setEditMedName(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-zinc-50/70 border border-zinc-200/90 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>
            )}
          </div>

          {editMedStatus === 'given' && (
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="edit-visit-dosage" className="block text-xs font-medium text-zinc-700 mb-1.5">
                  Dosage
                </label>
                <input
                  id="edit-visit-dosage"
                  type="text"
                  value={editDosage}
                  onChange={(e) => setEditDosage(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-zinc-50/70 border border-zinc-200/90 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>
              <div>
                <label htmlFor="edit-visit-unit" className="block text-xs font-medium text-zinc-700 mb-1.5">
                  Unit
                </label>
                <input
                  id="edit-visit-unit"
                  type="text"
                  value={editDosageUnit}
                  onChange={(e) => setEditDosageUnit(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-zinc-50/70 border border-zinc-200/90 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>
              <div>
                <label htmlFor="edit-visit-route" className="block text-xs font-medium text-zinc-700 mb-1.5">
                  Route
                </label>
                <input
                  id="edit-visit-route"
                  type="text"
                  value={editRoute}
                  onChange={(e) => setEditRoute(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-zinc-50/70 border border-zinc-200/90 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="edit-visit-notes" className="block text-xs font-medium text-zinc-700 mb-1.5">
              Notes
            </label>
            <input
              id="edit-visit-notes"
              type="text"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="w-full h-10 px-3 text-xs bg-zinc-50/70 border border-zinc-200/90 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900"
            />
          </div>
        </form>
      </ModalDialog>
    </div>
  );
};
