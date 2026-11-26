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

import {
  downloadPrintReportPdf,
  getPrintReportPdfFilename,
  type PrintReportConfig,
} from '../utils/pdfExport';

export type { PrintReportConfig };

interface PrintableReportProps {
  config: PrintReportConfig;
  onClose: () => void;
}

// Standard A4 Portrait at 96 DPI: 794px × 1123px
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

interface PaginatedPage<T> {
  items: T[];
  showSignatures: boolean;
}

function estimateWrappedLines(text: string | undefined | null, charsPerLine: number): number {
  const clean = (text || '').trim();
  if (!clean) return 0;
  return clean.split(/\r?\n/).reduce((sum, seg) => {
    const trimmed = seg.trim();
    if (!trimmed) return sum + 1;
    return sum + Math.max(1, Math.ceil(trimmed.length / charsPerLine));
  }, 0);
}

function estimateDailyLogRowHeight(entry: DailyLogEntry): number {
  const nameLines = Math.max(1, estimateWrappedLines(entry.student.full_name, 19));
  const reasonLines = Math.max(1, estimateWrappedLines(entry.visit.reason, 21));
  const obsLines = entry.visit.observations
    ? estimateWrappedLines(`Obs: ${entry.visit.observations}`, 24)
    : 0;
  const actionLines = Math.max(1, estimateWrappedLines(entry.visit.action_taken, 19));
  const noteLines = entry.visit.notes
    ? estimateWrappedLines(`Note: ${entry.visit.notes}`, 22)
    : 0;
  const medLines = Math.max(1, estimateWrappedLines(entry.medicineSummary, 20));

  const maxLines = Math.max(
    nameLines,
    reasonLines + obsLines,
    actionLines + noteLines,
    medLines,
    1
  );
  // Compact 11px text with 1.35 line-height (~15px/line) + 14px vertical cell padding/border
  return Math.max(32, 16 + maxLines * 15);
}

function estimateStudentHistoryRowHeight(v: VisitRecord): number {
  const dateLines = 2;
  const reasonLines = Math.max(1, estimateWrappedLines(v.reason, 30));
  const obsLines = v.observations ? estimateWrappedLines(`Obs: ${v.observations}`, 32) : 0;
  const actionLines = Math.max(1, estimateWrappedLines(v.action_taken, 26));
  const noteLines = v.notes ? estimateWrappedLines(`Note: ${v.notes}`, 28) : 0;
  const medLines = Math.max(1, estimateWrappedLines(formatMedicineDisplay(v), 22));

  const maxLines = Math.max(
    dateLines,
    reasonLines + obsLines,
    actionLines + noteLines,
    medLines
  );
  return Math.max(36, 16 + maxLines * 15);
}

function paginateRows<T>(
  items: T[],
  estimateRowHeight: (item: T) => number,
  firstPageBudgetPx: number,
  nextPageBudgetPx: number,
  signatureHeightPx: number = 112
): PaginatedPage<T>[] {
  if (items.length === 0) {
    return [{ items: [], showSignatures: true }];
  }

  const pages: Array<{ items: T[]; usedHeight: number }> = [];
  let currentItems: T[] = [];
  let usedHeight = 0;

  for (const item of items) {
    const rowHeight = estimateRowHeight(item);
    const budget = pages.length === 0 ? firstPageBudgetPx : nextPageBudgetPx;

    if (currentItems.length > 0 && usedHeight + rowHeight > budget) {
      pages.push({ items: currentItems, usedHeight });
      currentItems = [item];
      usedHeight = rowHeight;
    } else {
      currentItems.push(item);
      usedHeight += rowHeight;
    }
  }

  if (currentItems.length > 0) {
    pages.push({ items: currentItems, usedHeight });
  }

  // Ensure signatures fit cleanly on the final page without overflowing A4 height
  const lastIdx = pages.length - 1;
  const lastBudget = lastIdx === 0 ? firstPageBudgetPx : nextPageBudgetPx;
  const lastPage = pages[lastIdx];

  if (lastPage.usedHeight + signatureHeightPx <= lastBudget) {
    return pages.map((p, idx) => ({
      items: p.items,
      showSignatures: idx === lastIdx,
    }));
  }

  // Move last 1-2 rows to a new final page if possible so the signature page also has rows
  if (lastPage.items.length > 2) {
    const moved = lastPage.items.splice(lastPage.items.length - 2, 2);
    pages.push({ items: moved, usedHeight: 0 });
  } else {
    pages.push({ items: [], usedHeight: 0 });
  }

  return pages.map((p, idx) => ({
    items: p.items,
    showSignatures: idx === pages.length - 1,
  }));
}

