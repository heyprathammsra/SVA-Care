import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  titleId?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  zIndexClass?: string;
}

export const ModalDialog: React.FC<ModalDialogProps> = ({
  open,
  onClose,
  title,
  subtitle,
  titleId,
  maxWidthClass = 'max-w-lg',
  children,
  footer,
  zIndexClass = 'z-50',
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-950/35 backdrop-blur-[2px] animate-in fade-in duration-150`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full ${maxWidthClass} max-h-[92dvh] sm:max-h-[86vh] flex flex-col bg-white border-t sm:border border-zinc-200/90 rounded-t-2xl sm:rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.14)] overflow-hidden`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-100 flex items-start justify-between gap-4 shrink-0 bg-white">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-base font-semibold text-zinc-950 font-display tracking-tight leading-snug truncate"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100/80 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 overscroll-contain">
          {children}
        </div>

        {/* Sticky Footer */}
        {footer && (
          <div className="px-5 py-3.5 bg-zinc-50/70 border-t border-zinc-100 flex items-center justify-end gap-2.5 shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom,0px))] sm:pb-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
