import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface CustomSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  variant?: 'default' | 'subtle';
  className?: string;
  menuMinWidth?: number;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select...',
  ariaLabel,
  disabled = false,
  size = 'md',
  variant = 'default',
  className = '',
  menuMinWidth,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const generatedId = useId();
  const listboxId = `${id || generatedId}-listbox`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && listRef.current && highlightedIndex >= 0) {
      const itemEl = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      if (itemEl && typeof itemEl.scrollIntoView === 'function') {
        itemEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isOpen, highlightedIndex]);

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % Math.max(1, options.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + Math.max(1, options.length)) % Math.max(1, options.length));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < options.length) {
        handleSelect(options[highlightedIndex].value);
      }
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  const heightClasses = size === 'sm' ? 'h-9 px-3 text-xs' : 'h-10 px-3.5 text-xs';
  const surfaceClasses =
    variant === 'subtle'
      ? 'bg-zinc-50/70 hover:bg-zinc-100/70 border-zinc-200/90'
      : 'bg-white hover:bg-zinc-50/80 border-zinc-200/90';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className={`w-full ${heightClasses} ${surfaceClasses} border rounded-xl font-medium text-zinc-800 flex items-center justify-between gap-2 transition-all focus:outline-none focus:bg-white focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none`}
      >
        <span className={`truncate text-left ${selectedOption ? 'text-zinc-900' : 'text-zinc-400'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-zinc-800' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          style={menuMinWidth ? { minWidth: `${menuMinWidth}px` } : undefined}
          className="absolute left-0 right-0 z-50 mt-1.5 max-h-64 overflow-y-auto bg-white border border-zinc-200/90 rounded-xl shadow-[0_12px_32px_-8px_rgba(0,0,0,0.12)] p-1 divide-y divide-zinc-50"
        >
          {options.map((opt, idx) => {
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
                className={`w-full px-3 py-2 rounded-lg text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-100/90 text-zinc-950 font-semibold'
                    : isHighlighted
                      ? 'bg-zinc-50 text-zinc-900 font-medium'
                      : 'text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate">{opt.label}</span>
                  {opt.sublabel && (
                    <span className="block text-[10px] text-zinc-400 truncate mt-0.5">
                      {opt.sublabel}
                    </span>
                  )}
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-zinc-900 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
