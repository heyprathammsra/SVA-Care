import React, { useState } from 'react';
import { Smartphone, Download, X, Share, PlusSquare } from 'lucide-react';
import { usePWAInstall } from '../utils/usePWAInstall';

export function PWAInstallButton({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as installed standalone PWA, hide
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Chrome / Edge flow
  if (isInstallable) {
    if (variant === 'mobile') {
      return (
        <button
          type="button"
          onClick={install}
          aria-label="Install App"
          className="h-8 px-2.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold flex items-center gap-1 active:bg-teal-100 transition-colors shadow-2xs"
        >
          <Download className="w-3.5 h-3.5 stroke-[2.25]" />
          <span>Install</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={install}
        aria-label="Install Infirmary App"
        className="h-9 px-3 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
      >
        <Smartphone className="w-3.5 h-3.5 text-teal-700 stroke-[2.25]" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow (WebKit uses Share > Add to Home Screen)
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Add to Home Screen"
          className={
            variant === 'mobile'
              ? 'h-8 px-2 rounded-lg bg-stone-100 border border-stone-200 text-stone-700 text-xs font-medium flex items-center gap-1'
              : 'h-9 px-3 rounded-xl bg-stone-100 hover:bg-stone-200/80 border border-stone-200 text-stone-800 text-xs font-medium flex items-center gap-1.5 transition-colors'
          }
        >
          <Smartphone className="w-3.5 h-3.5 text-stone-600" />
          <span>{variant === 'mobile' ? 'App' : 'Add to Home'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl border border-stone-200 relative">
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-4 right-4 p-1 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <img src="/pwa-192x192.png" alt="SVA Infirmary Icon" className="w-12 h-12 rounded-xl shadow-xs" />
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Add to iPhone / iPad</h3>
                  <p className="text-xs text-stone-500">Install as standalone clinic app</p>
                </div>
              </div>

              <div className="space-y-2.5 text-xs text-stone-700 bg-stone-50 p-3.5 rounded-xl border border-stone-200/80">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-teal-800">1.</span>
                  <span>
                    Tap the <Share className="w-3.5 h-3.5 inline mx-1 text-teal-700" /> <strong>Share</strong> button in the Safari bottom bar.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-teal-800">2.</span>
                  <span>
                    Scroll down and tap <PlusSquare className="w-3.5 h-3.5 inline mx-1 text-teal-700" /> <strong>Add to Home Screen</strong>.
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full mt-4 py-2.5 bg-stone-900 text-white rounded-xl text-xs font-semibold hover:bg-black transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
