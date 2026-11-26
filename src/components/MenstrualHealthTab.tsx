import React, { useMemo, useState } from 'react';
import {
  Lock,
  Plus,
  Search,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type {
  StudentRecord,
  MenstrualLogRecord,
  ItemInventoryRecord,
} from '../utils/nurseLogic';
import { getTodayLocalDateString } from '../utils/seedData';
import { CustomSelect } from './CustomSelect';
import { ModalDialog } from './ModalDialog';
import type { ProgramsActionResult } from './ProgramsWorkspaceView';

interface MenstrualHealthTabProps {
  students: StudentRecord[];
  classes: string[];
  menstrualLogs: MenstrualLogRecord[];
  items: ItemInventoryRecord[];
  onUpsertMenstrualLog: (record: Partial<MenstrualLogRecord>) => Promise<ProgramsActionResult>;
  onDeleteMenstrualLog: (menstrualId: string) => Promise<ProgramsActionResult>;
}

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return clean;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function maskStudentName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .map((p) => (p.length <= 1 ? p : `${p[0]}${'•'.repeat(Math.min(5, p.length - 1))}`))
    .join(' ');
}

export const MenstrualHealthTab: React.FC<MenstrualHealthTabProps> = ({
  students,
  classes,
  menstrualLogs,
  items,
  onUpsertMenstrualLog,
  onDeleteMenstrualLog,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [onlyIrregular, setOnlyIrregular] = useState(false);
  const [discreetMask, setDiscreetMask] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<MenstrualLogRecord | null>(null);
  const [studentId, setStudentId] = useState('');
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerClass, setPickerClass] = useState('ALL');
  const [cycleStartDate, setCycleStartDate] = useState(getTodayLocalDateString());
  const [cycleEndDate, setCycleEndDate] = useState('');
  const [flowOrPainNotes, setFlowOrPainNotes] = useState('');
  const [padsIssued, setPadsIssued] = useState('');
  const [linkedItemId, setLinkedItemId] = useState('');
  const [irregularFlag, setIrregularFlag] = useState(false);
  const [privateNotes, setPrivateNotes] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<MenstrualLogRecord | null>(null);

  const studentById = useMemo(
    () => new Map(students.map((s) => [s.student_id, s])),
    [students]
  );

  // Prioritize sanitary / hygiene supplies in the inventory selector
  const sanitaryItems = useMemo(() => {
    const available = items.filter((it) => it.current_stock > 0);
    return [...available].sort((a, b) => {
      const aSan = /pad|sanitary|hygiene|napkin/i.test(`${a.name} ${a.category}`) ? 0 : 1;
      const bSan = /pad|sanitary|hygiene|napkin/i.test(`${b.name} ${b.category}`) ? 0 : 1;
      if (aSan !== bSan) return aSan - bSan;
      return a.name.localeCompare(b.name);
    });
  }, [items]);

  const sortedLogs = useMemo(
    () =>
      [...menstrualLogs].sort((a, b) => {
        const d = (b.cycle_start_date || '').localeCompare(a.cycle_start_date || '');
        if (d !== 0) return d;
        return (b.created_at || '').localeCompare(a.created_at || '');
      }),
    [menstrualLogs]
  );

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sortedLogs.filter((log) => {
      const stu = studentById.get(log.student_id);
      const sec = log.section || stu?.section || '';
      const name = log.student_name || stu?.full_name || '';
      const roll = log.roll_number || stu?.roll_number || '';
      if (selectedClass !== 'ALL' && sec !== selectedClass) return false;
      if (onlyIrregular && !log.irregular_flag) return false;
      if (!q) return true;
      return (
        name.toLowerCase().includes(q) ||
        sec.toLowerCase().includes(q) ||
        roll.toLowerCase().includes(q) ||
        (log.flow_or_pain_notes || '').toLowerCase().includes(q) ||
        (log.private_notes || '').toLowerCase().includes(q)
      );
    });
  }, [sortedLogs, studentById, selectedClass, onlyIrregular, searchQuery]);

  const metrics = useMemo(() => {
    const totalEntries = menstrualLogs.length;
    const irregularCount = menstrualLogs.filter((m) => m.irregular_flag).length;
    const totalPads = menstrualLogs.reduce((sum, m) => sum + (Number(m.pads_issued) || 0), 0);
    return { totalEntries, irregularCount, totalPads };
  }, [menstrualLogs]);

  const openNewModal = () => {
    setFeedback(null);
    setEditingLog(null);
    setStudentId('');
    setPickerQuery('');
    setPickerClass('ALL');
    setCycleStartDate(getTodayLocalDateString());
    setCycleEndDate('');
    setFlowOrPainNotes('');
    setPadsIssued('');
    const defaultSanitary = sanitaryItems.find((it) =>
      /pad|sanitary|napkin/i.test(`${it.name} ${it.category}`)
    );
    setLinkedItemId(defaultSanitary?.item_id || '');
    setIrregularFlag(false);
    setPrivateNotes('');
    setModalOpen(true);
  };

  const openEditModal = (log: MenstrualLogRecord) => {
    setFeedback(null);
    setEditingLog(log);
    setStudentId(log.student_id);
    setCycleStartDate(log.cycle_start_date || getTodayLocalDateString());
    setCycleEndDate(log.cycle_end_date || '');
    setFlowOrPainNotes(log.flow_or_pain_notes || '');
    setPadsIssued(log.pads_issued ? String(log.pads_issued) : '');
    setLinkedItemId(log.item_id || '');
    setIrregularFlag(Boolean(log.irregular_flag));
    setPrivateNotes(log.private_notes || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      setFeedback({ type: 'error', text: 'Please select a student.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const parsedPads = padsIssued.trim() ? parseInt(padsIssued, 10) : 0;
      const res = await onUpsertMenstrualLog({
        menstrual_id: editingLog?.menstrual_id,
        student_id: studentId,
        cycle_start_date: cycleStartDate,
        cycle_end_date: cycleEndDate.trim(),
        flow_or_pain_notes: flowOrPainNotes.trim(),
        pads_issued: Number.isFinite(parsedPads) && parsedPads > 0 ? parsedPads : 0,
        item_id: !editingLog && parsedPads > 0 && linkedItemId ? linkedItemId : undefined,
        irregular_flag: irregularFlag,
        private_notes: privateNotes.trim(),
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
      const res = await onDeleteMenstrualLog(deleteTarget.menstrual_id);
      setFeedback({ type: res.ok ? 'success' : 'error', text: res.message });
      if (res.ok) setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const selectedStudentObj = useMemo(
    () => students.find((s) => s.student_id === studentId) || null,
    [students, studentId]
  );

  const pickerFiltered = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return students
      .filter((s) => s.active_status !== 'Inactive')
      .filter((s) => (pickerClass === 'ALL' ? true : s.section === pickerClass))
      .filter((s) => {
        if (!q) return true;
        return (
          s.full_name.toLowerCase().includes(q) ||
          s.section.toLowerCase().includes(q) ||
          s.roll_number.toLowerCase().includes(q)
        );
      })
      .slice(0, 25);
  }, [students, pickerClass, pickerQuery]);

  return (
    <div className="space-y-4">
      {/* Calm Clinical Privacy Notice */}
      <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <Lock className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-700 leading-relaxed">
            <span className="font-semibold text-slate-900">Restricted to Nurse &amp; Admin only.</span>{' '}
            Hidden from Hostel Warden accounts and excluded from default shared exports.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDiscreetMask((v) => !v)}
          className={`self-start sm:self-center h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
            discreetMask
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
          }`}
        >
          {discreetMask ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>{discreetMask ? 'Reveal Names' : 'Discreet Mask'}</span>
        </button>
      </div>

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

      {/* Unified 3-Column Metric Strip */}
      <div className="grid grid-cols-3 bg-white rounded-xl border border-slate-200/90 divide-x divide-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
            Logged Entries
          </div>
          <div className="mt-0.5 text-lg sm:text-xl font-semibold text-slate-900 tabular-nums">
            {metrics.totalEntries}
          </div>
        </div>
        <div className="px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
            Irregular Flagged
          </div>
          <div className="mt-0.5 text-lg sm:text-xl font-semibold text-amber-700 tabular-nums">
            {metrics.irregularCount}
          </div>
        </div>
        <div className="px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
            Pads Issued
          </div>
          <div className="mt-0.5 text-lg sm:text-xl font-semibold text-teal-800 tabular-nums">
            {metrics.totalPads}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student, class, notes..."
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600"
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
          <button
            type="button"
            onClick={() => setOnlyIrregular((v) => !v)}
            className={`h-10 px-3 rounded-xl border text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              onlyIrregular
                ? 'bg-amber-50 text-amber-900 border-amber-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {onlyIrregular ? 'Showing Irregular Only' : 'Filter: Irregular'}
          </button>
        </div>

        <button
          type="button"
          onClick={openNewModal}
          className="h-10 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Log Entry</span>
        </button>
      </div>

      {/* Private Log List */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Lock className="w-8 h-8 text-slate-300 mx-auto mb-2.5" />
            <p className="text-sm font-medium text-slate-800">
              {menstrualLogs.length === 0
                ? 'No menstrual care entries logged yet.'
                : 'No entries match your current filter.'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Records logged here remain private to Nurse and Admin accounts and can optionally deduct pads from inventory.
            </p>
            <button
              type="button"
              onClick={openNewModal}
              className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log First Entry</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map((log) => {
              const stu = studentById.get(log.student_id);
              const rawName = log.student_name || stu?.full_name || log.student_id;
              const displayName = discreetMask ? maskStudentName(rawName) : rawName;
              const sec = log.section || stu?.section || '—';
              const roll = log.roll_number || stu?.roll_number || '—';

              return (
                <div
                  key={log.menstrual_id}
                  className="px-4 py-3.5 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold text-slate-900">
                        {displayName}
                      </span>
                      <span className="text-xs text-slate-500">
                        {sec} · Roll {discreetMask ? '••' : roll}
                      </span>
                      {log.irregular_flag && (
                        <span className="text-xs font-semibold text-amber-700">
                          · Irregular Cycle Flagged
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600">
                      <span className="tabular-nums">
                        Start: {formatShortDate(log.cycle_start_date)}
                      </span>
                      {log.cycle_end_date && (
                        <>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="tabular-nums">
                            End: {formatShortDate(log.cycle_end_date)}
                          </span>
                        </>
                      )}
                      {log.pads_issued && log.pads_issued > 0 ? (
                        <>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="font-medium text-teal-800 tabular-nums">
                            {log.pads_issued} {log.pads_issued === 1 ? 'pad' : 'pads'} issued
                            {log.item_name ? ` (${log.item_name})` : ''}
                          </span>
                        </>
                      ) : null}
                    </div>

                    {(log.flow_or_pain_notes || log.private_notes) && (
                      <div className="text-xs text-slate-600 leading-relaxed">
                        {discreetMask ? (
                          <span className="italic text-slate-400">
                            Clinical notes hidden while Discreet Mask is active
                          </span>
                        ) : (
                          [
                            log.flow_or_pain_notes ? `Flow/Pain: ${log.flow_or_pain_notes}` : '',
                            log.private_notes ? `Notes: ${log.private_notes}` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => openEditModal(log)}
                      className="h-9 px-3 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(log)}
                      aria-label="Delete menstrual log entry"
                      className="h-9 w-9 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg inline-flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <ModalDialog
        open={modalOpen}
        onClose={() => !busy && setModalOpen(false)}
        title={editingLog ? 'Edit Menstrual Care Entry' : 'Log Menstrual Care Entry'}
        subtitle="Confidential record visible only to School Nurse & Infirmary Administrator."
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {selectedStudentObj ? (
            <div className="px-3.5 py-2.5 rounded-xl bg-teal-50/70 border border-teal-200/80 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {selectedStudentObj.full_name}
                </div>
                <div className="text-xs text-teal-800">
                  {selectedStudentObj.section} · Roll {selectedStudentObj.roll_number}
                </div>
              </div>
              {!editingLog && (
                <button
                  type="button"
                  onClick={() => setStudentId('')}
                  className="text-xs font-medium text-teal-800 px-2.5 py-1 rounded-lg bg-white border border-teal-200 cursor-pointer"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Student *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                <div className="relative sm:col-span-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Search student name or roll no..."
                    className="w-full h-9 pl-8.5 pr-3 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-teal-600"
                  />
                </div>
                <CustomSelect
                  value={pickerClass}
                  onChange={setPickerClass}
                  options={[
                    { value: 'ALL', label: 'All Classes' },
                    ...classes.map((c) => ({ value: c, label: c })),
                  ]}
                  size="sm"
                />
              </div>
              <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                {pickerFiltered.map((stu) => (
                  <button
                    key={stu.student_id}
                    type="button"
                    onClick={() => setStudentId(stu.student_id)}
                    className="w-full px-3 py-2 text-left hover:bg-teal-50/70 text-xs flex items-center justify-between cursor-pointer"
                  >
                    <span className="font-medium text-slate-900">{stu.full_name}</span>
                    <span className="text-slate-500">
                      {stu.section} · Roll {stu.roll_number}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Cycle Start Date *
              </label>
              <input
                type="date"
                required
                value={cycleStartDate}
                onChange={(e) => setCycleStartDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Cycle End Date (Optional)
              </label>
              <input
                type="date"
                value={cycleEndDate}
                onChange={(e) => setCycleEndDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Pads Issued
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={padsIssued}
                onChange={(e) => setPadsIssued(e.target.value)}
                placeholder="0"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm tabular-nums text-slate-900 focus:outline-none focus:border-teal-600"
              />
            </div>
            {!editingLog && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Auto-Deduct From Supplies Inventory (Optional)
                </label>
                <CustomSelect
                  value={linkedItemId}
                  onChange={setLinkedItemId}
                  options={[
                    { value: '', label: 'Do not deduct from stock' },
                    ...sanitaryItems.map((it) => ({
                      value: it.item_id,
                      label: `${it.name} (${it.current_stock} ${it.unit})`,
                    })),
                  ]}
                  size="md"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Flow / Cramps / Comfort Notes
            </label>
            <input
              type="text"
              value={flowOrPainNotes}
              onChange={(e) => setFlowOrPainNotes(e.target.value)}
              placeholder="e.g. Mild cramps, warm water bag provided, rested 30 mins"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-teal-600"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={irregularFlag}
              onChange={(e) => setIrregularFlag(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm text-slate-800 font-medium">
              Flag irregular cycle or severe pain for nurse follow-up
            </span>
          </label>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Private Clinical Notes
            </label>
            <textarea
              rows={2}
              value={privateNotes}
              onChange={(e) => setPrivateNotes(e.target.value)}
              placeholder="Any discreet observations or follow-up guidance..."
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
              disabled={busy || !studentId}
              className="h-10 px-5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Saving...' : editingLog ? 'Save Changes' : 'Save Confidential Entry'}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Delete Confirmation */}
      <ModalDialog
        open={Boolean(deleteTarget)}
        onClose={() => !busy && setDeleteTarget(null)}
        title="Delete Menstrual Log Entry"
        subtitle="This permanently removes the confidential entry."
        maxWidthClass="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Remove the menstrual care entry dated{' '}
            <span className="font-semibold font-mono">{deleteTarget?.cycle_start_date}</span>?
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
              {busy ? 'Deleting...' : 'Delete Entry'}
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
};
