import { useState, useRef, useEffect } from 'react';
import { Icon } from '../ds/foundation/Icon';

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
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  
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
  };

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full h-9 rounded-lg px-3 py-1.5 text-14 font-semibold outline-none transition-all flex items-center justify-between border
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
        <div className="absolute top-[calc(100%+4px)] left-0 w-full mt-0 z-[100] bg-white dark:bg-bk-side border border-slate-200 dark:border-white/10 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {options.length === 0 ? (
              <div className="px-4 py-3 text-12 text-slate-500 italic text-center uppercase tracking-widest">No options available</div>
            ) : (
              <div className="p-1.5 flex flex-col gap-0.5">
                {options.map((opt) => {
                  const isActive = value === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelect(opt.value)}
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
