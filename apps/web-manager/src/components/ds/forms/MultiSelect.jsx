import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../foundation/Icon';
import { Badge } from '../foundation/Badge';
import { useCM } from '../../../constants/useCM';

export const MultiSelect = ({
  options = [],
  value = [],
  onChange,
  placeholder = null,
  disabled = false,
  className = '',
}) => {
  const CM = useCM();
  const resolvedPlaceholder = placeholder ?? CM.selectOptionsPlaceholder;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggleOption = (optValue, e) => {
    e.stopPropagation();
    if (disabled) return;
    const isSelected = value.includes(optValue);
    if (isSelected) {
      onChange(value.filter(v => v !== optValue));
    } else {
      onChange([...value, optValue]);
    }
  };

  const removeOption = (optValue, e) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(value.filter(v => v !== optValue));
  };

  const selectedOptions = options.filter(opt => value.includes(opt.value));

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      <div
        className={`flex items-center justify-between w-full min-h-[36px] px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border rounded-md shadow-xs transition-shadow ${
          disabled 
            ? 'opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-800' 
            : `cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 ${isOpen ? 'border-amber-500 ring-1 ring-amber-500' : 'border-slate-200 dark:border-slate-800'}`
        }`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="flex flex-wrap gap-1 items-center flex-1">
          {selectedOptions.length === 0 ? (
            <span className="text-slate-400 dark:text-slate-500 py-0.5">{resolvedPlaceholder}</span>
          ) : (
            selectedOptions.map(opt => (
              <Badge key={opt.value} variant="default" size="sm" className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-normal pr-1 flex items-center gap-1">
                {opt.label}
                <button
                  type="button"
                  onClick={(e) => removeOption(opt.value, e)}
                  className="text-slate-400 hover:text-rose-500 transition-colors bg-white dark:bg-slate-900 rounded-full p-0.5"
                >
                  <Icon name="close" size="sm" className="text-12"  weight={300} />
                </button>
              </Badge>
            ))
          )}
        </div>
        <Icon name="expand_more" size="sm" className={`text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}  weight={300} />
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500 italic">{CM.noOptionsLabel}</div>
          ) : (
            options.map((option) => {
              const isSelected = value.includes(option.value);
              return (
                <div
                  key={option.value}
                  className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-500 font-medium'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                  onClick={(e) => toggleOption(option.value, e)}
                >
                  <div className={`flex items-center justify-center w-4 h-4 border rounded-sm shadow-xs text-white ${isSelected ? 'bg-amber-600 border-amber-600' : 'border-slate-300 dark:border-slate-600 bg-transparent'}`}>
                    {isSelected && <Icon name="check" size="sm" className="text-14"  weight={300} />}
                  </div>
                  {option.label}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
