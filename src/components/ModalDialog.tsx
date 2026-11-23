import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  maxWidthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  titleId?: string;
}

export const ModalDialog: React.FC<ModalDialogProps> = ({
  open,
  onClose,
  title,
  subtitle,
  icon,
  maxWidthClass = 'max-w-md',
  children,
  footer,
  titleId = 'modal-dialog-title',
}) => {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      className="modal-backdrop-animate fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-950/45 backdrop-blur-[3px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`modal-panel-animate bg-white w-full ${maxWidthClass} max-h-[92vh] sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-stone-200/90 shadow-[0_24px_64px_-16px_rgba(24,24,27,0.32),0_8px_24px_-8px_rgba(24,24,27,0.12)] overflow-hidden`}
      >
        {/* Mobile bottom-sheet drag handle */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-0.5 bg-white shrink-0" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-stone-300/90" />
        </div>

        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-stone-100 flex items-start justify-between gap-3 bg-white shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            {icon && (
              <div className="w-9 h-9 rounded-xl bg-stone-100/90 border border-stone-200/70 flex items-center justify-center shrink-0 mt-0.5">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3
                id={titleId}
                className="text-base font-semibold text-zinc-900 font-display tracking-tight leading-snug"
              >
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-800 hover:bg-stone-100 active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto smooth-scroll-list flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-4 sm:px-6 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom,0px))] sm:py-3.5 border-t border-stone-100 bg-stone-50/70 flex items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
