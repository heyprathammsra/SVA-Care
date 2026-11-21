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
} from 'lucide-react';
import { GOOGLE_APPS_SCRIPT_CODE } from '../utils/appsScriptTemplate';
import type { NurseDatabase } from '../utils/nurseLogic';

export type DownloadableExcelTab =
  | 'Students'
  | 'Visits'
  | 'Measurements'
  | 'Health Profiles'
  | 'Medicines'
  | 'Items'
  | 'Bills'
  | 'All';

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
  const [downloadingTab, setDownloadingTab] = useState<DownloadableExcelTab | null>(null);
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

  const handleDownloadTabExcel = async (tab: DownloadableExcelTab) => {
    if (!onDownloadExcelSheet || downloadingTab) return;
    setDownloadingTab(tab);
    setDownloadFeedback(null);
    try {
      const res = await onDownloadExcelSheet(tab);
      setDownloadFeedback({
        type: res.ok ? 'success' : 'error',
        text: res.message,
      });
    } finally {
      setDownloadingTab(null);
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
    tab: Exclude<DownloadableExcelTab, 'All'>;
    filename: string;
    description: string;
    count: number;
    unit: string;
    icon: React.ReactNode;
  }> = [
    {
      tab: 'Students',
      filename: 'Students.xlsx',
      description: 'Formatted student roster organized by class section, roll number, and active status.',
      count: db.students.length,
      unit: db.students.length === 1 ? 'student' : 'students',
      icon: <Users className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Visits',
      filename: 'Visits.xlsx',
      description: 'Complete infirmary visit register with dates, symptoms, observations, care given, and medicines.',
      count: db.visits.length,
      unit: db.visits.length === 1 ? 'visit' : 'visits',
      icon: <ClipboardList className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Measurements',
      filename: 'Measurements.xlsx',
      description: 'Student height, weight, and auto-calculated BMI growth history across all classes.',
      count: db.measurements.length,
      unit: db.measurements.length === 1 ? 'record' : 'records',
      icon: <Ruler className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Health Profiles',
      filename: 'Health Profiles.xlsx',
      description: 'Active and resolved allergies, chronic conditions, and medical notes linked to each student.',
      count: db.healthProfiles.length,
      unit: db.healthProfiles.length === 1 ? 'entry' : 'entries',
      icon: <HeartPulse className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Medicines',
      filename: 'Medicines.xlsx',
      description: 'Current infirmary medicines stock, batch numbers, expiry dates, and low-stock status.',
      count: (db.medicines || []).length,
      unit: (db.medicines || []).length === 1 ? 'medicine' : 'medicines',
      icon: <Pill className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Items',
      filename: 'Items.xlsx',
      description: 'Bandages, sterile gauze, cotton, hygiene supplies, and infirmary consumables stock.',
      count: (db.items || []).length,
      unit: (db.items || []).length === 1 ? 'item' : 'items',
      icon: <Package className="w-4 h-4 text-teal-700" />,
    },
    {
      tab: 'Bills',
      filename: 'Bills.xlsx',
      description: 'Infirmary purchase bills, pharmacy invoice numbers, amounts, payment status, and Drive receipt links.',
      count: (db.bills || []).length,
      unit: (db.bills || []).length === 1 ? 'bill' : 'bills',
      icon: <Receipt className="w-4 h-4 text-teal-700" />,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {onBackToHome && (
        <div className="hidden sm:block">
          <button
            type="button"
            onClick={onBackToHome}
            className="px-3.5 py-2 text-xs font-medium text-zinc-700 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Infirmary Desk
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-stone-200/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 font-display tracking-tight">
            {isAdmin ? 'Google Sheets & Protected Excel Backup' : 'Download Protected Sheets (.xlsx)'}
          </h1>
          <p className="text-sm text-zinc-600 mt-1">
            {isAdmin
              ? 'Manage live Google Sheets synchronization, update the backup Apps Script link, and download password-protected Excel registers.'
              : 'Download neatly formatted, password-protected Excel (.xlsx) registers for students, visits, measurements, and health profiles.'}
          </p>
        </div>
        <button
          type="button"
          disabled={downloadingTab !== null}
          onClick={() => void handleDownloadTabExcel('All')}
          className="self-start sm:self-end px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] rounded-xl transition-all inline-flex items-center gap-1.5 shadow-xs shrink-0 disabled:opacity-60 cursor-pointer"
        >
          {downloadingTab === 'All' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          <span>
            {downloadingTab === 'All' ? 'Encrypting Workbook...' : 'Download All Sheets (.xlsx)'}
          </span>
        </button>
      </div>

      {/* ADMIN-ONLY: School Google Sheet Connection Status */}
      {isAdmin && (
        <section className="bg-white border border-stone-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 font-display">
                School Google Sheet Connection
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                Automated two-way sync every 10 seconds with your school Google Sheet backup. To switch to another sheet, update the Apps Script link in the Code.gs section below.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {onPushFullBackup && (
                <button
                  type="button"
                  onClick={handlePushBackupNow}
                  disabled={isPushing}
                  className="px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap transition-all disabled:opacity-60 cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>{isPushing ? 'Backing Up...' : 'Push Full Backup'}</span>
                </button>
              )}
              {onSyncFromSheets && (
                <button
                  type="button"
                  onClick={handleCheckConnection}
                  disabled={isSyncing}
                  className="px-3.5 py-2 text-xs font-semibold text-zinc-800 bg-stone-100 hover:bg-stone-200/80 border border-stone-200/80 rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap transition-all disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-zinc-600 ${isSyncing ? 'animate-spin' : ''}`}
                  />
                  <span>{isSyncing ? 'Checking...' : 'Check Connection Now'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="px-4 py-3 rounded-xl bg-stone-50/90 border border-stone-200/70 text-xs font-mono text-zinc-700 break-all">
            {syncStatusMessage ||
              `Connected to Google Sheet backend (${db.students.length} students, ${db.visits.length} visits).`}
          </div>
        </section>
      )}

      {/* Downloadable Password-Protected Excel Sheets List */}
      <section className="bg-white border border-stone-200/90 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-4 sm:px-6 py-3.5 bg-stone-50/80 border-b border-stone-200/70 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-800">
            <Lock className="w-3.5 h-3.5 text-teal-700" />
            <span>AES-256 Password-Protected Excel Workbooks (.xlsx)</span>
          </div>
          <span className="text-[11px] text-zinc-500">
            Formatted with frozen headers, auto-filters, print layout &amp; open-file password lock
          </span>
        </div>

        {downloadFeedback && (
          <div
            className={`px-4 sm:px-6 py-2.5 text-xs border-b flex items-center gap-2 ${
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

        <div className="divide-y divide-stone-100">
          {sheets.map((sheet) => {
            const isBusyThis = downloadingTab === sheet.tab;
            return (
              <div
                key={sheet.tab}
                className="p-4 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/70 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0 mt-0.5">
                    {sheet.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-semibold text-zinc-900">
                        {sheet.filename}
                      </h2>
                      <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                        {sheet.count} {sheet.unit}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                      {sheet.description}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={downloadingTab !== null}
                  onClick={() => void handleDownloadTabExcel(sheet.tab)}
                  className="self-start sm:self-center px-3.5 py-2 text-xs font-semibold text-zinc-800 bg-stone-100 hover:bg-stone-200/80 active:scale-[0.99] border border-stone-200/80 rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all disabled:opacity-60 cursor-pointer"
                >
                  {isBusyThis ? (
                    <Loader2 className="w-3.5 h-3.5 text-teal-700 animate-spin" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-teal-700" />
                  )}
                  <span>{isBusyThis ? 'Encrypting...' : `Download ${sheet.filename}`}</span>
                </button>
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
              Updated with 10 tabs (Students, Visits with Shift &amp; Stock linkage, Measurements, Health Profiles, Users, Medicines, Items, Stock Transactions, Bills, and Settings) plus automatic Google Drive bill photo archiving in &ldquo;SVA Infirmary Documents&rdquo;. Paste this updated Code.gs into Apps Script, run <code className="font-mono text-zinc-700">setupSpreadsheet</code> once to approve Drive access, and redeploy your Web App.
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
