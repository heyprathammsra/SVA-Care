import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Printer,
  X,
  FileCheck2,
  Download,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Smartphone,
  FileText,
  AlertCircle,
  Clock,
  User,
  ShieldCheck,
  Pill,
} from 'lucide-react';
import {
  formatMedicineDisplay,
  formatTimeFromDatetime,
  extractDatePart,
  type StudentRecord,
  type VisitRecord,
  type DailyLogEntry,
  type HealthProfileRecord,
  type MeasurementRecord,
} from '../utils/nurseLogic';
import {
  SCHOOL_NAME,
  SCHOOL_LOGO_URL,
  SCHOOL_LOGO_FALLBACK_URL,
  DEFAULT_STAFF_NAME,
} from '../utils/seedData';

export type PrintReportConfig =
  | {
      type: 'daily-log';
      date: string;
      entries: DailyLogEntry[];
      staffName?: string;
      nurseName?: string;
    }
  | {
      type: 'student-history';
      student: StudentRecord;
      visits: VisitRecord[];
      healthProfiles: HealthProfileRecord[];
      latestMeasurement?: MeasurementRecord;
      startDate?: string;
      endDate?: string;
      staffName?: string;
      nurseName?: string;
    }
  | {
      type: 'single-visit';
      student: StudentRecord;
      visit: VisitRecord;
      staffName?: string;
      nurseName?: string;
    };

interface PrintableReportProps {
  config: PrintReportConfig;
  onClose: () => void;
}

