import React, { useState, useMemo } from 'react';
import {
  Printer,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import {
  getDailyVisitLog,
  type StudentRecord,
  type VisitRecord,
  type DailyLogEntry,
} from '../utils/nurseLogic';
import { getTodayLocalDateString } from '../utils/seedData';

interface DailyLogViewProps {
  students: StudentRecord[];
  visits: VisitRecord[];
  onOpenPrintPreview: (date: string, entries: DailyLogEntry[]) => void;
  onOpenStudentProfile: (studentId: string) => void;
  onStartNewVisit: () => void;
}

export const DailyLogView: React.FC<DailyLogViewProps> = ({
  students,
  visits,
  onOpenPrintPreview,
  onOpenStudentProfile,
  onStartNewVisit,
}) => {
  const [selectedDate, setSelectedDate] = useState(getTodayLocalDateString);

  const dailyEntries = useMemo(
    () => getDailyVisitLog(visits, students, selectedDate),
    [visits, students, selectedDate]
  );

  const sortedEntriesNewestFirst = useMemo(
    () =>
      [...dailyEntries].sort((a, b) => {
        const dtCmp = b.visit.visit_datetime.localeCompare(a.visit.visit_datetime);
        if (dtCmp !== 0) return dtCmp;
        return b.visit.created_at.localeCompare(a.visit.created_at);
      }),
    [dailyEntries]
  );

  const shiftDate = (daysDelta: number) => {
    const parts = selectedDate.split('-').map(Number);
    if (parts.length !== 3) return;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + daysDelta);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-3.5 sm:space-y-6">
      {/* Desktop Header (Preserved for PC) */}
      <div className="hidden sm:flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
        <div>
          <p className="text-xs font-medium text-teal-700">
            Chronological Infirmary Register
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 font-display tracking-tight mt-0.5">
            Daily Visit Log
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            <span data-testid="daily-log-count" className="font-mono font-semibold text-zinc-800">
              {dailyEntries.length}
            </span>{' '}
            {dailyEntries.length === 1 ? 'visit' : 'visits'} recorded on {selectedDate} · Newest first
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center bg-white border border-stone-200 rounded-xl p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              aria-label="Previous day"
              className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-900 rounded-lg active:bg-stone-100"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              aria-label="Select log date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2 text-xs font-mono tabular-nums font-medium text-zinc-900 bg-transparent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => shiftDate(1)}
              aria-label="Next day"
              className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-900 rounded-lg active:bg-stone-100"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSelectedDate(getTodayLocalDateString())}
            className="h-10 px-3.5 text-xs font-medium text-zinc-700 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 active:bg-stone-100 shrink-0"
          >
            Today
          </button>

          <button
            type="button"
            onClick={() => onOpenPrintPreview(selectedDate, dailyEntries)}
            className="h-10 px-4 text-xs font-semibold text-white bg-zinc-900 rounded-xl hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Daily Log (A4)
          </button>
        </div>
      </div>

      {/* Mobile-only Header (<sm) */}
      <div className="sm:hidden space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center bg-white border border-stone-200/90 rounded-xl p-1 shadow-2xs flex-1 justify-between">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              aria-label="Previous day"
              className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-900 rounded-lg active:bg-stone-100"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              aria-label="Select log date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2 text-xs font-mono tabular-nums font-semibold text-zinc-900 bg-transparent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => shiftDate(1)}
              aria-label="Next day"
              className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-900 rounded-lg active:bg-stone-100"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSelectedDate(getTodayLocalDateString())}
            className="h-10 px-3 text-xs font-semibold text-zinc-700 bg-white border border-stone-200/90 rounded-xl active:bg-stone-100 shrink-0 shadow-2xs"
          >
            Today
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 px-1 text-xs">
          <span className="text-zinc-500">
            <span className="font-mono font-bold text-zinc-900">{dailyEntries.length}</span> visits on {selectedDate}
          </span>
          <button
            type="button"
            onClick={() => onOpenPrintPreview(selectedDate, dailyEntries)}
            className="text-xs font-bold text-teal-800 flex items-center gap-1 active:underline"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Log (A4)</span>
          </button>
        </div>
      </div>

      {/* Log Surface */}
      <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgb(0,0,0,0.02)]">
        {sortedEntriesNewestFirst.length === 0 ? (
          <div data-testid="daily-log-empty" className="py-14 px-4 text-center max-w-sm mx-auto">
            <p className="text-base font-semibold text-zinc-900 font-display">
              No visits on {selectedDate}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Select another date above or record a new student visit.
            </p>
            <button
              type="button"
              onClick={onStartNewVisit}
              className="mt-4 h-10 px-4 text-xs font-semibold text-white bg-zinc-900 rounded-xl hover:bg-zinc-800 inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Record Visit
            </button>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {sortedEntriesNewestFirst.map((entry) => (
              <div
                key={entry.visit.visit_id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenStudentProfile(entry.student.student_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenStudentProfile(entry.student.student_id);
                  }
                }}
                className="group p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-6 hover:bg-stone-50/80 active:bg-stone-100/60 transition-colors cursor-pointer select-none"
              >
                {/* Mobile Top Meta Row (hidden on sm+, shown inline on mobile) */}
                <div className="flex sm:hidden items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-semibold text-zinc-900">
                      {entry.visitTimeFormatted}
                    </span>
                    <span className="text-zinc-300" aria-hidden="true">·</span>
                    <span className="text-zinc-500">Visit #{entry.visitNumber}</span>
                  </div>
                  <span className="font-mono text-zinc-500">
                    Roll {entry.student.roll_number} · {entry.student.section}
                  </span>
                </div>

                {/* Desktop Left + Center Stack */}
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  {/* Desktop Time Column */}
                  <div className="hidden sm:block text-left shrink-0 w-20 pt-0.5">
                    <span className="block font-mono text-xs font-semibold text-zinc-900 whitespace-nowrap">
                      {entry.visitTimeFormatted}
                    </span>
                    <span className="block font-mono text-[11px] text-zinc-400 mt-0.5">
                      Visit #{entry.visitNumber}
                    </span>
                  </div>

                  {/* Student & Clinical Details */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm sm:text-base font-semibold text-zinc-900 group-hover:text-teal-700 text-left transition-colors">
                        {entry.student.full_name}
                      </span>
                      <span className="hidden sm:inline font-mono text-xs text-zinc-400">
                        Roll {entry.student.roll_number} · {entry.student.section}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm font-medium text-zinc-800 leading-snug">
                      {entry.visit.reason}
                    </p>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      {entry.visit.action_taken}
                    </p>
                  </div>
                </div>

                {/* Medicine Summary (Clean bottom strip on mobile, structured right column on desktop) */}
                <div className="pt-2 sm:pt-0.5 border-t sm:border-t-0 border-stone-100 flex flex-col items-start sm:items-end justify-between text-xs shrink-0 sm:text-right sm:max-w-[230px] gap-0.5 sm:gap-0">
                  <span className="text-[11px] text-zinc-400 font-medium">Medicine</span>
                  <span className="font-medium text-zinc-800 sm:mt-0.5 leading-snug">
                    {entry.medicineSummary}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
