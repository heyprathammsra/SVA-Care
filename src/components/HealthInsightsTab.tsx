import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  Users,
  Activity,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  Search,
} from 'lucide-react';
import {
  computeFrequentVisitors,
  computeCommonIssues,
  type StudentRecord,
  type VisitRecord,
  type DoctorVisitSession,
  type DoctorVisitCase,
  type OpdRecord,
  type HealthInsightsTimeframe,
} from '../utils/nurseLogic';
import { getTodayLocalDateString } from '../utils/seedData';
import { CustomSelect } from './CustomSelect';

interface HealthInsightsTabProps {
  students: StudentRecord[];
  classes: string[];
  visits: VisitRecord[];
  doctorVisits: DoctorVisitSession[];
  doctorVisitCases: DoctorVisitCase[];
  opdRecords: OpdRecord[];
  onSelectStudent?: (student: StudentRecord) => void;
}

const TIMEFRAME_OPTIONS: Array<{ value: HealthInsightsTimeframe; label: string }> = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'term', label: 'This Term' },
  { value: 'all', label: 'All Time' },
];

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return clean;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const HealthInsightsTab: React.FC<HealthInsightsTabProps> = ({
  students,
  classes,
  visits,
  doctorVisits,
  doctorVisitCases,
  opdRecords,
  onSelectStudent,
}) => {
  const [timeframe, setTimeframe] = useState<HealthInsightsTimeframe>('30d');
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [includePrograms, setIncludePrograms] = useState<boolean>(true);
  const [minVisitsFilter, setMinVisitsFilter] = useState<number>(2);
  const [activeView, setActiveView] = useState<'both' | 'visitors' | 'issues'>('both');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIssueKey, setExpandedIssueKey] = useState<string | null>(null);

  const todayRef = useMemo(() => getTodayLocalDateString(), []);

  const allVisitorsInRange = useMemo(
    () =>
      computeFrequentVisitors({
        students,
        visits,
        doctorVisits,
        doctorVisitCases,
        opdRecords,
        timeframe,
        sectionFilter: selectedClass,
        includePrograms,
        minVisits: 1,
        referenceDate: todayRef,
      }),
    [students, visits, doctorVisits, doctorVisitCases, opdRecords, timeframe, selectedClass, includePrograms, todayRef]
  );

  const frequentVisitors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allVisitorsInRange
      .filter((v) => v.totalVisits >= minVisitsFilter)
      .filter((v) => {
        if (!q) return true;
        return (
          v.student.full_name.toLowerCase().includes(q) ||
          v.student.section.toLowerCase().includes(q) ||
          v.student.roll_number.toLowerCase().includes(q) ||
          v.topReasons.some((r) => r.label.toLowerCase().includes(q)) ||
          v.recentReasons.some((r) => r.toLowerCase().includes(q))
        );
      });
  }, [allVisitorsInRange, minVisitsFilter, searchQuery]);

  const commonIssues = useMemo(() => {
    const raw = computeCommonIssues({
      students,
      visits,
      doctorVisits,
      doctorVisitCases,
      opdRecords,
      timeframe,
      sectionFilter: selectedClass,
      includePrograms,
      referenceDate: todayRef,
    });
    const q = searchQuery.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter(
      (issue) =>
        issue.label.toLowerCase().includes(q) ||
        issue.affectedStudents.some(
          (a) =>
            a.student.full_name.toLowerCase().includes(q) ||
            a.student.section.toLowerCase().includes(q)
        )
    );
  }, [students, visits, doctorVisits, doctorVisitCases, opdRecords, timeframe, selectedClass, includePrograms, todayRef, searchQuery]);

  const summary = useMemo(() => {
    const totalCases = commonIssues.reduce((sum, i) => sum + i.totalCases, 0);
    const repeatVisitors = allVisitorsInRange.filter((v) => v.totalVisits >= 2).length;
    const topIssue = commonIssues[0] || null;
    return { totalCases, repeatVisitors, topIssue };
  }, [commonIssues, allVisitorsInRange]);

  const maxIssueCount = useMemo(
    () => Math.max(1, ...commonIssues.map((i) => i.totalCases)),
    [commonIssues]
  );

  return (
    <div className="space-y-4">
      {/* Unified 3-Column Metric Strip */}
      <div className="grid grid-cols-3 bg-white rounded-xl border border-slate-200/90 divide-x divide-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
            Clinical Cases
          </div>
          <div className="mt-0.5 text-lg sm:text-xl font-semibold text-slate-900 tabular-nums">
            {summary.totalCases}
          </div>
        </div>
        <div className="px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
            Repeat Visitors (2+)
          </div>
          <div className="mt-0.5 text-lg sm:text-xl font-semibold text-amber-700 tabular-nums">
            {summary.repeatVisitors}
          </div>
        </div>
        <div className="px-3 py-2.5 sm:px-4 sm:py-3 min-w-0">
          <div className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
            Top Common Issue
          </div>
          <div className="mt-0.5 text-sm sm:text-base font-semibold text-teal-800 truncate">
            {summary.topIssue ? summary.topIssue.label.split(' / ')[0] : '—'}
          </div>
        </div>
      </div>

      {/* Filter & Timeframe Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/70 overflow-x-auto">
          {TIMEFRAME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTimeframe(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                timeframe === opt.value
                  ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.03)]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] sm:w-52 sm:flex-none">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter student or illness..."
              className="w-full h-9 pl-8.5 pr-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600"
            />
          </div>

          <div className="w-34 shrink-0">
            <CustomSelect
              value={selectedClass}
              onChange={setSelectedClass}
              options={[
                { value: 'ALL', label: 'All Classes' },
                ...classes.map((c) => ({ value: c, label: c })),
              ]}
              size="sm"
            />
          </div>

          <button
            type="button"
            onClick={() => setIncludePrograms((v) => !v)}
            className={`h-9 px-3 rounded-xl border text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              includePrograms
                ? 'bg-teal-50 text-teal-900 border-teal-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {includePrograms ? 'Visits + Doctor + OPD' : 'Infirmary Visits Only'}
          </button>
        </div>
      </div>

      {/* Mobile / Compact View Switcher */}
      <div className="flex lg:hidden items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/70">
        {(
          [
            ['both', 'Overview'],
            ['visitors', 'Frequent Visitors'],
            ['issues', 'Common Issues'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setActiveView(val)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              activeView === val
                ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.03)]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Two-Column Insights Grid on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* PANEL 1: FREQUENT VISITORS */}
        {(activeView === 'both' || activeView === 'visitors') && (
          <section className="bg-white rounded-xl border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-teal-700 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-slate-900 truncate">
                    Frequent Visitors
                  </h2>
                  <p className="text-[11.5px] text-slate-500">
                    Students visiting the infirmary most often
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200/60 shrink-0">
                {[1, 2, 3].map((minCount) => (
                  <button
                    key={minCount}
                    type="button"
                    onClick={() => setMinVisitsFilter(minCount)}
                    className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap cursor-pointer ${
                      minVisitsFilter === minCount
                        ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.03)]'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {minCount === 1 ? 'All (1+)' : `${minCount}+ visits`}
                  </button>
                ))}
              </div>
            </div>

            {frequentVisitors.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <TrendingUp className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">
                  No students with {minVisitsFilter}+ visits in this period.
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Try expanding the timeframe to All Time or switching threshold to All (1+).
                </p>
                {minVisitsFilter > 1 && allVisitorsInRange.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMinVisitsFilter(1)}
                    className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg cursor-pointer"
                  >
                    Show All ({allVisitorsInRange.length}) Visitors
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
                {frequentVisitors.map((item, idx) => (
                  <div
                    key={item.student.student_id}
                    className="px-4 py-3 hover:bg-slate-50/70 transition-colors flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs tabular-nums text-slate-400 w-5 shrink-0">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        <span className="text-[13.5px] font-semibold text-slate-900">
                          {item.student.full_name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {item.student.section} · Roll {item.student.roll_number}
                        </span>
                      </div>

                      <div className="mt-1 pl-7 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
                        <span
                          className={`font-semibold tabular-nums ${
                            item.totalVisits >= 4
                              ? 'text-rose-700'
                              : item.totalVisits >= 2
                                ? 'text-amber-700'
                                : 'text-slate-700'
                          }`}
                        >
                          {item.totalVisits} {item.totalVisits === 1 ? 'visit' : 'visits'}
                        </span>
                        {(item.doctorCaseCount > 0 || item.opdCount > 0) && (
                          <>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span className="text-slate-500">
                              {[
                                item.visitCount > 0 ? `${item.visitCount} infirmary` : '',
                                item.doctorCaseCount > 0 ? `${item.doctorCaseCount} doctor` : '',
                                item.opdCount > 0 ? `${item.opdCount} OPD` : '',
                              ]
                                .filter(Boolean)
                                .join(', ')}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="text-slate-500">
                          Last: {formatShortDate(item.lastVisitDate)}
                        </span>
                      </div>

                      {item.topReasons.length > 0 && (
                        <div className="mt-1 pl-7 text-xs text-slate-500">
                          Recurring:{' '}
                          {item.topReasons
                            .map((r) => `${r.label.split(' / ')[0]} (${r.count})`)
                            .join(' · ')}
                        </div>
                      )}
                    </div>

                    {onSelectStudent && (
                      <button
                        type="button"
                        onClick={() => onSelectStudent(item.student)}
                        className="h-8 px-2.5 text-xs font-medium text-teal-800 hover:text-teal-950 bg-teal-50/70 hover:bg-teal-100 border border-teal-200/70 rounded-lg inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      >
                        <span>Profile</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* PANEL 2: COMMON ISSUES / ILLNESSES */}
        {(activeView === 'both' || activeView === 'issues') && (
          <section className="bg-white rounded-xl border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Activity className="w-4 h-4 text-teal-700 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-slate-900 truncate">
                    Common Issues &amp; Illnesses
                  </h2>
                  <p className="text-[11.5px] text-slate-500">
                    Clustered symptoms &amp; class-wise spread to spot outbreaks early
                  </p>
                </div>
              </div>
              <span className="text-xs tabular-nums text-slate-500 shrink-0">
                {commonIssues.length} {commonIssues.length === 1 ? 'category' : 'categories'}
              </span>
            </div>

            {commonIssues.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Activity className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">
                  No health complaints recorded in this timeframe.
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Once student visits are logged, recurring complaints and classroom clusters appear here automatically.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
                {commonIssues.map((issue) => {
                  const isExpanded = expandedIssueKey === issue.issueKey;
                  const barPct = Math.max(8, Math.round((issue.totalCases / maxIssueCount) * 100));
                  const hasClusterAlert =
                    issue.recent7dCount >= 3 ||
                    issue.classBreakdown.some((c) => c.count >= 3);

                  return (
                    <div key={issue.issueKey} className="transition-colors">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedIssueKey(isExpanded ? null : issue.issueKey)
                        }
                        className="w-full px-4 py-3.5 text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13.5px] font-semibold text-slate-900">
                                {issue.label}
                              </span>
                              {hasClusterAlert && (
                                <span className="text-[11.5px] font-semibold text-amber-700">
                                  · Cluster Watch
                                </span>
                              )}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
                              <span className="tabular-nums font-semibold text-slate-900">
                                {issue.totalCases} {issue.totalCases === 1 ? 'case' : 'cases'}
                              </span>
                              <span aria-hidden="true" className="text-slate-300">·</span>
                              <span className="tabular-nums">
                                {issue.uniqueStudentCount}{' '}
                                {issue.uniqueStudentCount === 1 ? 'student' : 'students'}
                              </span>
                              {issue.recent7dCount > 0 && (
                                <>
                                  <span aria-hidden="true" className="text-slate-300">·</span>
                                  <span className="text-teal-800 font-medium tabular-nums">
                                    {issue.recent7dCount} in last 7d
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Proportional Frequency Bar */}
                            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  hasClusterAlert ? 'bg-amber-600' : 'bg-teal-700'
                                }`}
                                style={{ width: `${barPct}%` }}
                              />
                            </div>

                            {/* Class-wise Spread */}
                            <div className="mt-1.5 text-[11.5px] text-slate-500">
                              Classes:{' '}
                              {issue.classBreakdown
                                .slice(0, 5)
                                .map((c) => `${c.section} (${c.count})`)
                                .join(' · ')}
                              {issue.classBreakdown.length > 5
                                ? ` · +${issue.classBreakdown.length - 5} more`
                                : ''}
                            </div>
                          </div>

                          <span className="text-slate-400 mt-0.5 shrink-0">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </span>
                        </div>
                      </button>

                      {/* Expandable Affected Students List */}
                      {isExpanded && (
                        <div className="px-4 pb-3.5 pt-1 bg-slate-50/70 border-t border-slate-100 space-y-1.5">
                          <div className="text-[11px] font-semibold text-slate-500 py-1">
                            Affected Students ({issue.affectedStudents.length})
                          </div>
                          <div className="divide-y divide-slate-200/60 bg-white rounded-lg border border-slate-200/80 overflow-hidden">
                            {issue.affectedStudents.map((entry) => (
                              <div
                                key={entry.student.student_id}
                                className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-slate-900">
                                      {entry.student.full_name}
                                    </span>
                                    <span className="text-slate-500">
                                      {entry.student.section} · Roll {entry.student.roll_number}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                    <span className="tabular-nums font-medium text-slate-700">
                                      {entry.count}×
                                    </span>{' '}
                                    · Last {formatShortDate(entry.lastDate)}
                                    {entry.sampleReasons.length > 0
                                      ? ` · ${entry.sampleReasons.join(', ')}`
                                      : ''}
                                  </div>
                                </div>

                                {onSelectStudent && (
                                  <button
                                    type="button"
                                    onClick={() => onSelectStudent(entry.student)}
                                    className="px-2 py-1 text-[11px] font-medium text-teal-800 hover:text-teal-950 hover:bg-teal-50 rounded-md inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
                                  >
                                    <span>View</span>
                                    <ArrowUpRight className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
