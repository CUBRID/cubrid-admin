import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FormField } from './FormField';
import { Icon } from '../foundation/Icon';
import { Typography } from '../foundation/Typography';

export const TimePicker = ({
  label,
  description,
  error,
  required,
  value, // "HH:MM"
  onChange,
  icon = "history_toggle_off",
  className = "",
  disabled = false,
  ...props
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const buttonRef = useRef(null);

  const openDropdown = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: '180px',
      zIndex: 9999,
    });
    setIsOpen(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        buttonRef.current && !buttonRef.current.contains(event.target) &&
        !document.getElementById('timepicker-portal-root')?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleTimeSelect = (type, val) => {
    const [h, m] = value.split(':');
    const newVal = type === 'h' ? `${val}:${m}` : `${h}:${val}`;
    if (onChange) {
      onChange({ target: { value: newVal, name: props.name } });
    }
    if (type === 'm') setIsOpen(false); // Close on minute selection
  };

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

  const dropdownEl = isOpen ? createPortal(
    <div
      id="timepicker-portal-root"
      style={dropdownStyle}
      className="bg-white dark:bg-bk-side border border-slate-200 dark:border-slate-800 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.35)] flex divide-x divide-slate-100 dark:divide-white/5 h-[260px] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
    >
      {/* Hours Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-2 py-2 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/2 flex justify-center sticky top-0 z-10">
          <Typography variant="span" className="text-11 font-black tracking-[0.2em] text-slate-400 dark:text-slate-500 uppercase">HH</Typography>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar-amber pt-1.5 pb-2">
          {hours.map(h => {
            const isSelected = value.startsWith(h);
            return (
              <button 
                key={h} 
                type="button" 
                onClick={() => handleTimeSelect('h', h)} 
                className={`w-full py-2.5 text-14 transition-colors cursor-pointer border-y border-transparent ${isSelected ? 'bg-amber-500/15 text-amber-600 border-amber-500/10 font-black' : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400 font-bold font-mono'}`}
              >
                {h}
              </button>
            );
          })}
        </div>
      </div>
      {/* Minutes Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-2 py-2 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/2 flex justify-center sticky top-0 z-10">
          <Typography variant="span" className="text-11 font-black tracking-[0.2em] text-slate-400 dark:text-slate-500 uppercase">MM</Typography>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar-amber pt-1.5 pb-2">
          {minutes.map(m => {
            const isSelected = value.endsWith(m);
            return (
              <button 
                key={m} 
                type="button" 
                onClick={() => handleTimeSelect('m', m)} 
                className={`w-full py-2.5 text-14 transition-colors cursor-pointer border-y border-transparent ${isSelected ? 'bg-amber-500/15 text-amber-600 border-amber-500/10 font-black' : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400 font-bold font-mono'}`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  // Typing directly needs its own draft state — committing on every
  // keystroke would reject "1", "14", "14:" etc. as invalid HH:MM and fight
  // the user, so only validate/commit once they're done (blur or Enter).
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  const commitDraft = () => {
    const match = draft.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/);
    if (match) {
      const normalized = `${match[1].padStart(2, '0')}:${match[2]}`;
      if (normalized !== value && onChange) {
        onChange({ target: { value: normalized, name: props.name } });
      }
      setDraft(normalized);
    } else {
      setDraft(value); // invalid — revert to last known-good value
    }
  };

  return (
    <FormField label={label} description={description} error={error} required={required} className={className}>
      <div
        ref={buttonRef}
        className={`relative w-full h-10 px-4 flex items-center justify-between bg-slate-50 dark:bg-white/3 border rounded-xl transition-all ${
          isOpen ? 'border-amber-500/60 ring-4 ring-amber-500/10' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${isOpen ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-100 dark:bg-white/5 text-slate-400'}`}>
            <Icon name={icon} size="15px" weight={300} />
          </div>
          <input
            type="text"
            inputMode="numeric"
            placeholder="HH:MM"
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
            className="font-mono font-bold text-15 tracking-tight text-slate-900 dark:text-slate-100 bg-transparent outline-none w-[52px] disabled:cursor-not-allowed"
          />
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && (isOpen ? setIsOpen(false) : openDropdown())}
          className={`flex items-center justify-center shrink-0 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <Icon name="expand_more" size="sm" className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180 text-amber-500' : ''}`} />
        </button>
        {dropdownEl}
      </div>
    </FormField>
  );
};
