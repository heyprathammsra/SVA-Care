import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface CustomSelectProps {
  id?: string;
  ariaLabel?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  variant?: 'default' | 'subtle';
  className?: string;
  menuMinWidth?: number;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  id,
  ariaLabel,
  value,
  options,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  size = 'md',
  variant = 'default',
  className = '',
  menuMinWidth,
}) => {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    placement: 'bottom' | 'top';
    maxHeight: number;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || null;
  const selectedIndex = options.findIndex((opt) => opt.value === value);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const estimatedHeight = Math.min(options.length * 38 + 14, 280);
    const placement: 'bottom' | 'top' =
      spaceBelow < estimatedHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';
    const maxHeight = Math.max(
      140,
      Math.min(280, placement === 'bottom' ? spaceBelow : spaceAbove)
    );
    const width = Math.max(rect.width, menuMinWidth || 0);
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
    const top = placement === 'bottom' ? rect.bottom + 6 : rect.top - 6;

    setCoords({ top, left, width, placement, maxHeight });
  }, [options.length, menuMinWidth]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleScrollOrResize = (event: Event) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) {
        return;
      }
      updatePosition();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [open, selectedIndex, updatePosition]);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % Math.max(1, options.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + options.length) % Math.max(1, options.length));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const target = options[highlightedIndex];
      if (target) handleSelect(target.value);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const sizeClasses =
    size === 'sm'
      ? 'h-8 px-2.5 text-xs rounded-lg gap-1.5'
      : 'h-10 px-3 text-xs sm:text-[13px] rounded-xl gap-2';

  const variantClasses =
    variant === 'subtle'
      ? 'bg-stone-50/90 hover:bg-white border-stone-200/90 hover:border-stone-300'
      : 'bg-white hover:bg-stone-50/60 border-stone-200/90 hover:border-stone-300 shadow-[0_1px_2px_rgba(24,24,27,0.03)]';

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={`inline-flex items-center justify-between border font-medium text-zinc-800 transition-all duration-150 focus:outline-none focus-visible:border-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${sizeClasses} ${variantClasses} ${
          open ? 'border-zinc-900 bg-white ring-2 ring-zinc-900/10' : ''
        } ${className}`}
      >
        <span className={`truncate text-left ${selectedOption ? 'text-zinc-900' : 'text-zinc-400'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180 text-zinc-700' : ''
          }`}
        />
      </button>

      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: 'fixed',
              top: coords.placement === 'bottom' ? coords.top : undefined,
              bottom:
                coords.placement === 'top'
                  ? window.innerHeight - coords.top
                  : undefined,
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
              zIndex: 9999,
            }}
            className="dropdown-panel-animate bg-white/98 backdrop-blur-md border border-stone-200/95 rounded-xl shadow-[0_16px_40px_-10px_rgba(24,24,27,0.18),0_4px_12px_-4px_rgba(24,24,27,0.06)] p-1.5 overflow-y-auto overscroll-contain"
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-400 text-center">No options</div>
            ) : (
              options.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={`${opt.value}-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full px-2.5 py-2 rounded-lg text-left text-xs sm:text-[13px] flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-teal-50/90 text-teal-900 font-semibold'
                        : isHighlighted
                          ? 'bg-stone-100/90 text-zinc-900 font-medium'
                          : 'text-zinc-700 hover:bg-stone-100/70'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate">{opt.label}</span>
                      {opt.sublabel && (
                        <span className="block text-[11px] font-normal text-zinc-400 truncate mt-0.5">
                          {opt.sublabel}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-teal-700 shrink-0 stroke-[2.5]" />
                    )}
                  </button>
                );
              })
            )}
          </div>,
          document.body
        )}
    </>
  );
};
