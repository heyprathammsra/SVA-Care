import React, { useState } from 'react';
import {
  Copy,
  Check,
  Download,
  RefreshCw,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { GOOGLE_APPS_SCRIPT_CODE, exportSheetTabToCsv } from '../utils/appsScriptTemplate';
import type { NurseDatabase } from '../utils/nurseLogic';
import { SCHOOL_NAME } from '../utils/seedData';

interface SheetsSetupViewProps {
  db: NurseDatabase;
  appsScriptUrl: string;
  onSaveAppsScriptUrl: (url: string) => void;
  onSyncFromSheets: () => Promise<void>;
  onPushToSheets?: () => Promise<void>;
  autoSyncEnabled?: boolean;
  onToggleAutoSync?: (enabled: boolean) => void;
  syncStatusMessage: string | null;
  onBackToHome?: () => void;
}

export const SheetsSetupView: React.FC<SheetsSetupViewProps> = ({
  db,
  appsScriptUrl,
  onSaveAppsScriptUrl,
  onSyncFromSheets,
  onPushToSheets,
  autoSyncEnabled = true,
  onToggleAutoSync,
  syncStatusMessage,
  onBackToHome,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showScriptCode, setShowScriptCode] = useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadTabCsv = (
    tab: 'Students' | 'Visits' | 'Measurements' | 'Health Profiles'
  ) => {
    const csvContent = exportSheetTabToCsv(db, tab);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SVA_${tab.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await onSyncFromSheets();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {onBackToHome && (
        <div className="hidden sm:block">
          <button
            type="button"
            onClick={onBackToHome}
            className="px-3.5 py-2 text-xs font-medium text-zinc-700 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Infirmary
          </button>
        </div>
      )}

      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 font-display tracking-tight">
          Multi-Device &amp; Google Sheets Sync
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          All school phones and laptops share live data automatically without needing a Google login.
        </p>
      </div>

      {/* Live Multi-Device Shared Database Banner */}
      <div className="bg-teal-50/70 border border-teal-200/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
            <span className="text-xs font-bold text-teal-900 uppercase tracking-wider">
              Live School Sync Active (No Login Needed)
            </span>
          </div>
          <p className="text-xs text-teal-800/90 leading-relaxed">
            School staff on separate phones or laptops see and update the exact same student and visit records in real time. Your official Google Sheet connection is permanently linked and locked across all school devices.
          </p>
        </div>
        <div className="text-xs font-mono font-semibold text-teal-900 bg-white/90 border border-teal-200/70 px-3 py-2 rounded-xl shrink-0 self-start sm:self-center">
          {db.students.length} students · {db.visits.length} visits
        </div>
      </div>

      {/* 1. Live Google Apps Script Connection & CSV Tab Exports */}
      <section className="bg-white border border-stone-200/80 rounded-2xl p-5 sm:p-7 shadow-[0_4px_24px_rgb(0,0,0,0.02)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 font-display">
              Official School Google Sheet Connection
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Permanently linked to Saraswati Vidya Academy&apos;s Google Sheet backend (URL editing is disabled to prevent accidental changes).
            </p>
          </div>
        </div>

        {/* Automated Background Sync Live Status Card */}
        <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-3">
            <span className="relative flex h-3 w-3 mt-1 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-600"></span>
            </span>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                  Automated Continuous Sync Active
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300/60">
                  Locked &amp; Always On
                </span>
              </div>
              <p className="text-xs text-emerald-900/90 leading-relaxed">
                Automatic bidirectional sync is running. All student visits and updates push to Google Sheets instantly upon saving, and edits from the Sheet auto-sync every 15 seconds.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            title="Test connection or force immediate sync check"
            className="self-start sm:self-center px-3 py-1.5 text-xs font-medium text-emerald-900 bg-white border border-emerald-200/90 rounded-xl hover:bg-emerald-50 transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Check Connection'}</span>
          </button>
        </div>

        {syncStatusMessage && (
          <p className="text-xs font-mono text-zinc-600 bg-stone-50 px-3.5 py-2.5 rounded-xl border border-stone-200/70">
            {syncStatusMessage}
          </p>
        )}

        <div className="pt-5 border-t border-stone-100">
          <p className="text-xs font-semibold text-zinc-700 mb-3">
            Download Spreadsheet Tabs (CSV)
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {(['Students', 'Visits', 'Measurements', 'Health Profiles'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => handleDownloadTabCsv(tab)}
                className="px-3.5 py-2 text-xs font-medium text-zinc-700 bg-stone-100/80 hover:bg-stone-200/70 rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-zinc-500" />
                {tab}.csv
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Collapsible Backend Code & Setup Summary */}
      <section className="bg-white border border-stone-200/80 rounded-2xl p-6 sm:p-7 shadow-[0_4px_24px_rgb(0,0,0,0.02)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 font-display">
              Apps Script Backend (`Code.gs`)
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Open your Google Sheet &rarr; Extensions &rarr; Apps Script, paste this script, run <code>setupSpreadsheet</code> once, and deploy as a Web App.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowScriptCode((v) => !v)}
              className="px-3 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-stone-50 hover:bg-stone-100 border border-stone-200/80 rounded-xl flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
            >
              {showScriptCode ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Hide Code.gs
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  View Code.gs
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-3.5 py-2 text-xs font-semibold text-zinc-900 bg-stone-100 hover:bg-stone-200/80 rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-teal-700" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCode ? 'Copied Code.gs' : 'Copy Code.gs'}
            </button>
          </div>
        </div>

        {showScriptCode && (
          <pre className="p-4 bg-zinc-900 text-zinc-100 rounded-xl text-[11px] font-mono overflow-x-auto max-h-72 leading-relaxed">
            <code>{GOOGLE_APPS_SCRIPT_CODE}</code>
          </pre>
        )}
      </section>
    </div>
  );
};
