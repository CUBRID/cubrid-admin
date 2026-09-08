import { useState, useRef, useEffect } from 'react';

import { Icon } from '../ds/foundation/Icon';

/**
 * Premium Custom Select Component
 * Aligned with the "Technical Compact" and "High-End Dark" design system.
 */
export default function CustomSelect({ 
  value, 
  onChange, 
  options = [], 
  width = 'w-full',
  labelField = 'label',
  valueField = 'value'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt[valueField] === value) || options[0];

  const handleSelect = (option) => {
    onChange({ target: { value: option[valueField] } });
    setIsOpen(false);
  };

  return (
    <div className={`relative ${width} font-sans`} ref={dropdownRef}>
      {/* Target/Display Area */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full h-8 flex items-center justify-between px-3 
          bg-slate-50 dark:bg-bk-main/40 
          border border-slate-200 dark:border-white/10
          rounded-lg text-13 font-bold transition-all duration-200
          ${isOpen ? 'border-bk-yellow/50 ring-2 ring-bk-yellow/10 ring-offset-0' : 'hover:border-white/20'}
          dark:text-slate-300
        `}
      >
        <span className="truncate">{selectedOption ? selectedOption[labelField] : 'Select...'}</span>
        <span className={`material-symbols-outlined text-18 transition-transform duration-300 ${isOpen ? 'rotate-180 text-bk-yellow' : 'text-slate-500'}`}>
          expand_more
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div 
          className="
            absolute left-0 right-0 top-full mt-1.5 
            bg-white dark:bg-bk-side 
            border border-slate-200 dark:border-white/10 
            rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.3)] 
            z-100 overflow-hidden p-1
            animate-in fade-in zoom-in-95 duration-150
          "
        >
          {/* Subtle Glow Accent */}
          <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-linear-to-r from-transparent via-bk-yellow/40 to-transparent"></div>

          <div className="max-h-60 overflow-y-auto space-y-0.5 custom-scrollbar">
            {options.map((option, idx) => {
              const isActive = option[valueField] === value;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(option)}
                  className={`
                    w-full text-left px-3 py-1.5 rounded-lg text-13 font-medium transition-all
                    ${isActive 
                      ? 'bg-bk-yellow text-bk-main shadow-lg shadow-bk-yellow/10' 
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white/5 hover:text-bk-yellow'}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span>{option[labelField]}</span>
                    {isActive && (
                      <Icon name="check" size="sm" weight={300} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
