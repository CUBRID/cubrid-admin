import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../ds/foundation/Icon';
import { useCM } from '../../constants/useCM';

/**
 * Premium Select Field Component - Standardized for CUBRID "Pro IDE" aesthetic
 * Uses bk-yellow (Amber) as the primary brand highlight color.
 */
export default function SelectField({ 
  value, 
  onChange, 
  options = [], 
  className = '', 
  triggerClassName = '',
  disabled = false,
  placeholder = 'Select option',
  isHighlight = true
}) {
  const CM = useCM();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const listboxId = useId();
  
  const selectedOption = options.find(opt => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (val) => {
    if (disabled) return;
    onChange(val);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const openList = (preferredIndex) => {
    if (disabled || options.length === 0) return;
    const selectedIndex = options.findIndex(opt => opt.value === value);
    const nextIndex = preferredIndex ?? (selectedIndex >= 0 ? selectedIndex : 0);
    setActiveIndex(nextIndex);
    setIsOpen(true);
    requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus());
  };

  const handleKeyDown = (event) => {
    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openList(event.key === 'ArrowUp' ? options.length - 1 : undefined);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'Tab') {
      setIsOpen(false);
      return;
    }
    if (event.key === 'Home' || event.key === 'End' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      let nextIndex = activeIndex;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = options.length - 1;
      if (event.key === 'ArrowDown') nextIndex = (activeIndex + 1) % options.length;
      if (event.key === 'ArrowUp') nextIndex = (activeIndex - 1 + options.length) % options.length;
      setActiveIndex(nextIndex);
      optionRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div className={`relative w-full ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => isOpen ? setIsOpen(false) : openList()}
        className={`
          w-full h-9 rounded-lg px-3 py-1.5 text-14 font-semibold transition-all flex items-center justify-between border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-bk-side
          ${!isHighlight 
            ? 'bg-slate-50/50 dark:bg-white/5 border-slate-100 dark:border-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8' 
            : 'bg-white dark:bg-bk-side border-amber-500/20 dark:border-white/10 text-slate-700 dark:text-slate-100 dark:focus:border-bk-yellow focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 dark:focus:ring-bk-yellow/10'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${isOpen && isHighlight ? 'ring-4 ring-amber-500/10 border-amber-500/50 dark:ring-bk-yellow/10 dark:border-bk-yellow/50' : ''}
          ${triggerClassName}
        `}
      >
        <span className="truncate">{displayLabel}</span>
        <Icon 
          name="expand_more" 
          size="19px"
          weight={300} 
          className={`transition-transform duration-200 text-slate-400 ${isOpen ? 'rotate-180 text-amber-500 dark:text-bk-yellow' : ''}`} 
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div id={listboxId} role="listbox" aria-label={placeholder} className="absolute top-[calc(100%+4px)] left-0 w-full mt-0 z-[100] bg-white dark:bg-bk-side border border-slate-200 dark:border-white/10 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {options.length === 0 ? (
              <div className="px-4 py-3 text-12 text-slate-500 italic text-center uppercase tracking-widest">{CM.noOptionsAvailableLabel}</div>
            ) : (
              <div className="p-1.5 flex flex-col gap-0.5">
                {options.map((opt) => {
                  const isActive = value === opt.value;
                  return (
                    <button
                      ref={(node) => { optionRefs.current[options.indexOf(opt)] = node; }}
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleSelect(opt.value)}
                      onFocus={() => setActiveIndex(options.indexOf(opt))}
                      className={`
                        w-full px-3 py-2 text-left text-14 font-semibold rounded-lg transition-all flex items-center justify-between group
                        ${isActive 
                          ? 'bg-amber-500 dark:bg-bk-yellow text-white dark:text-bk-side' 
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                        }
                      `}
                    >
                      <span>{opt.label}</span>
                      {isActive && (
                        <Icon name="check" size="15px" weight={400} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