export const PrintableReport: React.FC<PrintableReportProps> = ({ config, onClose }) => {
  const staffName = config.staffName || config.nurseName || DEFAULT_STAFF_NAME;
  const todayIso = new Date().toISOString().slice(0, 10);

  // View mode: 'a4-paper' (Scrollable A4 sheets) or 'mobile-cards' (Touch-friendly card list)
  const [viewMode, setViewMode] = useState<'a4-paper' | 'mobile-cards'>('a4-paper');
  const [scale, setScale] = useState<number>(1);
  const [fitScale, setFitScale] = useState<number>(1);
  const [isAutoFit, setIsAutoFit] = useState<boolean>(true);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'info' | 'success' | 'warn';
  } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Compute paginated A4 sheets
  const dailyLogPages = useMemo(() => {
    if (config.type !== 'daily-log') return [];
    // Conservative pixel budgets inside 794×1123 A4 portrait sheet
    return paginateRows(config.entries, estimateDailyLogRowHeight, 775, 855, 112);
  }, [config]);

  const studentHistoryPages = useMemo(() => {
    if (config.type !== 'student-history') return [];
    const hasHealthProfile = config.healthProfiles.length > 0;
    return paginateRows(
      config.visits,
      estimateStudentHistoryRowHeight,
      hasHealthProfile ? 690 : 725,
      855,
      112
    );
  }, [config]);

  const totalPages = useMemo(() => {
    if (config.type === 'daily-log') return Math.max(1, dailyLogPages.length);
    if (config.type === 'student-history') return Math.max(1, studentHistoryPages.length);
    return 1;
  }, [config.type, dailyLogPages.length, studentHistoryPages.length]);

  // Compute title & filename
  const { docTitle, defaultFilename } = useMemo(() => {
    const filename = getPrintReportPdfFilename(config);
    if (config.type === 'daily-log') {
      return {
        docTitle: `Daily Student Visit Log — ${config.date}`,
        defaultFilename: filename,
      };
    }
    if (config.type === 'student-history') {
      return {
        docTitle: `Health & Visit Record — ${config.student.full_name}`,
        defaultFilename: filename,
      };
    }
    return {
      docTitle: `Infirmary Visit Slip — ${config.student.full_name}`,
      defaultFilename: filename,
    };
  }, [config]);

  // Responsive A4 Fit Calculation
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const availableWidth = containerRef.current.clientWidth - 24;
      if (availableWidth <= 0) return;

      const calculatedFit = Math.min(1, Math.max(0.35, availableWidth / A4_WIDTH_PX));
      setFitScale(calculatedFit);

      if (isAutoFit) {
        setScale(calculatedFit);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isAutoFit]);

  // Allow closing Print Preview with the Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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

  // Print Handler
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
        message:
          'Direct print was restricted by the browser preview. Please tap "Download PDF" to save or print!',
        type: 'warn',
      });
    }
  };

  // Real PDF Downloader (A4 Portrait)
  const handleDownloadPdf = () => {
    try {
      const savedFilename = downloadPrintReportPdf(config, staffName);
      setNotification({
        message: `Downloaded "${savedFilename || defaultFilename}" as a printable A4 PDF.`,
        type: 'success',
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      console.error('PDF Download error:', err);
      setNotification({
        message: 'Could not generate PDF. Please try the print button or copy summary.',
        type: 'warn',
      });
    }
  };

  // Copy Plain Text Summary
  const handleCopySummary = () => {
    const text = generateTextSummary(config, staffName, todayIso);
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setNotification({
          message: 'Summary copied to clipboard! Ready to paste in WhatsApp or Email.',
          type: 'success',
        });
        setTimeout(() => {
          setCopied(false);
          setNotification(null);
        }, 3500);
      })
      .catch(() => {
        setNotification({
          message: 'Clipboard access is restricted in this browser view. Use "Download PDF" to save a copy.',
          type: 'warn',
        });
      });
  };

  // Shared Full School Letterhead (Page 1)
  const renderFullLetterhead = () => (
    <div className="border-b-2 border-zinc-900 pb-3 mb-3.5 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3">
        <img
          src={SCHOOL_LOGO_URL}
          onError={(e) => {
            const target = e.currentTarget;
            if (target.src !== SCHOOL_LOGO_FALLBACK_URL) {
              target.src = SCHOOL_LOGO_FALLBACK_URL;
            }
          }}
          alt={`${SCHOOL_NAME} logo`}
          className="h-12 w-auto object-contain shrink-0"
        />
        <div>
          <h1 className="text-lg font-bold tracking-tight text-zinc-900 font-display leading-tight">
            {SCHOOL_NAME}
          </h1>
          <p className="text-[11px] text-zinc-600 mt-0.5 font-medium">
            School Infirmary &amp; Student Health Department
          </p>
        </div>
      </div>
      <div className="text-right text-[11px] font-mono tabular-nums text-zinc-600 shrink-0">
        <div className="font-semibold text-zinc-900">Official Health Record</div>
        <div>Generated: {todayIso}</div>
      </div>
    </div>
  );

  // Compact Running Header (Page 2+)
  const renderRunningHeader = (subtitle: string) => (
    <div className="border-b border-zinc-300 pb-2 mb-3 flex items-center justify-between gap-4 text-[11px] shrink-0">
      <div className="font-bold text-zinc-900 font-display">
        {SCHOOL_NAME} <span className="font-normal text-zinc-500">· {subtitle}</span>
      </div>
      <div className="font-mono tabular-nums text-zinc-500">Generated: {todayIso}</div>
    </div>
  );

  // Official Sign-off Block (Last Page Only)
  const renderSignatures = () => (
    <div className="mt-6 pt-4 border-t border-zinc-300 flex items-start justify-between gap-8 text-xs shrink-0">
      <div className="w-[210px]">
        <p className="font-bold text-zinc-800 mb-9">Staff In-Charge Signature:</p>
        <div className="border-b border-zinc-400 w-full mb-1"></div>
        <p className="text-zinc-500 text-[11px]">Signature &amp; Name</p>
      </div>
      <div className="w-[210px]">
        <p className="font-bold text-zinc-800 mb-9">Principal Signature:</p>
        <div className="border-b border-zinc-400 w-full mb-1"></div>
        <p className="text-zinc-500 text-[11px]">Signature &amp; Date</p>
      </div>
    </div>
  );

  // Page Footer
  const renderPageFooter = (pageNum: number, pageCount: number) => (
    <div className="mt-auto pt-3 border-t border-zinc-200 flex items-center justify-between text-[10px] font-mono text-zinc-400 shrink-0">
      <span>{SCHOOL_NAME} · Confidential Student Health Record</span>
      <span>
        Page {pageNum} of {pageCount} · Valid with official signature
      </span>
    </div>
  );

  // Wrapper for one authentic A4 Page
  const renderA4Sheet = (
    pageIndex: number,
    pageCount: number,
    content: React.ReactNode
  ) => {
    const pageNum = pageIndex + 1;
    const isLastPage = pageNum === pageCount;

    return (
      <div
        key={`a4-page-${pageNum}`}
        className={!isLastPage ? 'print-page-break' : ''}
      >
        {/* Subtle page indicator above each scrollable A4 sheet */}
        {pageCount > 1 && (
          <div className="no-print text-center mb-1.5">
            <span className="inline-block px-2.5 py-0.5 text-[11px] font-mono tabular-nums font-medium text-slate-500">
              Page {pageNum} of {pageCount}
            </span>
          </div>
        )}

        <div
          style={{
            width: `${Math.round(A4_WIDTH_PX * scale)}px`,
            height: `${Math.round(A4_HEIGHT_PX * scale)}px`,
            position: 'relative',
            overflow: 'hidden',
            margin: '0 auto',
          }}
          className="print-scaled-container print:!w-full print:!h-auto print:!overflow-visible print:!static"
        >
          <div
            data-testid={pageNum === 1 ? 'printable-a4-sheet' : `printable-a4-sheet-${pageNum}`}
            style={{
              width: `${A4_WIDTH_PX}px`,
              minHeight: `${A4_HEIGHT_PX}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
            className="print-sheet bg-white border border-slate-200/90 rounded-none sm:rounded-lg p-7 sm:p-8 text-zinc-900 shadow-[0_12px_40px_rgba(15,23,42,0.08)] flex flex-col print:!shadow-none print:!border-none print:!p-0 print:!transform-none print:!w-full print:!static print:!min-h-0"
          >
            {content}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-[#F1F5F9] py-3 sm:py-6 px-2 sm:px-4 text-slate-900 print:bg-white print:p-0"
    >
      {/* SCREEN-ONLY TOOLBAR */}
      <div className="no-print max-w-4xl mx-auto mb-4 space-y-2.5">
        {/* Top bar: Title + Primary Actions */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 sm:p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200/80 text-teal-700 flex items-center justify-center shrink-0">
              <FileCheck2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-semibold text-slate-900 font-display tracking-tight truncate">
                  A4 Print Preview
                </h1>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="text-[11px] font-mono tabular-nums font-medium text-teal-700">
                  {totalPages} {totalPages === 1 ? 'Page' : 'Pages'} · A4
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate mt-0.5">{docTitle}</p>
            </div>
          </div>

          {/* Action Button Group */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70 rounded-xl transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>

            <button
              type="button"
              onClick={handleCopySummary}
              title="Copy text summary to clipboard"
              className="h-9 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200/80 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-teal-700" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span className="hidden xs:inline">{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              title="Download printable A4 PDF document"
              className="h-9 px-3.5 text-xs font-medium text-slate-700 hover:text-teal-800 bg-white hover:bg-teal-50/50 border border-slate-200/80 hover:border-teal-200 rounded-xl transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-teal-700" />
              <span>Download PDF</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="h-9 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
          </div>
        </div>

        {/* View Mode & Zoom Controls Toolbar */}
        <div className="bg-white border border-slate-200/80 rounded-xl px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.03)] flex flex-wrap items-center justify-between gap-2.5">
          {/* View mode segmented switcher */}
          <div className="inline-flex items-center bg-slate-100/90 p-0.5 rounded-lg text-xs font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setViewMode('a4-paper')}
              className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'a4-paper'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-teal-700" />
              <span>A4 Paper View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('mobile-cards')}
              className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'mobile-cards'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-teal-700" />
              <span>Mobile Cards</span>
            </button>
          </div>

          {/* Paper Zoom Controls */}
          {viewMode === 'a4-paper' && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[11px] font-mono tabular-nums text-slate-500 mr-1 hidden xs:inline">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomOut}
                aria-label="Zoom out"
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200/80 hover:bg-slate-50 text-slate-600 cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleFitPage}
                title="Fit full page to phone screen"
                className={`px-2.5 h-7 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1 cursor-pointer ${
                  isAutoFit
                    ? 'bg-slate-900 border-slate-900 text-white font-semibold'
                    : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Maximize2 className="w-3 h-3" />
                <span>Fit Page</span>
              </button>
              <button
                type="button"
                onClick={handleZoom100}
                title="View actual 100% size"
                className={`px-2 h-7 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                  !isAutoFit && scale === 1
                    ? 'bg-slate-900 border-slate-900 text-white font-semibold'
                    : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50'
                }`}
              >
                100%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                aria-label="Zoom in"
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200/80 hover:bg-slate-50 text-slate-600 cursor-pointer"
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
              className="text-current opacity-70 hover:opacity-100 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* VIEW MODE 1: AUTHENTIC PAGINATED A4 SHEETS */}
      {viewMode === 'a4-paper' && (
        <div className="w-full flex flex-col items-center gap-5 overflow-x-auto print:overflow-visible print:w-full print:block print:gap-0 pb-12 sm:pb-8">
          {/* REPORT TYPE 1: DAILY STUDENT VISIT LOG */}
          {config.type === 'daily-log' &&
            dailyLogPages.map((page, pageIdx) =>
              renderA4Sheet(
                pageIdx,
                dailyLogPages.length,
                <>
                  {pageIdx === 0 ? (
                    <>
                      {renderFullLetterhead()}
                      <div className="mb-3 bg-zinc-50 border border-zinc-200 px-3.5 py-2 flex items-baseline justify-between shrink-0">
                        <div>
                          <h2 className="text-[13px] font-bold text-zinc-900 font-display uppercase tracking-wide">
                            Daily Student Infirmary Log
                          </h2>
                          <p className="text-[11px] text-zinc-600">
                            Chronological infirmary attendance register
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] font-mono tabular-nums">
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
                    </>
                  ) : (
                    renderRunningHeader(`Daily Student Infirmary Log (${config.date}) — Cont.`)
                  )}

                  {config.entries.length === 0 ? (
                    <div className="border border-zinc-300 py-12 text-center text-sm text-zinc-500">
                      No student visits recorded for {config.date}.
                    </div>
                  ) : page.items.length > 0 ? (
                    <table className="w-full text-left border-collapse border border-zinc-300 text-[11px] leading-[1.35]">
                      <thead>
                        <tr className="bg-zinc-100 border-b border-zinc-300 text-zinc-800">
                          <th className="py-1.5 px-1.5 border-r border-zinc-300 font-semibold w-8 text-center">
                            #
                          </th>
                          <th className="py-1.5 px-2 border-r border-zinc-300 font-semibold w-[70px]">
                            Time
                          </th>
                          <th className="py-1.5 px-2 border-r border-zinc-300 font-semibold w-[142px]">
                            Student Name
                          </th>
                          <th className="py-1.5 px-2 border-r border-zinc-300 font-semibold w-[96px]">
                            Section / Roll
                          </th>
                          <th className="py-1.5 px-2 border-r border-zinc-300 font-semibold">
                            Reason &amp; Observations
                          </th>
                          <th className="py-1.5 px-2 border-r border-zinc-300 font-semibold w-[132px]">
                            Action Taken
                          </th>
                          <th className="py-1.5 px-2 font-semibold w-[134px]">Medicine Given</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.items.map((entry) => (
                          <tr
                            key={entry.visit.visit_id}
                            className="border-b border-zinc-300 align-top"
                          >
                            <td className="py-1.5 px-1.5 border-r border-zinc-300 font-mono tabular-nums text-center text-zinc-600">
                              {entry.visitNumber}
                            </td>
                            <td className="py-1.5 px-2 border-r border-zinc-300 font-mono tabular-nums whitespace-nowrap text-zinc-700">
                              {entry.visitTimeFormatted}
                            </td>
                            <td className="py-1.5 px-2 border-r border-zinc-300 font-semibold text-zinc-900">
                              {entry.student.full_name}
                            </td>
                            <td className="py-1.5 px-2 border-r border-zinc-300 font-mono tabular-nums whitespace-nowrap text-zinc-700">
                              {entry.student.section} · #{entry.student.roll_number}
                            </td>
                            <td className="py-1.5 px-2 border-r border-zinc-300">
                              <div className="font-semibold text-zinc-900">{entry.visit.reason}</div>
                              {entry.visit.observations && (
                                <div className="text-[10px] text-zinc-600 mt-0.5">
                                  Obs: {entry.visit.observations}
                                </div>
                              )}
                            </td>
                            <td className="py-1.5 px-2 border-r border-zinc-300 text-zinc-800">
                              <div>{entry.visit.action_taken}</div>
                              {entry.visit.notes && (
                                <div className="text-[10px] text-zinc-500 mt-0.5">
                                  Note: {entry.visit.notes}
                                </div>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-zinc-900 font-medium">
                              {entry.medicineSummary}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}

                  {page.showSignatures && renderSignatures()}
                  {renderPageFooter(pageIdx + 1, dailyLogPages.length)}
                </>
              )
            )}

          {/* REPORT TYPE 2: STUDENT HEALTH & VISIT HISTORY */}
          {config.type === 'student-history' &&
            studentHistoryPages.map((page, pageIdx) =>
              renderA4Sheet(
                pageIdx,
                studentHistoryPages.length,
                <>
                  {pageIdx === 0 ? (
                    <>
                      {renderFullLetterhead()}
                      <div className="mb-3.5 bg-zinc-50 border border-zinc-200 px-4 py-2.5 shrink-0">
                        <div className="flex items-baseline justify-between border-b border-zinc-200 pb-2 mb-2">
                          <h2 className="text-[13px] font-bold text-zinc-900 font-display uppercase tracking-wide">
                            {config.startDate || config.endDate
                              ? `Student Health History (${config.startDate || 'Start'} to ${config.endDate || 'Present'})`
                              : 'Complete Student Health & Infirmary History'}
                          </h2>
                          <span className="text-[11px] font-mono tabular-nums text-zinc-600">
                            Total Visits: <strong>{config.visits.length}</strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-zinc-500 block text-[11px]">Student Name</span>
                            <span className="font-bold text-zinc-900">
                              {config.student.full_name}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block text-[11px]">
                              Class &amp; Roll Number
                            </span>
                            <span className="font-mono tabular-nums font-medium text-zinc-800">
                              {config.student.section} · Roll #{config.student.roll_number}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block text-[11px]">
                              Latest Height / Weight
                            </span>
                            <span className="font-mono tabular-nums font-medium text-zinc-800">
                              {config.latestMeasurement
                                ? `${config.latestMeasurement.height_cm} cm / ${config.latestMeasurement.weight_kg} kg`
                                : 'Not recorded'}
                            </span>
                          </div>
                        </div>

                        {config.healthProfiles.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-zinc-200 text-xs">
                            <span className="text-zinc-500 font-medium">
                              Medical Profile / Care Notes:{' '}
                            </span>
                            <span className="text-zinc-800 font-semibold">
                              {config.healthProfiles
                                .map((h) => `${h.condition_or_note} (${h.status})`)
                                .join('; ')}
                            </span>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    renderRunningHeader(
                      `${config.student.full_name} (${config.student.section} · #${config.student.roll_number}) — Health History Cont.`
                    )
                  )}

                  {config.visits.length === 0 ? (
                    <div className="border border-zinc-300 py-10 text-center text-xs text-zinc-500">
                      No visits recorded for this student in the selected period.
                    </div>
                  ) : page.items.length > 0 ? (
                    <table className="w-full text-left border-collapse border border-zinc-300 text-[11px] leading-[1.35]">
                      <thead>
                        <tr className="bg-zinc-100 border-b border-zinc-300 text-zinc-800">
                          <th className="py-1.5 px-2.5 border-r border-zinc-300 font-semibold w-28">
                            Date &amp; Time
                          </th>
                          <th className="py-1.5 px-2.5 border-r border-zinc-300 font-semibold">
                            Reason &amp; Observations
                          </th>
                          <th className="py-1.5 px-2.5 border-r border-zinc-300 font-semibold">
                            Action Taken / Resolution
                          </th>
                          <th className="py-1.5 px-2.5 font-semibold w-40">Medicine Given</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.items.map((v) => (
                          <tr key={v.visit_id} className="border-b border-zinc-300 align-top">
                            <td className="py-1.5 px-2.5 border-r border-zinc-300 font-mono tabular-nums whitespace-nowrap text-zinc-700">
                              <div className="font-semibold text-zinc-900">
                                {extractDatePart(v.visit_datetime)}
                              </div>
                              <div className="text-zinc-500">
                                {formatTimeFromDatetime(v.visit_datetime)}
                              </div>
                            </td>
                            <td className="py-1.5 px-2.5 border-r border-zinc-300">
                              <div className="font-semibold text-zinc-900">{v.reason}</div>
                              {v.observations && (
                                <div className="text-[10px] text-zinc-600 mt-0.5">
                                  Obs: {v.observations}
                                </div>
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 border-r border-zinc-300 text-zinc-800">
                              <div>{v.action_taken}</div>
                              {v.notes && (
                                <div className="text-[10px] text-zinc-500 mt-0.5">
                                  Note: {v.notes}
                                </div>
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 font-medium text-zinc-900">
                              {formatMedicineDisplay(v)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}

                  {page.showSignatures && renderSignatures()}
                  {renderPageFooter(pageIdx + 1, studentHistoryPages.length)}
                </>
              )
            )}

          {/* REPORT TYPE 3: SINGLE VISIT SLIP */}
          {config.type === 'single-visit' &&
            renderA4Sheet(
              0,
              1,
              <>
                {renderFullLetterhead()}
                <div>
                  <div className="mb-4 bg-zinc-50 border border-zinc-200 px-4 py-2.5 flex items-baseline justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-zinc-900 font-display uppercase tracking-wide">
                        Individual Student Infirmary Visit Slip
                      </h2>
                      <p className="text-xs text-zinc-600">
                        Visit ID:{' '}
                        <span className="font-mono font-medium">{config.visit.visit_id}</span>
                      </p>
                    </div>
                    <div className="text-xs font-mono tabular-nums">
                      Date: <strong>{extractDatePart(config.visit.visit_datetime)}</strong> · Time:{' '}
                      <strong>{formatTimeFromDatetime(config.visit.visit_datetime)}</strong>
                    </div>
                  </div>

                  <div className="border border-zinc-300 divide-y divide-zinc-300 text-xs">
                    {/* Patient identity strip: 2 clean columns (no Student ID) */}
                    <div className="grid grid-cols-2 divide-x divide-zinc-300">
                      <div className="p-3">
                        <span className="text-zinc-500 block text-[11px]">Student Full Name</span>
                        <span className="font-bold text-sm text-zinc-900">
                          {config.student.full_name}
                        </span>
                      </div>
                      <div className="p-3">
                        <span className="text-zinc-500 block text-[11px]">
                          Class &amp; Roll Number
                        </span>
                        <span className="font-mono font-bold text-sm text-zinc-900">
                          {config.student.section} · Roll #{config.student.roll_number}
                        </span>
                      </div>
                    </div>

                    <div className="p-3">
                      <span className="text-zinc-500 block text-[11px] mb-0.5">
                        Reason for Visit / Health Concern
                      </span>
                      <p className="font-bold text-zinc-900 text-sm">{config.visit.reason}</p>
                    </div>

                    <div className="p-3">
                      <span className="text-zinc-500 block text-[11px] mb-0.5">
                        Clinical Observations
                      </span>
                      <p className="text-zinc-800">{config.visit.observations || 'None recorded'}</p>
                    </div>

                    <div className="p-3">
                      <span className="text-zinc-500 block text-[11px] mb-0.5">
                        Care Provided / Action Taken
                      </span>
                      <p className="text-zinc-900 font-semibold">{config.visit.action_taken}</p>
                    </div>

                    <div className="p-3">
                      <span className="text-zinc-500 block text-[11px] mb-0.5">
                        Medication Administered
                      </span>
                      <p className="font-bold text-zinc-900">
                        {formatMedicineDisplay(config.visit)}
                      </p>
                    </div>

                    {config.visit.notes && (
                      <div className="p-3">
                        <span className="text-zinc-500 block text-[11px] mb-0.5">
                          Additional Clinical Notes
                        </span>
                        <p className="text-zinc-700">{config.visit.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
                {renderSignatures()}
                {renderPageFooter(1, 1)}
              </>
            )}
        </div>
      )}

      {/* VIEW MODE 2: RESPONSIVE MOBILE CARDS VIEW */}
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
                <div className="text-[11px] pt-1">
                  <span className="text-zinc-400 block">Latest Height / Weight</span>
                  <span className="font-mono font-medium text-zinc-800">
                    {config.latestMeasurement
                      ? `${config.latestMeasurement.height_cm}cm / ${config.latestMeasurement.weight_kg}kg`
                      : 'Not recorded'}
                  </span>
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
                  {config.student.section} · Roll #{config.student.roll_number}
                </p>
              </div>

              <div className="space-y-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                    Date &amp; Time
                  </span>
                  <p className="font-mono font-semibold text-zinc-800 mt-0.5">
                    {extractDatePart(config.visit.visit_datetime)} at{' '}
                    {formatTimeFromDatetime(config.visit.visit_datetime)}
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

// Format Plain Text Summary for Quick Copy (No Student ID)
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
    return `${header}STUDENT HEALTH RECORD: ${config.student.full_name}\nSection: ${config.student.section} · Roll #${config.student.roll_number}\nTotal Visits: ${config.visits.length}\n\n${list || 'No visits recorded.'}\n`;
  }

  // Single visit
  return (
    `${header}INDIVIDUAL VISIT SLIP\n` +
    `Student: ${config.student.full_name} (${config.student.section} #${config.student.roll_number})\n` +
    `Visit ID: ${config.visit.visit_id}\n` +
    `Time: ${extractDatePart(config.visit.visit_datetime)} at ${formatTimeFromDatetime(config.visit.visit_datetime)}\n` +
    `Reason: ${config.visit.reason}\n` +
    `Observations: ${config.visit.observations || 'None'}\n` +
    `Action Taken: ${config.visit.action_taken}\n` +
    `Medicine Administered: ${formatMedicineDisplay(config.visit)}\n` +
    `Recorded by: ${staffName}\n`
  );
}
