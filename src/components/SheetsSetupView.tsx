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

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-stone-200/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 font-display tracking-tight">
            Google Sheets Backend &amp; App Guide
          </h1>
          <p className="text-sm text-zinc-600 mt-1">
            Simple overview of how your school data stays in sync and how staff can use the infirmary app every day.
          </p>
        </div>
        <div className="text-xs font-mono tabular-nums text-zinc-600 shrink-0">
          <span>{db.students.length} students</span>
          <span aria-hidden="true" className="mx-1.5">·</span>
          <span>{db.visits.length} visits</span>
          <span aria-hidden="true" className="mx-1.5">·</span>
          <span>{db.measurements.length} measurements</span>
        </div>
      </div>

      {/* 1. Simple Info: How the Backend Works */}
      <section className="bg-white border border-stone-200/80 rounded-2xl p-5 sm:p-7 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 font-display">
            How the Backend Works (In Simple Terms)
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Everything runs automatically in the background—staff never need to press a manual upload button or sign in.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 pt-2 border-t border-stone-100">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-900">
              01. Instant Phone &amp; Laptop Sync
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed">
              When you save a visit or student update on any phone or computer, it goes to the app server first and appears on every other staff member&apos;s screen within a second.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-900">
              02. Automatic Google Sheet Saving
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed">
              At the exact same time, the server forwards that record to your Google Sheet (into the <span className="font-mono text-zinc-800">Visits</span>, <span className="font-mono text-zinc-800">Measurements</span>, <span className="font-mono text-zinc-800">Health Profiles</span>, or <span className="font-mono text-zinc-800">Students</span> tab).
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-900">
              03. Reading Edits from Google Sheets
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Every 15 seconds, the app checks your Google Sheet. If you add new students or edit class sections directly in the spreadsheet, those changes automatically show up in the app.
            </p>
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-900">
              04. Built-In Phone Backup
            </h3>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Each phone also keeps a safe copy in its browser memory. If internet is slow when a visit is recorded, the app automatically pushes the missing report to the Google Sheet next time it connects.
            </p>
          </div>
        </div>
      </section>

      {/* 2. Simple Guide: How to Use This Web App */}
      <section className="bg-white border border-stone-200/80 rounded-2xl p-5 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 font-display">
              Simple Guide: How to Use This Web App
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Quick 4-step instructions for school nurses, teachers, and office staff.
            </p>
          </div>
          {onBackToHome && (
            <button
              type="button"
              onClick={onBackToHome}
              className="self-start sm:self-center px-3.5 py-2 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100/80 rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              Open Infirmary Home
            </button>
          )}
        </div>

        <div className="divide-y divide-stone-100 border-t border-stone-100">
          <div className="py-3.5 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
            <span className="text-xs font-semibold text-teal-800 sm:w-48 shrink-0">
              Step 1 · Find a Student
            </span>
            <p className="text-xs text-zinc-600 leading-relaxed">
              On the <strong>Infirmary</strong> home screen, type the student&apos;s name, roll number, or section (for example, <em>Sparkle</em> or <em>Grade 5</em>) in the search box. You can also add a new student anytime using the <strong>+ Add Student</strong> button.
            </p>
          </div>

          <div className="py-3.5 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
            <span className="text-xs font-semibold text-teal-800 sm:w-48 shrink-0">
              Step 2 · Record a Visit
            </span>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Click <strong>Record Visit</strong> next to any student. Pick the reason for the visit (such as Fever, Headache, or First Aid), enter temperature or vitals if taken, note the medicine/care given, and tap <strong>Save Visit</strong>.
            </p>
          </div>

          <div className="py-3.5 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
            <span className="text-xs font-semibold text-teal-800 sm:w-48 shrink-0">
              Step 3 · Track Health &amp; Growth
            </span>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Tap a student&apos;s name to open their <strong>Student Profile</strong>. Here you can view past infirmary visits, log height and weight (BMI is calculated automatically), or record allergies, blood group, and parent contact numbers.
            </p>
          </div>

          <div className="py-3.5 pt-3.5 pb-1 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
            <span className="text-xs font-semibold text-teal-800 sm:w-48 shrink-0">
              Step 4 · View &amp; Print Reports
            </span>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Open <strong>Daily Log</strong> at the top of the page to see all visits by date, print a Parent Notification Slip after a visit, print the full infirmary register, or download CSV backups below.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Official School Google Sheet Connection & CSV Tab Exports */}
      <section className="bg-white border border-stone-200/80 rounded-2xl p-5 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 font-display">
              Official School Google Sheet Connection
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Permanently linked to {SCHOOL_NAME}&apos;s Google Sheet backend (URL editing is locked so the link cannot be accidentally changed).
            </p>
          </div>
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            title="Test connection or force immediate sync check"
            className="self-start sm:self-center px-3.5 py-2 text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200/80 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Checking...' : 'Check Connection Now'}</span>
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
              Apps Script Backend (Code.gs)
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
