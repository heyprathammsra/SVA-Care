import React, { useState, useEffect } from 'react';
import {
  Download,
  ArrowLeft,
  Users,
  ClipboardList,
  Ruler,
  HeartPulse,
  Lock,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Link2,
  UploadCloud,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pill,
  Package,
  Receipt,
  Stethoscope,
  Building2,
  ClipboardCheck,
  FileText,
  History,
  TrendingUp,
} from 'lucide-react';
import { GOOGLE_APPS_SCRIPT_CODE } from '../utils/appsScriptTemplate';
import type { NurseDatabase } from '../utils/nurseLogic';
import {
  downloadSheetPdf,
  type DownloadableExcelTab,
  type DownloadableSheetTab,
} from '../utils/pdfExport';

export type { DownloadableExcelTab, DownloadableSheetTab };

export interface SheetsActionResult {
  ok: boolean;
  message: string;
}

interface SheetsSetupViewProps {
  db: NurseDatabase;
  isAdmin?: boolean;
  appsScriptUrl?: string;
  isCustomAppsScriptUrl?: boolean;
  onSyncFromSheets?: () => Promise<void>;
  onUpdateAppsScriptUrl?: (
    newUrl: string,
    options?: { resetDefault?: boolean; pushBackup?: boolean }
  ) => Promise<SheetsActionResult>;
  onPushFullBackup?: () => Promise<SheetsActionResult>;
  onDownloadExcelSheet?: (tab: DownloadableExcelTab) => Promise<SheetsActionResult>;
  syncStatusMessage?: string | null;
  onBackToHome?: () => void;
}

