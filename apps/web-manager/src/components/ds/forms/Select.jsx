import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../foundation/Icon';
import { Typography } from '../foundation/Typography';
import { FormField } from './FormField';
import { useCM } from '../../../constants/useCM';

export const Select = ({
  label,
  description,
  error,
  required,
  options = [],
  className = '',
  size = 'md', // 'sm' | 'md'
  disabled = false,
  value,
  onChange,
  placeholder = null,
  icon,
  testId,
}) => {
  const CM = useCM();
  const resolvedPlaceholder = placeholder ?? CM.selectOptionPlaceholder;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({});

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const updateDropdownPosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        // minWidth (not width) lets the popup grow to fit longer option
        // labels instead of truncating them down to the trigger's own width
        // — a narrow trigger (e.g. sharing a row with another field) would
        // otherwise clip labels like "Specific days".
        minWidth: rect.width,
        maxWidth: Math.max(rect.width, 320),
        zIndex: 9999,
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
      window.addEventListener('scroll', updateDropdownPosition, true);
      window.addEventListener('resize', updateDropdownPosition);
    }
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (option) => {
    if (disabled || option.disabled) return;
    onChange({ target: { value: option.value } });
    setIsOpen(false);
  };

  const isSm = size === 'sm';

  const dropdown = isOpen ? createPortal(
    <div
      data-testid={testId && `${testId}-options`}
      style={dropdownStyle}
      className="bg-white dark:bg-[#1A1C1E] border border-slate-200 dark:border-white/10 rounded-lg shadow-[0_12px_40px_rgba(0,0,0,0.35)] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
    >
      <div className="p-1 px-1.5 max-h-[190px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-white/10 scrollbar-track-transparent flex flex-col gap-0.5">
        {options.length === 0 ? (
          <div className="px-3 py-2 text-12 text-slate-400 italic">{CM.noOptionsAvailableLabel}</div>
        ) : (
          options.map((opt) => (
            <div
              key={opt.value}
              data-testid={testId && `${testId}-option-${opt.value}`}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
              className={`flex items-center justify-between px-3 h-9 rounded-lg text-15 font-medium transition-all cursor-pointer group relative overflow-hidden ${opt.value === value
                  ? 'bg-amber-500/8 text-amber-500'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/4 hover:text-slate-900 dark:hover:text-white'
                } ${opt.disabled ? 'opacity-30 cursor-not-allowed' : ''
                }`}
            >
              {opt.value === value && (
                <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-amber-500 rounded-r-full" />
              )}
              <span className="truncate">{opt.label}</span>
            </div>
          ))
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <FormField label={label} description={description} error={error} required={required} className={className}>
      <div className="relative group" ref={containerRef}>
        <button
          type="button"
          data-testid={testId}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`relative w-full ${icon ? 'pl-11' : 'pl-3.5'} pr-10 ${isSm ? 'h-8 text-14' : 'h-10 text-15'} font-medium text-left bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/10 rounded-xl transition-all outline-hidden
            ${isOpen ? 'border-amber-500 ring-4 ring-amber-500/10' : 'hover:border-slate-300 dark:hover:border-white/20'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {icon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Icon name={icon} size={isSm ? '14px' : '18px'} weight={300} />
            </div>
          )}
          <span className={`block truncate ${!selectedOption ? 'text-slate-400' : 'text-slate-900 dark:text-slate-200'}`}>
            {selectedOption ? selectedOption.label : resolvedPlaceholder}
          </span>
          <div
            className="absolute right-3 top-1/2 flex items-center justify-center w-5 h-5 text-slate-400 pointer-events-none transition-transform duration-200"
            style={{ transform: `translateY(-50%) ${isOpen ? 'rotate(180deg)' : ''}` }}
          >
            <Icon name="expand_more" size="19px" />
          </div>
        </button>
        {dropdown}
      </div>
    </FormField>
  );
};