export const PrintableReport: React.FC<PrintableReportProps> = ({ config, onClose }) => {
  const staffName = config.staffName || config.nurseName || DEFAULT_STAFF_NAME;
  const todayIso = new Date().toISOString().slice(0, 10);

  // View mode: 'a4-paper' (True scaled A4 sheet) or 'mobile-cards' (Touch-friendly card list)
  const [viewMode, setViewMode] = useState<'a4-paper' | 'mobile-cards'>('a4-paper');
  const [scale, setScale] = useState<number>(1);
  const [fitScale, setFitScale] = useState<number>(1);
  const [isAutoFit, setIsAutoFit] = useState<boolean>(true);
  const [sheetHeight, setSheetHeight] = useState<number>(1123);
  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'success' | 'warn' } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Compute title & filename
  const { docTitle, defaultFilename } = useMemo(() => {
    if (config.type === 'daily-log') {
      return {
        docTitle: `Daily Student Visit Log — ${config.date}`,
        defaultFilename: `Infirmary-Daily-Log-${config.date}.html`,
      };
    }
    if (config.type === 'student-history') {
      const sanitizedName = config.student.full_name.replace(/[^a-zA-Z0-9]/g, '_');
      return {
        docTitle: `Health & Visit Record — ${config.student.full_name}`,
        defaultFilename: `Health-History-${sanitizedName}-${config.student.roll_number}.html`,
      };
    }
    const sanitizedName = config.student.full_name.replace(/[^a-zA-Z0-9]/g, '_');
    return {
      docTitle: `Infirmary Visit Slip — ${config.student.full_name}`,
      defaultFilename: `Visit-Slip-${sanitizedName}-${config.visit.visit_id}.html`,
    };
  }, [config]);

  // Responsive A4 Fit Calculation: 794px is standard A4 portrait width at 96 DPI
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const availableWidth = containerRef.current.clientWidth - 24; // 12px margin each side
      if (availableWidth <= 0) return;

      const calculatedFit = Math.min(1, Math.max(0.35, availableWidth / 794));
      setFitScale(calculatedFit);

      if (isAutoFit) {
        setScale(calculatedFit);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isAutoFit]);

  // Measure natural height of unscaled A4 sheet
  useEffect(() => {
    if (!sheetRef.current) return;
    const updateHeight = () => {
      if (sheetRef.current) {
        const h = sheetRef.current.offsetHeight;
        if (h > 0) setSheetHeight(h);
      }
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(sheetRef.current);
    return () => observer.disconnect();
  }, [config, viewMode]);

  // Zoom controls
  const handleZoomIn = () => {
    setIsAutoFit(false);
    setScale((prev) => Math.min(1.5, Math.round((prev + 0.15) * 100) / 100));
  };

  const handleZoomOut = () => {
    setIsAutoFit(false);
    setScale((prev) => Math.max(0.35, Math.round((prev - 0.15) * 100) / 100));
  };

  const handleFitPage = () => {
    setIsAutoFit(true);
    setScale(fitScale);
  };

  const handleZoom100 = () => {
    setIsAutoFit(false);
    setScale(1);
  };

  // Robust Print Handler
  const handlePrint = () => {
    setIsPrinting(true);
    setNotification({
      message: 'Triggering print dialog... If your browser/preview blocks it, tap "Download A4" below.',
      type: 'info',
    });

    try {
      window.print();
      setTimeout(() => {
        setIsPrinting(false);
      }, 1200);
    } catch (err) {
      console.warn('System window.print failed:', err);
      setIsPrinting(false);
      setNotification({
        message: 'Direct print was restricted by the browser preview. Please tap "Download A4" to save or print!',
        type: 'warn',
      });
    }
  };

  // Standalone Printable HTML Downloader
  const handleDownloadStandaloneHtml = () => {
    try {
      const htmlString = generateStandaloneHtml(config, staffName, todayIso);
      const blob = new Blob([htmlString], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setNotification({
        message: `Downloaded "${defaultFilename}"! Open it in any browser or files app to print or save as PDF.`,
        type: 'success',
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      console.error('Download error:', err);
      setNotification({
        message: 'Could not download file. Please try the print button or copy summary.',
        type: 'warn',
      });
    }
  };

  // Copy Plain Text Summary
  const handleCopySummary = () => {
    const text = generateTextSummary(config, staffName, todayIso);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setNotification({
        message: 'Summary copied to clipboard! Ready to paste in WhatsApp or Email.',
        type: 'success',
      });
      setTimeout(() => {
        setCopied(false);
        setNotification(null);
      }, 3500);
    });
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-[#F6F5F3] py-3 sm:py-6 px-2 sm:px-4 text-zinc-900 print:bg-white print:p-0"
    >
      {/* SCREEN-ONLY TOOLBAR */}
      <div className="no-print max-w-4xl mx-auto mb-4 space-y-2.5">
        {/* Top bar: Title + Primary Actions */}
        <div className="bg-white border border-stone-200/90 rounded-2xl p-3 sm:p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 flex items-center justify-center shrink-0">
              <FileCheck2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-zinc-900 font-display truncate">
                  A4 Print Preview
                </h1>
                <span className="hidden xs:inline-block px-2 py-0.5 text-[10px] font-mono font-semibold text-teal-800 bg-teal-50 border border-teal-200/60 rounded-md">
                  A4 Portrait
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-zinc-500 truncate mt-0.5">
                {docTitle}
              </p>
            </div>
          </div>

          {/* Action Button Group */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 text-xs font-semibold text-zinc-700 bg-stone-100 hover:bg-stone-200 active:bg-stone-300 rounded-xl transition-colors flex items-center gap-1.5 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>

            <button
              type="button"
              onClick={handleCopySummary}
              title="Copy text summary to clipboard"
              className="h-9 px-3 text-xs font-semibold text-zinc-700 bg-white border border-stone-200 hover:bg-stone-50 active:bg-stone-100 rounded-xl transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5 text-zinc-500" />}
              <span className="hidden xs:inline">{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadStandaloneHtml}
              title="Download standalone A4 document for offline printing or PDF save"
              className="h-9 px-3 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100/80 border border-teal-200 active:bg-teal-200/80 rounded-xl transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-teal-700" />
              <span>Download A4</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="h-9 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 active:bg-black rounded-xl transition-colors flex items-center gap-1.5 shrink-0 shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
          </div>
        </div>

        {/* View Mode & Zoom Controls Toolbar */}
        <div className="bg-white border border-stone-200/90 rounded-xl px-3 py-2 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
          {/* View mode segmented switcher */}
          <div className="inline-flex items-center bg-stone-100 p-0.5 rounded-lg text-xs font-medium text-zinc-600">
            <button
              type="button"
              onClick={() => setViewMode('a4-paper')}
              className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                viewMode === 'a4-paper'
                  ? 'bg-white text-zinc-900 font-bold shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-teal-700" />
              <span>A4 Paper View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('mobile-cards')}
              className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                viewMode === 'mobile-cards'
                  ? 'bg-white text-zinc-900 font-bold shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-teal-700" />
              <span>Mobile Cards</span>
            </button>
          </div>

          {/* Paper Zoom Controls (Active in A4 paper mode) */}
          {viewMode === 'a4-paper' && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[11px] font-mono text-zinc-500 mr-1 hidden xs:inline">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomOut}
                aria-label="Zoom out"
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-stone-50 border border-stone-200 hover:bg-stone-100 active:bg-stone-200 text-zinc-600"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleFitPage}
                title="Fit full page to phone screen"
                className={`px-2.5 h-7 rounded-lg text-[11px] font-semibold border transition-colors flex items-center gap-1 ${
                  isAutoFit
                    ? 'bg-teal-50 border-teal-300 text-teal-800'
                    : 'bg-stone-50 border-stone-200 text-zinc-700 hover:bg-stone-100'
                }`}
              >
                <Maximize2 className="w-3 h-3" />
                <span>Fit Page</span>
              </button>
              <button
                type="button"
                onClick={handleZoom100}
                title="View actual 100% size"
                className={`px-2 h-7 rounded-lg text-[11px] font-semibold border transition-colors ${
                  !isAutoFit && scale === 1
                    ? 'bg-teal-50 border-teal-300 text-teal-800'
                    : 'bg-stone-50 border-stone-200 text-zinc-700 hover:bg-stone-100'
                }`}
              >
                100%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                aria-label="Zoom in"
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-stone-50 border border-stone-200 hover:bg-stone-100 active:bg-stone-200 text-zinc-600"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Notification / Helper Banner */}
        {notification && (
          <div
            className={`px-3.5 py-2.5 rounded-xl border text-xs flex items-start gap-2.5 transition-all ${
              notification.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : notification.type === 'warn'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-sky-50 border-sky-200 text-sky-900'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">{notification.message}</div>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="text-current opacity-70 hover:opacity-100 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* VIEW MODE 1: AUTHENTIC A4 PAPER PREVIEW (SCALED TO FIT MOBILE WITH 100% FIDELITY) */}
      {viewMode === 'a4-paper' && (
        <div className="w-full flex justify-center overflow-x-auto print:overflow-visible print:w-full print:block pb-12 sm:pb-8">
          {/* Scaled paper container: exact pixel dimensions when scaled */}
          <div
            style={{
              width: `${Math.round(794 * scale)}px`,
              height: sheetHeight ? `${Math.round(sheetHeight * scale)}px` : 'auto',
              position: 'relative',
              overflow: 'hidden',
              margin: '0 auto',
            }}
            className="print-scaled-container print:!w-full print:!h-auto print:!overflow-visible print:!static"
          >
            <div
              ref={sheetRef}
              data-testid="printable-a4-sheet"
              style={{
                width: '794px',
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                position: 'absolute',
                top: 0,
                left: 0,
              }}
              className="print-sheet bg-white border border-stone-300 sm:border-stone-200/90 rounded-none sm:rounded-lg p-6 sm:p-10 text-zinc-900 shadow-[0_12px_45px_rgba(0,0,0,0.08)] print:!shadow-none print:!border-none print:!p-0 print:!transform-none print:!w-full print:!static"
            >
              {/* OFFICIAL SCHOOL LETTERHEAD */}
              <div className="border-b-2 border-zinc-900 pb-3.5 mb-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <img
                    src={SCHOOL_LOGO_URL}
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (target.src !== SCHOOL_LOGO_FALLBACK_URL) {
                        target.src = SCHOOL_LOGO_FALLBACK_URL;
                      }
                    }}
                    alt={`${SCHOOL_NAME} logo`}
                    className="h-14 w-auto object-contain shrink-0"
                  />
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-zinc-900 font-display leading-tight">
                      {SCHOOL_NAME}
                    </h1>
                    <p className="text-xs text-zinc-600 mt-0.5 font-medium">
                      School Infirmary &amp; Student Health Department
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs font-mono tabular-nums text-zinc-600 shrink-0">
                  <div className="font-semibold text-zinc-900">Official Health Record</div>
                  <div>Generated: {todayIso}</div>
                </div>
              </div>

              {/* REPORT TYPE 1: DAILY STUDENT VISIT LOG */}
              {config.type === 'daily-log' && (
                <div>
                  <div className="mb-4 bg-zinc-50 border border-zinc-200 px-4 py-2.5 flex items-baseline justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-zinc-900 font-display uppercase tracking-wide">
                        Daily Student Infirmary Log
                      </h2>
                      <p className="text-xs text-zinc-600">
                        Chronological infirmary attendance register
                      </p>
                    </div>
                    <div className="flex items-center gap-5 text-xs font-mono tabular-nums">
                      <div>
                        <span className="text-zinc-500">Log Date: </span>
                        <strong className="text-zinc-900">{config.date}</strong>
                      </div>
                      <div>
                        <span className="text-zinc-500">Total Visits: </span>
                        <strong className="text-zinc-900">{config.entries.length}</strong>
                      </div>
                    </div>
                  </div>

                  {config.entries.length === 0 ? (
                    <div className="border border-zinc-300 py-12 text-center text-sm text-zinc-500">
                      No student visits recorded for {config.date}.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse border border-zinc-300 text-xs">
                      <thead>
                        <tr className="bg-zinc-100 border-b border-zinc-300 text-zinc-800">
                          <th className="py-2 px-2 border-r border-zinc-300 font-semibold w-9 text-center">#</th>
                          <th className="py-2 px-2.5 border-r border-zinc-300 font-semibold w-20">Time</th>
                          <th className="py-2 px-2.5 border-r border-zinc-300 font-semibold w-40">Student Name</th>
                          <th className="py-2 px-2.5 border-r border-zinc-300 font-semibold w-28">Section / Roll</th>
                          <th className="py-2 px-2.5 border-r border-zinc-300 font-semibold">Reason &amp; Observations</th>
                          <th className="py-2 px-2.5 border-r border-zinc-300 font-semibold">Action Taken</th>
                          <th className="py-2 px-2.5 font-semibold w-36">Medicine Given</th>
                        </tr>
                      </thead>
                      <tbody>
                        {config.entries.map((entry) => (
                          <tr key={entry.visit.visit_id} className="border-b border-zinc-300 align-top">
                            <td className="py-2 px-2 border-r border-zinc-300 font-mono tabular-nums text-center text-zinc-600">
                              {entry.visitNumber}
                            </td>
                            <td className="py-2 px-2.5 border-r border-zinc-300 font-mono tabular-nums whitespace-nowrap text-zinc-700">
                              {entry.visitTimeFormatted}
                            </td>
                            <td className="py-2 px-2.5 border-r border-zinc-300 font-semibold text-zinc-900">
                              <div>{entry.student.full_name}</div>
                              <div className="text-[10px] font-mono text-zinc-400 font-normal">
                                {entry.student.student_id}
                              </div>
                            </td>
                            <td className="py-2 px-2.5 border-r border-zinc-300 font-mono tabular-nums whitespace-nowrap text-zinc-700">
                              {entry.student.section} · #{entry.student.roll_number}
                            </td>
                            <td className="py-2 px-2.5 border-r border-zinc-300">
                              <div className="font-semibold text-zinc-900">{entry.visit.reason}</div>
                              {entry.visit.observations && (
                                <div className="text-[11px] text-zinc-600 mt-0.5">
                                  Obs: {entry.visit.observations}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2.5 border-r border-zinc-300 text-zinc-800">
                              <div>{entry.visit.action_taken}</div>
                              {entry.visit.notes && (
                                <div className="text-[11px] text-zinc-500 mt-0.5">
                                  Note: {entry.visit.notes}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2.5 text-zinc-900 font-medium">
                              {entry.medicineSummary}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* REPORT TYPE 2: STUDENT HEALTH & VISIT HISTORY */}
              {config.type === 'student-history' && (
                <div>
                  <div className="mb-4 bg-zinc-50 border border-zinc-200 px-4 py-3">
                    <div className="flex items-baseline justify-between border-b border-zinc-200 pb-2 mb-2.5">
                      <h2 className="text-sm font-bold text-zinc-900 font-display uppercase tracking-wide">
                        {config.startDate || config.endDate
                          ? `Student Health History (${config.startDate || 'Start'} to ${config.endDate || 'Present'})`
                          : 'Complete Student Health & Infirmary History'}
                      </h2>
                      <span className="text-xs font-mono tabular-nums text-zinc-600">
                        Total Visits: <strong>{config.visits.length}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-zinc-500 block">Student Name</span>
                        <span className="font-bold text-zinc-900">{config.student.full_name}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Permanent ID</span>
                        <span className="font-mono tabular-nums font-medium text-zinc-800">
                          {config.student.student_id}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Class &amp; Roll Number</span>
                        <span className="font-mono tabular-nums font-medium text-zinc-800">
                          {config.student.section} · Roll #{config.student.roll_number}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Latest Height / Weight</span>
                        <span className="font-mono tabular-nums font-medium text-zinc-800">
                          {config.latestMeasurement
                            ? `${config.latestMeasurement.height_cm} cm / ${config.latestMeasurement.weight_kg} kg`
                            : 'Not recorded'}
                        </span>
                      </div>
                    </div>

                    {config.healthProfiles.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-zinc-200 text-xs">
                        <span className="text-zinc-500 font-medium">Medical Profile / Alerts: </span>
                        <span className="text-zinc-800 font-semibold">
                          {config.healthProfiles.map((h) => `${h.condition_or_note} (${h.status})`).join('; ')}
                        </span>
                      </div>
                    )}
                  </div>

                  {config.visits.length === 0 ? (
                    <div className="border border-zinc-300 py-10 text-center text-xs text-zinc-500">
                      No visits recorded for this student in the selected period.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse border border-zinc-300 text-xs">
                      <thead>
                        <tr className="bg-zinc-100 border-b border-zinc-300 text-zinc-800">
                          <th className="py-2 px-2.5 border-r border-zinc-300 font-semibold w-28">Date &amp; Time</th>
                          <th className="py-2 px-2.5 border-r border-zinc-300 font-semibold">Reason &amp; Observations</th>
                          <th className="py-2 px-2.5 border-r border-zinc-300 font-semibold">Action Taken / Resolution</th>
                          <th className="py-2 px-2.5 font-semibold w-40">Medicine Given</th>
                        </tr>
                      </thead>
                      <tbody>
                        {config.visits.map((v) => (
                          <tr key={v.visit_id} className="border-b border-zinc-300 align-top">
                            <td className="py-2 px-2.5 border-r border-zinc-300 font-mono tabular-nums whitespace-nowrap text-zinc-700">
                              <div className="font-semibold text-zinc-900">{extractDatePart(v.visit_datetime)}</div>
                              <div className="text-zinc-500">{formatTimeFromDatetime(v.visit_datetime)}</div>
                            </td>
                            <td className="py-2 px-2.5 border-r border-zinc-300">
                              <div className="font-semibold text-zinc-900">{v.reason}</div>
                              {v.observations && (
                                <div className="text-zinc-600 mt-0.5">Obs: {v.observations}</div>
                              )}
                            </td>
                            <td className="py-2 px-2.5 border-r border-zinc-300 text-zinc-800">
                              <div>{v.action_taken}</div>
                              {v.notes && <div className="text-zinc-500 mt-0.5">Note: {v.notes}</div>}
                            </td>
                            <td className="py-2 px-2.5 font-medium text-zinc-900">
                              {formatMedicineDisplay(v)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* REPORT TYPE 3: SINGLE VISIT SLIP */}
              {config.type === 'single-visit' && (
                <div>
                  <div className="mb-4 bg-zinc-50 border border-zinc-200 px-4 py-2.5 flex items-baseline justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-zinc-900 font-display uppercase tracking-wide">
                        Individual Student Infirmary Visit Slip
                      </h2>
                      <p className="text-xs text-zinc-600">
                        Visit ID: <span className="font-mono font-medium">{config.visit.visit_id}</span>
                      </p>
                    </div>
                    <div className="text-xs font-mono tabular-nums">
                      Date: <strong>{extractDatePart(config.visit.visit_datetime)}</strong> · Time:{' '}
                      <strong>{formatTimeFromDatetime(config.visit.visit_datetime)}</strong>
                    </div>
                  </div>

                  <div className="border border-zinc-300 divide-y divide-zinc-300 text-xs">
                    {/* Patient identity strip: 3 equal columns */}
                    <div className="grid grid-cols-3 divide-x divide-zinc-300">
                      <div className="p-3">
                        <span className="text-zinc-500 block text-[11px]">Student Full Name</span>
                        <span className="font-bold text-sm text-zinc-900">{config.student.full_name}</span>
                      </div>
                      <div className="p-3">
                        <span className="text-zinc-500 block text-[11px]">Class &amp; Roll Number</span>
                        <span className="font-mono font-bold text-sm text-zinc-900">
                          {config.student.section} · Roll #{config.student.roll_number}
                        </span>
                      </div>
                      <div className="p-3">
                        <span className="text-zinc-500 block text-[11px]">Permanent Student ID</span>
                        <span className="font-mono font-semibold text-sm text-zinc-700">
                          {config.student.student_id}
                        </span>
                      </div>
                    </div>

                    <div className="p-3">
                      <span className="text-zinc-500 block text-[11px] mb-0.5">Reason for Visit / Reported Issue</span>
                      <p className="font-bold text-zinc-900 text-sm">{config.visit.reason}</p>
                    </div>

                    <div className="p-3">
                      <span className="text-zinc-500 block text-[11px] mb-0.5">Clinical Observations</span>
                      <p className="text-zinc-800">{config.visit.observations || 'None recorded'}</p>
                    </div>

                    <div className="p-3">
                      <span className="text-zinc-500 block text-[11px] mb-0.5">Care Provided / Action Taken</span>
                      <p className="text-zinc-900 font-semibold">{config.visit.action_taken}</p>
                    </div>

                    <div className="p-3">
                      <span className="text-zinc-500 block text-[11px] mb-0.5">Medication Administered</span>
                      <p className="font-bold text-zinc-900">{formatMedicineDisplay(config.visit)}</p>
                    </div>

                    {config.visit.notes && (
                      <div className="p-3">
                        <span className="text-zinc-500 block text-[11px] mb-0.5">Additional Clinical Notes</span>
                        <p className="text-zinc-700">{config.visit.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* OFFICIAL SIGN-OFF & STAMP FOOTER */}
              <div className="mt-10 pt-5 border-t border-zinc-300 flex items-start justify-between gap-8 text-xs">
                <div className="w-[210px]">
                  <p className="font-bold text-zinc-800 mb-10">Staff In-Charge Signature:</p>
                  <div className="border-b border-zinc-400 w-full mb-1.5"></div>
                  <p className="text-zinc-500 text-[11px]">Signature &amp; Name</p>
                </div>
                <div className="w-[210px]">
                  <p className="font-bold text-zinc-800 mb-10">Principal Signature:</p>
                  <div className="border-b border-zinc-400 w-full mb-1.5"></div>
                  <p className="text-zinc-500 text-[11px]">Signature &amp; Date</p>
                </div>
              </div>

              {/* CONFIDENTIAL HEALTH RECORD WATERMARK FOOTER */}
              <div className="mt-8 pt-3 border-t border-zinc-200 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                <span>{SCHOOL_NAME} · Confidential Student Health Record</span>
                <span>Page 1 of 1 · Valid with official signature</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: RESPONSIVE MOBILE CARDS VIEW (CLEAN TOUCH CARDS FOR PHONE READING) */}
      {viewMode === 'mobile-cards' && (
        <div className="max-w-2xl mx-auto space-y-3 pb-16">
          {config.type === 'daily-log' && (
            <>
              <div className="bg-white border border-stone-200 rounded-xl p-3 shadow-2xs flex items-center justify-between text-xs">
                <span className="text-zinc-500">
                  Date: <strong className="text-zinc-900">{config.date}</strong>
                </span>
                <span className="text-zinc-500">
                  Total Visits: <strong className="text-teal-800">{config.entries.length}</strong>
                </span>
              </div>

              {config.entries.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-xs text-zinc-500">
                  No student visits recorded for {config.date}.
                </div>
              ) : (
                config.entries.map((entry) => (
                  <div
                    key={entry.visit.visit_id}
                    className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-sm space-y-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-stone-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 font-mono font-bold text-xs flex items-center justify-center">
                          {entry.visitNumber}
                        </span>
                        <div>
                          <h3 className="font-bold text-zinc-900 text-sm">
                            {entry.student.full_name}
                          </h3>
                          <p className="text-[11px] font-mono text-zinc-500">
                            {entry.student.section} · Roll #{entry.student.roll_number}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-semibold text-zinc-700 bg-stone-100 px-2 py-0.5 rounded-md">
                        {entry.visitTimeFormatted}
                      </span>
                    </div>

                    <div className="space-y-1.5 pt-0.5">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                          Reason for Visit
                        </span>
                        <p className="font-semibold text-zinc-900 mt-0.5">{entry.visit.reason}</p>
                        {entry.visit.observations && (
                          <p className="text-zinc-600 text-[11px] mt-0.5">
                            Obs: {entry.visit.observations}
                          </p>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                          Action Taken
                        </span>
                        <p className="text-zinc-800 mt-0.5">{entry.visit.action_taken}</p>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                          Medication
                        </span>
                        <p className="font-medium text-teal-900 bg-teal-50/70 border border-teal-200/60 rounded-lg px-2 py-1 mt-0.5">
                          {entry.medicineSummary}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {config.type === 'student-history' && (
            <>
              <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                  <h3 className="text-base font-bold text-zinc-900">{config.student.full_name}</h3>
                  <span className="font-mono text-zinc-600">
                    {config.student.section} · #{config.student.roll_number}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="text-zinc-400 block">Permanent ID</span>
                    <span className="font-mono font-medium text-zinc-800">{config.student.student_id}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Latest Height / Weight</span>
                    <span className="font-mono font-medium text-zinc-800">
                      {config.latestMeasurement
                        ? `${config.latestMeasurement.height_cm}cm / ${config.latestMeasurement.weight_kg}kg`
                        : 'Not recorded'}
                    </span>
                  </div>
                </div>
              </div>

              {config.visits.map((v) => (
                <div
                  key={v.visit_id}
                  className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-sm space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                    <span className="font-mono font-bold text-zinc-800">
                      {extractDatePart(v.visit_datetime)}
                    </span>
                    <span className="font-mono text-zinc-500">
                      {formatTimeFromDatetime(v.visit_datetime)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                      Reason
                    </span>
                    <p className="font-semibold text-zinc-900 mt-0.5">{v.reason}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                      Action
                    </span>
                    <p className="text-zinc-800 mt-0.5">{v.action_taken}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                      Medicine
                    </span>
                    <p className="font-medium text-teal-900 bg-teal-50/70 border border-teal-200/60 rounded-lg px-2 py-1 mt-0.5">
                      {formatMedicineDisplay(v)}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}

          {config.type === 'single-visit' && (
            <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-3 text-xs">
              <div className="border-b border-stone-100 pb-2.5">
                <span className="text-[10px] uppercase font-bold text-teal-700 block tracking-wider">
                  Infirmary Visit Record
                </span>
                <h3 className="text-base font-bold text-zinc-900 mt-0.5">
                  {config.student.full_name}
                </h3>
                <p className="text-zinc-500 font-mono text-[11px] mt-0.5">
                  {config.student.section} · Roll #{config.student.roll_number} · {config.student.student_id}
                </p>
              </div>

              <div className="space-y-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                    Date &amp; Time
                  </span>
                  <p className="font-mono font-semibold text-zinc-800 mt-0.5">
                    {extractDatePart(config.visit.visit_datetime)} at {formatTimeFromDatetime(config.visit.visit_datetime)}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                    Reason for Visit
                  </span>
                  <p className="font-bold text-zinc-900 mt-0.5">{config.visit.reason}</p>
                  {config.visit.observations && (
                    <p className="text-zinc-600 text-[11px] mt-0.5">
                      Obs: {config.visit.observations}
                    </p>
                  )}
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                    Care Provided
                  </span>
                  <p className="text-zinc-800 mt-0.5">{config.visit.action_taken}</p>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                    Medication Given
                  </span>
                  <p className="font-medium text-teal-900 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1.5 mt-0.5">
                    {formatMedicineDisplay(config.visit)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Standalone Printable HTML Generator (Embeds complete CSS and auto-print trigger)
function generateStandaloneHtml(
  config: PrintReportConfig,
  staffName: string,
  todayIso: string
): string {
  let reportBody = '';

  if (config.type === 'daily-log') {
    const rows = config.entries
      .map(
        (e) => `
      <tr>
        <td style="text-align: center; font-family: monospace;">${e.visitNumber}</td>
        <td style="font-family: monospace; white-space: nowrap;">${e.visitTimeFormatted}</td>
        <td><strong>${escapeHtml(e.student.full_name)}</strong><br><small style="color: #71717a; font-family: monospace;">${e.student.student_id}</small></td>
        <td style="font-family: monospace; white-space: nowrap;">${escapeHtml(e.student.section)} · #${escapeHtml(e.student.roll_number)}</td>
        <td><strong>${escapeHtml(e.visit.reason)}</strong>${e.visit.observations ? `<br><small style="color: #52525b;">Obs: ${escapeHtml(e.visit.observations)}</small>` : ''}</td>
        <td>${escapeHtml(e.visit.action_taken)}${e.visit.notes ? `<br><small style="color: #71717a;">Note: ${escapeHtml(e.visit.notes)}</small>` : ''}</td>
        <td>${escapeHtml(e.medicineSummary)}</td>
      </tr>
    `
      )
      .join('');

    reportBody = `
      <div style="background: #f4f4f5; border: 1px solid #e4e4e7; padding: 10px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: baseline;">
        <div>
          <h2 style="margin: 0; font-size: 14px; font-weight: bold; text-transform: uppercase;">Daily Student Infirmary Log</h2>
          <div style="font-size: 11px; color: #52525b; margin-top: 2px;">Chronological infirmary attendance register</div>
        </div>
        <div style="font-size: 11px; font-family: monospace;">
          Log Date: <strong>${config.date}</strong> &nbsp;·&nbsp; Total Visits: <strong>${config.entries.length}</strong>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 30px; text-align: center;">#</th>
            <th style="width: 75px;">Time</th>
            <th style="width: 140px;">Student Name</th>
            <th style="width: 100px;">Section / Roll</th>
            <th>Reason &amp; Observations</th>
            <th>Action Taken</th>
            <th style="width: 130px;">Medicine Given</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="7" style="text-align: center; padding: 24px;">No visits recorded.</td></tr>'}
        </tbody>
      </table>
    `;
  } else if (config.type === 'student-history') {
    const rows = config.visits
      .map(
        (v) => `
      <tr>
        <td style="font-family: monospace; white-space: nowrap;"><strong>${extractDatePart(v.visit_datetime)}</strong><br><small style="color: #71717a;">${formatTimeFromDatetime(v.visit_datetime)}</small></td>
        <td><strong>${escapeHtml(v.reason)}</strong>${v.observations ? `<br><small style="color: #52525b;">Obs: ${escapeHtml(v.observations)}</small>` : ''}</td>
        <td>${escapeHtml(v.action_taken)}${v.notes ? `<br><small style="color: #71717a;">Note: ${escapeHtml(v.notes)}</small>` : ''}</td>
        <td>${escapeHtml(formatMedicineDisplay(v))}</td>
      </tr>
    `
      )
      .join('');

    const titleText =
      config.startDate || config.endDate
        ? `Student Health History (${escapeHtml(config.startDate || 'Start')} to ${escapeHtml(config.endDate || 'Present')})`
        : 'Complete Student Health &amp; Visit Record';

    const alertsHtml =
      config.healthProfiles.length > 0
        ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e4e4e7; font-size: 11px;"><span style="color: #71717a;">Medical Profile / Alerts: </span><strong>${escapeHtml(
            config.healthProfiles.map((h) => `${h.condition_or_note} (${h.status})`).join('; ')
          )}</strong></div>`
        : '';

    reportBody = `
      <div style="background: #f4f4f5; border: 1px solid #e4e4e7; padding: 12px 14px; margin-bottom: 16px;">
        <div style="border-bottom: 1px solid #e4e4e7; padding-bottom: 8px; margin-bottom: 8px; display: flex; justify-content: space-between;">
          <h2 style="margin: 0; font-size: 14px; font-weight: bold; text-transform: uppercase;">${titleText}</h2>
          <span style="font-size: 11px; font-family: monospace;">Total Visits: <strong>${config.visits.length}</strong></span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 11px;">
          <div><span style="color: #71717a; display: block;">Student Name</span><strong>${escapeHtml(config.student.full_name)}</strong></div>
          <div><span style="color: #71717a; display: block;">Permanent ID</span><span style="font-family: monospace;">${config.student.student_id}</span></div>
          <div><span style="color: #71717a; display: block;">Section &amp; Roll</span><span style="font-family: monospace;">${escapeHtml(config.student.section)} · #${escapeHtml(config.student.roll_number)}</span></div>
          <div><span style="color: #71717a; display: block;">Latest Anthropometry</span><span style="font-family: monospace;">${config.latestMeasurement ? `${config.latestMeasurement.height_cm} cm / ${config.latestMeasurement.weight_kg} kg` : 'Not recorded'}</span></div>
        </div>
        ${alertsHtml}
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 100px;">Date &amp; Time</th>
            <th>Reason &amp; Observations</th>
            <th>Action Taken</th>
            <th style="width: 140px;">Medicine Given</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4" style="text-align: center; padding: 24px;">No visits recorded.</td></tr>'}
        </tbody>
      </table>
    `;
  } else {
    // Single visit slip
    reportBody = `
      <div style="background: #f4f4f5; border: 1px solid #e4e4e7; padding: 10px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: baseline;">
        <div>
          <h2 style="margin: 0; font-size: 14px; font-weight: bold; text-transform: uppercase;">Individual Student Infirmary Visit Slip</h2>
          <div style="font-size: 11px; color: #52525b;">Visit ID: <span style="font-family: monospace;">${config.visit.visit_id}</span></div>
        </div>
        <div style="font-size: 11px; font-family: monospace;">
          Date: <strong>${extractDatePart(config.visit.visit_datetime)}</strong> · Time: <strong>${formatTimeFromDatetime(config.visit.visit_datetime)}</strong>
        </div>
      </div>
      <div style="border: 1px solid #d4d4d8; font-size: 12px;">
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid #d4d4d8;">
          <div style="padding: 10px; border-right: 1px solid #d4d4d8;"><span style="color: #71717a; display: block; font-size: 10px;">Student Name</span><strong style="font-size: 13px;">${escapeHtml(config.student.full_name)}</strong></div>
          <div style="padding: 10px; border-right: 1px solid #d4d4d8;"><span style="color: #71717a; display: block; font-size: 10px;">Class &amp; Roll Number</span><strong style="font-family: monospace;">${escapeHtml(config.student.section)} · Roll #${escapeHtml(config.student.roll_number)}</strong></div>
          <div style="padding: 10px;"><span style="color: #71717a; display: block; font-size: 10px;">Permanent ID</span><span style="font-family: monospace;">${config.student.student_id}</span></div>
        </div>
        <div style="padding: 10px; border-bottom: 1px solid #d4d4d8;"><span style="color: #71717a; display: block; font-size: 10px;">Reason for Visit</span><strong>${escapeHtml(config.visit.reason)}</strong></div>
        <div style="padding: 10px; border-bottom: 1px solid #d4d4d8;"><span style="color: #71717a; display: block; font-size: 10px;">Observations</span>${escapeHtml(config.visit.observations || 'None recorded')}</div>
        <div style="padding: 10px; border-bottom: 1px solid #d4d4d8;"><span style="color: #71717a; display: block; font-size: 10px;">Care Provided</span><strong>${escapeHtml(config.visit.action_taken)}</strong></div>
        <div style="padding: 10px;"><span style="color: #71717a; display: block; font-size: 10px;">Medication Administered</span><strong>${escapeHtml(formatMedicineDisplay(config.visit))}</strong></div>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(SCHOOL_NAME)} — Infirmary Document</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm 8mm 10mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #18181b;
      background: #f4f4f5;
      margin: 0;
      padding: 10px;
      line-height: 1.35;
    }
    .screen-toolbar {
      max-width: 210mm;
      margin: 0 auto 16px auto;
      background: #18181b;
      color: #fff;
      padding: 12px 18px;
      border-radius: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .print-button {
      background: #0d9488;
      color: #fff;
      border: none;
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
    }
    .sheet {
      max-width: 210mm;
      margin: 0 auto;
      background: #fff;
      padding: 24px 28px;
      border: 1px solid #e4e4e7;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    th, td {
      border: 1px solid #d4d4d8;
      padding: 5px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f4f4f5;
      font-weight: 600;
      color: #27272a;
    }
    .letterhead {
      border-bottom: 2px solid #18181b;
      padding-bottom: 10px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .signatures {
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px solid #d4d4d8;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 32px;
      font-size: 11px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sign-box {
      width: 210px;
    }
    .sign-line {
      border-bottom: 1px solid #a1a1aa;
      width: 100%;
      margin-bottom: 4px;
    }
    @media print {
      body {
        background: #fff;
        padding: 0;
      }
      .screen-toolbar {
        display: none !important;
      }
      .sheet {
        border: none;
        box-shadow: none;
        padding: 0;
        max-width: 100%;
      }
      tr, .signatures {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  </style>
  <script>
    window.addEventListener('load', function() {
      // Small timeout to allow styles and fonts to render
      setTimeout(function() {
        try { window.print(); } catch(e){}
      }, 350);
    });
  </script>
</head>
<body>
  <div class="screen-toolbar">
    <div>
      <strong style="font-size: 14px;">${escapeHtml(SCHOOL_NAME)}</strong>
      <div style="font-size: 11px; color: #a1a1aa;">A4 Portrait Document · Tap print or Save as PDF</div>
    </div>
    <button class="print-button" onclick="window.print()">🖨️ Print / Save PDF</button>
  </div>

  <div class="sheet">
    <div class="letterhead">
      <div>
        <h1 style="margin: 0; font-size: 18px; font-weight: bold; letter-spacing: -0.02em;">${escapeHtml(SCHOOL_NAME)}</h1>
        <div style="font-size: 11px; color: #52525b; margin-top: 2px;">School Infirmary &amp; Student Health Department</div>
      </div>
      <div style="text-align: right; font-size: 11px; font-family: monospace; color: #52525b;">
        <div><strong>Official Health Document</strong></div>
        <div>Date: ${todayIso}</div>
      </div>
    </div>

    ${reportBody}

    <div class="signatures">
      <div class="sign-box">
        <div style="font-weight: 600; margin-bottom: 30px;">Staff In-Charge Signature:</div>
        <div class="sign-line"></div>
        <div style="color: #71717a; font-size: 11px;">Signature &amp; Name</div>
      </div>
      <div class="sign-box">
        <div style="font-weight: 600; margin-bottom: 30px;">Principal Signature:</div>
        <div class="sign-line"></div>
        <div style="color: #71717a; font-size: 11px;">Signature &amp; Date</div>
      </div>
    </div>

    <div style="margin-top: 24px; padding-top: 8px; border-top: 1px solid #e4e4e7; display: flex; justify-content: space-between; font-size: 10px; font-family: monospace; color: #a1a1aa;">
      <span>${escapeHtml(SCHOOL_NAME)} · Confidential Student Health Record</span>
      <span>Page 1 of 1</span>
    </div>
  </div>
</body>
</html>`;
}

// Format Plain Text Summary for Quick Copy
function generateTextSummary(
  config: PrintReportConfig,
  staffName: string,
  todayIso: string
): string {
  const header = `========================================================\n${SCHOOL_NAME}\nSCHOOL INFIRMARY & STUDENT HEALTH RECORD\nDate: ${todayIso}\n========================================================\n\n`;

  if (config.type === 'daily-log') {
    const list = config.entries
      .map(
        (e) =>
          `[#${e.visitNumber}] ${e.visitTimeFormatted} | ${e.student.full_name} (${e.student.section} #${e.student.roll_number})\n` +
          `  Reason: ${e.visit.reason}${e.visit.observations ? ` (Obs: ${e.visit.observations})` : ''}\n` +
          `  Action: ${e.visit.action_taken}\n` +
          `  Medicine: ${e.medicineSummary}\n`
      )
      .join('\n');
    return `${header}DAILY STUDENT VISIT LOG\nLog Date: ${config.date}\nTotal Visits: ${config.entries.length}\nRecorded by: ${staffName}\n\n${list || 'No visits recorded.'}\n`;
  }

  if (config.type === 'student-history') {
    const list = config.visits
      .map(
        (v) =>
          `• ${extractDatePart(v.visit_datetime)} ${formatTimeFromDatetime(v.visit_datetime)}:\n` +
          `  Reason: ${v.reason}\n` +
          `  Action: ${v.action_taken}\n` +
          `  Medicine: ${formatMedicineDisplay(v)}\n`
      )
      .join('\n');
    return `${header}STUDENT HEALTH RECORD: ${config.student.full_name}\nSection: ${config.student.section} · Roll #${config.student.roll_number} · ID: ${config.student.student_id}\nTotal Visits: ${config.visits.length}\n\n${list || 'No visits recorded.'}\n`;
  }

  // Single visit
  return (
    `${header}INDIVIDUAL VISIT SLIP\n` +
    `Student: ${config.student.full_name} (${config.student.section} #${config.student.roll_number})\n` +
    `Student ID: ${config.student.student_id}\n` +
    `Visit ID: ${config.visit.visit_id}\n` +
    `Time: ${extractDatePart(config.visit.visit_datetime)} at ${formatTimeFromDatetime(config.visit.visit_datetime)}\n` +
    `Reason: ${config.visit.reason}\n` +
    `Observations: ${config.visit.observations || 'None'}\n` +
    `Action Taken: ${config.visit.action_taken}\n` +
    `Medicine Administered: ${formatMedicineDisplay(config.visit)}\n` +
    `Recorded by: ${staffName}\n`
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