export const SheetsSetupView: React.FC<SheetsSetupViewProps> = ({
  db,
  isAdmin = false,
  appsScriptUrl = '',
  isCustomAppsScriptUrl = false,
  onSyncFromSheets,
  onUpdateAppsScriptUrl,
  onPushFullBackup,
  onDownloadExcelSheet,
  syncStatusMessage,
  onBackToHome,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  const [downloadingExcelTab, setDownloadingExcelTab] = useState<DownloadableExcelTab | null>(null);
  const [downloadingPdfTab, setDownloadingPdfTab] = useState<DownloadableSheetTab | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [urlInput, setUrlInput] = useState(appsScriptUrl);
  const [pushOnSwitch, setPushOnSwitch] = useState(true);
  const [urlFeedback, setUrlFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    setUrlInput(appsScriptUrl);
  }, [appsScriptUrl]);

  const isCustomUrl = Boolean(isCustomAppsScriptUrl);
  const isAnyDownloadBusy = downloadingExcelTab !== null || downloadingPdfTab !== null;

  const handleDownloadTabExcel = async (tab: DownloadableExcelTab) => {
    if (!onDownloadExcelSheet || isAnyDownloadBusy) return;
    setDownloadingExcelTab(tab);
    setDownloadFeedback(null);
    try {
      const res = await onDownloadExcelSheet(tab);
      setDownloadFeedback({
        type: res.ok ? 'success' : 'error',
        text: res.message,
      });
    } finally {
      setDownloadingExcelTab(null);
    }
  };

  const handleDownloadTabPdf = (tab: DownloadableSheetTab) => {
    if (isAnyDownloadBusy) return;
    setDownloadingPdfTab(tab);
    setDownloadFeedback(null);
    try {
      const res = downloadSheetPdf(tab, db);
      setDownloadFeedback({
        type: res.ok ? 'success' : 'error',
        text: res.message,
      });
    } finally {
      setDownloadingPdfTab(null);
    }
  };

  const handleCheckConnection = async () => {
    if (!onSyncFromSheets || isSyncing) return;
    setIsSyncing(true);
    try {
      await onSyncFromSheets();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveAppsScriptUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateAppsScriptUrl || isSavingUrl) return;
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setUrlFeedback({
        type: 'error',
        text: 'Please paste a deployed Google Apps Script Web App URL.',
      });
      return;
    }
    setIsSavingUrl(true);
    setUrlFeedback(null);
    try {
      const res = await onUpdateAppsScriptUrl(trimmed, {
        pushBackup: pushOnSwitch,
      });
      setUrlFeedback({
        type: res.ok ? 'success' : 'error',
        text: res.message,
      });
    } finally {
      setIsSavingUrl(false);
    }
  };

  const handleResetDefaultUrl = async () => {
    if (!onUpdateAppsScriptUrl || isSavingUrl) return;
    setIsSavingUrl(true);
    setUrlFeedback(null);
    try {
      const res = await onUpdateAppsScriptUrl('', {
        resetDefault: true,
        pushBackup: false,
      });
      setUrlFeedback({
        type: res.ok ? 'success' : 'error',
        text: res.message,
      });
    } finally {
      setIsSavingUrl(false);
    }
  };

  const handlePushBackupNow = async () => {
    if (!onPushFullBackup || isPushing) return;
    setIsPushing(true);
    setUrlFeedback(null);
    try {
      const res = await onPushFullBackup();
      setUrlFeedback({
        type: res.ok ? 'success' : 'error',
        text: res.message,
      });
    } finally {
      setIsPushing(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      // Fallback ignored if clipboard blocked in iframe
    }
  };

  const sheets: Array<{
    tab: Exclude<DownloadableSheetTab, 'All'>;
    title: string;
    description: string;
    countLabel: string;
    supportsExcel: boolean;
    icon: React.ReactNode;
  }> = [
    {
      tab: 'Students',
      title: 'Students Roster',
      description: 'Formatted student roster organized by class section, roll number, GR number, and status.',
      countLabel: `${db.students.length} ${db.students.length === 1 ? 'student' : 'students'}`,
      supportsExcel: true,
      icon: <Users className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Visits',
      title: 'Infirmary Visits Register',
      description: 'Complete infirmary visit register with dates, symptoms, observations, care given, and medicines.',
      countLabel: `${db.visits.length} ${db.visits.length === 1 ? 'visit' : 'visits'}`,
      supportsExcel: true,
      icon: <ClipboardList className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Measurements',
      title: 'Height, Weight & BMI',
      description: 'Student height, weight, and auto-calculated BMI growth history across all classes.',
      countLabel: `${db.measurements.length} ${db.measurements.length === 1 ? 'record' : 'records'}`,
      supportsExcel: true,
      icon: <Ruler className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Health Profiles',
      title: 'Allergies & Health Profiles',
      description: 'Active and resolved allergies, chronic conditions, and medical notes linked to each student.',
      countLabel: `${db.healthProfiles.length} ${db.healthProfiles.length === 1 ? 'entry' : 'entries'}`,
      supportsExcel: true,
      icon: <HeartPulse className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Medicines',
      title: 'Medicines Stock',
      description: 'Current infirmary medicines stock, batch numbers, expiry dates, and low-stock status.',
      countLabel: `${(db.medicines || []).length} ${(db.medicines || []).length === 1 ? 'medicine' : 'medicines'}`,
      supportsExcel: true,
      icon: <Pill className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Items',
      title: 'Supplies & Items Stock',
      description: 'Bandages, sterile gauze, cotton, hygiene supplies, and infirmary consumables stock.',
      countLabel: `${(db.items || []).length} ${(db.items || []).length === 1 ? 'item' : 'items'}`,
      supportsExcel: true,
      icon: <Package className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Bills',
      title: 'Bills & Pharmacy Receipts',
      description: 'Infirmary purchase bills, pharmacy invoice numbers, amounts, notes, and Drive receipt links.',
      countLabel: `${(db.bills || []).length} ${(db.bills || []).length === 1 ? 'bill' : 'bills'}`,
      supportsExcel: true,
      icon: <Receipt className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Stock Ledger',
      title: 'Stock Movement Ledger',
      description: 'Full audit trail of medicine & item deductions, bill restocks, and manual stock adjustments.',
      countLabel: `${(db.stockTransactions || []).length} ${(db.stockTransactions || []).length === 1 ? 'movement' : 'movements'}`,
      supportsExcel: true,
      icon: <History className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Doctor Visits',
      title: 'Weekly Doctor Visits',
      description: 'Weekly visiting doctor sessions paired with student complaints, clinical findings, and prescriptions.',
      countLabel:
        (db.doctorVisitCases || []).length > 0
          ? `${(db.doctorVisitCases || []).length} ${(db.doctorVisitCases || []).length === 1 ? 'consultation' : 'consultations'}`
          : `${(db.doctorVisits || []).length} ${(db.doctorVisits || []).length === 1 ? 'session' : 'sessions'}`,
      supportsExcel: true,
      icon: <Stethoscope className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'External OPD',
      title: 'External OPD Referrals',
      description: 'Outside hospital/clinic referrals, escort details, follow-up dates, status, and OPD slip Drive links.',
      countLabel: `${(db.opdRecords || []).length} ${(db.opdRecords || []).length === 1 ? 'referral' : 'referrals'}`,
      supportsExcel: true,
      icon: <Building2 className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Medical Camps',
      title: 'Medical Camps & Screenings',
      description: 'School dental, eye, vaccination, and annual health camps with student screening findings and referrals.',
      countLabel:
        (db.campScreenings || []).length > 0
          ? `${(db.campScreenings || []).length} ${(db.campScreenings || []).length === 1 ? 'screening' : 'screenings'}`
          : `${(db.medicalCamps || []).length} ${(db.medicalCamps || []).length === 1 ? 'camp' : 'camps'}`,
      supportsExcel: true,
      icon: <HeartPulse className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Annual Checkups',
      title: 'Annual Health Checkups',
      description: 'Academic-year physical examination records including height, weight, BMI, vision, dental, ENT, and blood group.',
      countLabel: `${(db.annualCheckups || []).length} ${(db.annualCheckups || []).length === 1 ? 'checkup' : 'checkups'}`,
      supportsExcel: true,
      icon: <ClipboardCheck className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Health Insights',
      title: 'Health Insights (30-Day Summary)',
      description: 'Analytics PDF summarizing frequent campus visitors and common illness clusters by class.',
      countLabel: 'Analytics PDF',
      supportsExcel: false,
      icon: <TrendingUp className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Menstrual Log',
      title: 'Menstrual Log (Private)',
      description: 'Confidential Nurse & Admin opt-in export only (permanently excluded from Download All exports).',
      countLabel: `${(db.menstrualLogs || []).length} ${(db.menstrualLogs || []).length === 1 ? 'entry' : 'entries'}`,
      supportsExcel: true,
      icon: <Lock className="w-4 h-4 text-amber-700" />,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {onBackToHome && (
        <div className="hidden sm:block">
          <button
            type="button"
            onClick={onBackToHome}
            className="px-3.5 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-200/90 rounded-xl hover:bg-zinc-50 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Desk
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-zinc-950 font-display tracking-tight">
            {isAdmin ? 'Sheets, PDF & Excel Exports' : 'Download PDF & Excel Sheets'}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            {isAdmin
              ? 'Manage Google Sheets synchronization and download formatted PDF registers or password-protected Excel workbooks.'
              : 'Download formatted PDF registers or password-protected Excel (.xlsx) workbooks for every infirmary module.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
          <button
            type="button"
            disabled={isAnyDownloadBusy}
            onClick={() => handleDownloadTabPdf('All')}
            className="h-9 px-3.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] rounded-xl transition-all inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60 cursor-pointer"
          >
            {downloadingPdfTab === 'All' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            <span>
              {downloadingPdfTab === 'All' ? 'Building PDF...' : 'Download All PDF'}
            </span>
          </button>

          {onDownloadExcelSheet && (
            <button
              type="button"
              disabled={isAnyDownloadBusy}
              onClick={() => void handleDownloadTabExcel('All')}
              className="h-9 px-3.5 text-xs font-medium text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200/90 active:scale-[0.99] rounded-xl transition-all inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60 cursor-pointer"
            >
              {downloadingExcelTab === 'All' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 text-zinc-500" />
              )}
              <span>
                {downloadingExcelTab === 'All' ? 'Encrypting...' : 'Download All Excel'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ADMIN-ONLY: School Google Sheet Connection Status */}
      {isAdmin && (
        <section className="bg-white border border-zinc-200/80 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-950 font-display">
                School Google Sheet Connection
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                Automated two-way sync every 10 seconds with your school Google Sheet backup.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {onPushFullBackup && (
                <button
                  type="button"
                  onClick={handlePushBackupNow}
                  disabled={isPushing}
                  className="h-9 px-3.5 text-xs font-medium text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-200/90 rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap transition-all disabled:opacity-60 cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{isPushing ? 'Backing Up...' : 'Push Full Backup'}</span>
                </button>
              )}
              {onSyncFromSheets && (
                <button
                  type="button"
                  onClick={handleCheckConnection}
                  disabled={isSyncing}
                  className="h-9 px-3.5 text-xs font-medium text-zinc-800 bg-zinc-100/80 hover:bg-zinc-200/70 rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap transition-all disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-zinc-600 ${isSyncing ? 'animate-spin' : ''}`}
                  />
                  <span>{isSyncing ? 'Checking...' : 'Check Connection'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="px-4 py-3 rounded-xl bg-zinc-50 border border-zinc-200/70 text-xs font-mono text-zinc-700 break-all">
            {syncStatusMessage ||
              `Connected to Google Sheet backend (${db.students.length} students, ${db.visits.length} visits).`}
          </div>
        </section>
      )}

      {/* Downloadable PDF & Protected Excel Sheets List */}
      <section className="bg-white border border-zinc-200/80 rounded-2xl overflow-hidden">
        {downloadFeedback && (
          <div
            className={`px-5 py-3 text-xs border-b flex items-center gap-2 ${
              downloadFeedback.type === 'success'
                ? 'bg-emerald-50/70 border-emerald-200/70 text-emerald-900'
                : 'bg-rose-50/80 border-rose-200/70 text-rose-900'
            }`}
          >
            {downloadFeedback.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
            )}
            <span>{downloadFeedback.text}</span>
          </div>
        )}

        <div className="divide-y divide-zinc-100">
          {sheets.map((sheet) => {
            const isBusyPdf = downloadingPdfTab === sheet.tab;
            const isBusyExcel = downloadingExcelTab === sheet.tab;
            return (
              <div
                key={sheet.tab}
                className="p-4 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50/70 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-medium text-zinc-950">
                      {sheet.title}
                    </h2>
                    <span className="text-xs text-zinc-300" aria-hidden="true">·</span>
                    <span className="text-xs font-mono tabular-nums text-zinc-500">
                      {sheet.countLabel}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    {sheet.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                  <button
                    type="button"
                    disabled={isAnyDownloadBusy}
                    onClick={() => handleDownloadTabPdf(sheet.tab)}
                    className="h-8 px-3 text-xs font-medium text-zinc-800 bg-white hover:bg-zinc-50 active:scale-[0.99] border border-zinc-200/90 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all disabled:opacity-60 cursor-pointer"
                  >
                    {isBusyPdf ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                    <span>{isBusyPdf ? 'Building...' : 'PDF'}</span>
                  </button>

                  {sheet.supportsExcel && onDownloadExcelSheet && (
                    <button
                      type="button"
                      disabled={isAnyDownloadBusy}
                      onClick={() => void handleDownloadTabExcel(sheet.tab as DownloadableExcelTab)}
                      className="h-8 px-3 text-xs font-medium text-zinc-700 bg-zinc-100/80 hover:bg-zinc-200/70 active:scale-[0.99] rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all disabled:opacity-60 cursor-pointer"
                    >
                      {isBusyExcel ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Lock className="w-3 h-3 text-zinc-500" />
                      )}
                      <span>{isBusyExcel ? 'Encrypting...' : 'Excel'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ADMIN-ONLY: Apps Script Backend (Code.gs) & Editable Web App Link */}
      {isAdmin && (
        <section className="bg-white border border-stone-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 font-display">
              Apps Script Backend (Code.gs)
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
              Updated with all 17 tabs (Students, Visits, Measurements, Health Profiles, Users, Medicines, Items, Stock Transactions, Bills, Settings, Doctor Visits, Doctor Visit Cases, OPD, Medical Camps, Camp Screenings, Annual Checkups, and private Menstrual Log) plus automatic Google Drive bill &amp; OPD slip photo archiving in &ldquo;SVA Infirmary Documents&rdquo;. Paste this updated Code.gs into Apps Script, run <code className="font-mono text-zinc-700">setupSpreadsheet</code> once, and redeploy your Web App.
            </p>
          </div>

          {/* Update Apps Script Web App Link Form */}
          {onUpdateAppsScriptUrl && (
            <form
              onSubmit={handleSaveAppsScriptUrl}
              className="pt-4 border-t border-stone-100 space-y-3"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label
                  htmlFor="apps-script-url-input"
                  className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5"
                >
                  <Link2 className="w-3.5 h-3.5 text-teal-700" />
                  Apps Script Web App Link (Backup Sheet Endpoint)
                </label>
                {isCustomUrl && (
                  <button
                    type="button"
                    disabled={isSavingUrl}
                    onClick={handleResetDefaultUrl}
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to Default School Link
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="apps-script-url-input"
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="flex-1 h-10 px-3.5 text-xs font-mono text-zinc-800 bg-stone-50/80 border border-stone-200 rounded-xl focus:bg-white focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 transition-all"
                />
                <button
                  type="submit"
                  disabled={isSavingUrl}
                  className="h-10 px-4 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs transition-all disabled:opacity-60 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSavingUrl ? 'Updating...' : 'Update Link & Sync'}</span>
                </button>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-zinc-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pushOnSwitch}
                  onChange={(e) => setPushOnSwitch(e.target.checked)}
                  className="rounded border-stone-300 text-teal-700 focus:ring-teal-700"
                />
                <span>
                  Push all current students, visits, measurements, health profiles &amp; staff accounts to this sheet on save
                </span>
              </label>

              {urlFeedback && (
                <div
                  role={urlFeedback.type === 'error' ? 'alert' : 'status'}
                  className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                    urlFeedback.type === 'success'
                      ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/90 border-rose-200 text-rose-900'
                  }`}
                >
                  {urlFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{urlFeedback.text}</span>
                </div>
              )}
            </form>
          )}

          {/* View & Copy Code.gs Controls */}
          <div className="pt-4 border-t border-stone-100 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCode((v) => !v)}
                className="px-3.5 py-2 text-xs font-semibold text-zinc-800 bg-white hover:bg-stone-50 border border-stone-200 rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {showCode ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
                <span>{showCode ? 'Hide Code.gs' : 'View Code.gs'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyCode}
                className="px-3.5 py-2 text-xs font-semibold text-zinc-800 bg-stone-100 hover:bg-stone-200/80 border border-stone-200/80 rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    <span className="text-emerald-800">Copied Code.gs</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-zinc-600" />
                    <span>Copy Code.gs</span>
                  </>
                )}
              </button>
            </div>

            {showCode && (
              <pre className="p-4 rounded-xl bg-zinc-950 text-zinc-100 text-[11px] font-mono overflow-x-auto max-h-96 overflow-y-auto leading-relaxed">
                <code>{GOOGLE_APPS_SCRIPT_CODE}</code>
              </pre>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
