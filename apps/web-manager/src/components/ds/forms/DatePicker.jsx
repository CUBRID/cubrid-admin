import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSelector, shallowEqual } from 'react-redux';
import { FormField } from './FormField';
import { Icon } from '../foundation/Icon';
import { Typography } from '../foundation/Typography';
import { useCM } from '../../../constants/useCM';

export const DatePicker = ({
  label,
  description,
  error,
  required,
  value,
  onChange,
  icon = "calendar_today",
  className = "",
  disabled = false,
  ...props
}) => {
  const CM = useCM();
  const locale = useSelector(
    (state) => state.user?.preferences?.uiLocale ?? 'en',
    shallowEqual
  );
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const [viewDate, setViewDate] = useState(new Date(value || new Date()));
  const buttonRef = useRef(null);
  const containerRef = useRef(null);

  // Compute position from button's screen rect before opening
  const openDropdown = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    
    // Ensure viewDate is synced with current value when opening
    if (value) {
      setViewDate(new Date(value));
    }
    
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: '280px', // Fixed width for calendar
      zIndex: 9999,
    });
    setIsOpen(true);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current && !containerRef.current.contains(event.target) &&
        !document.getElementById('datepicker-portal-root')?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    const handleScroll = () => setIsOpen(false);
    if (isOpen) {
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  const handleDateSelect = (dateStr) => {
    if (disabled) return;
    if (onChange) {
      onChange({ target: { value: dateStr, name: props.name } });
    }
    setIsOpen(false);
  };

  // Calendar logic
  const daysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (month, year) => new Date(year, month, 1).getDay();

  const calendarDays = [];
  const totalDays = daysInMonth(viewDate.getMonth(), viewDate.getFullYear());
  const offset = firstDayOfMonth(viewDate.getMonth(), viewDate.getFullYear());

  // Padding for empty start of month
  for (let i = 0; i < offset; i++) {
    calendarDays.push(null);
  }
  // Actual days
  for (let d = 1; d <= totalDays; d++) {
    calendarDays.push(d);
  }

  const dropdownEl = isOpen ? createPortal(
    <div
      id="datepicker-portal-root"
      style={dropdownStyle}
      className="bg-white dark:bg-bk-side border border-slate-200 dark:border-slate-800 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] p-4 animate-in fade-in zoom-in-95 duration-200"
    >
      <div className="flex items-center justify-between mb-4 px-1">
        <button 
          type="button"
          onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} 
          className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
        >
          <Icon name="chevron_left" size="sm" />
        </button>
        <Typography variant="span" className="text-14 font-black tracking-tight text-slate-900 dark:text-white">
          {viewDate.toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US', { month: 'long', year: 'numeric' })}
        </Typography>
        <button 
          type="button"
          onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} 
          className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
        >
          <Icon name="chevron_right" size="sm" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {['S','M','T','W','T','F','S'].map(d => (
          <div key={d} className="h-8 mb-1 flex items-center justify-center text-12 font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{d}</div>
        ))}
        {calendarDays.map((d, index) => {
          if (d === null) return <div key={`empty-${index}`} />;
          
          const ds = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const isSelected = value === ds;
          
          return (
            <button 
              key={ds} 
              type="button"
              onClick={() => handleDateSelect(ds)} 
              className={`h-9 rounded-xl text-13 font-black transition-all cursor-pointer border ${isSelected ? 'bg-amber-500/15 dark:bg-amber-500/25 text-amber-600 dark:text-amber-400 border-amber-500/30' : 'bg-transparent border-transparent hover:bg-amber-500/10 text-slate-600 dark:text-slate-300 font-bold'}`}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <FormField label={label} description={description} error={error} required={required} className={className}>
      <div className="relative group" ref={containerRef}>
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && (isOpen ? setIsOpen(false) : openDropdown())}
          className={`relative w-full h-10 px-4 flex items-center justify-between bg-slate-50 dark:bg-white/3 border rounded-xl transition-all font-bold text-15 cursor-pointer ${
            isOpen ? 'border-amber-500/60 ring-4 ring-amber-500/10' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <span className="flex items-center gap-3">
            <Icon name={icon} size="sm" weight={300} className="text-amber-500" />
            <span className={value ? 'font-mono text-slate-900 dark:text-slate-100' : 'text-slate-400'}>
              {value || CM.selectDatePlaceholder}
            </span>
          </span>
          <Icon name="expand_more" size="sm" className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {dropdownEl}
      </div>
    </FormField>
  );
};
