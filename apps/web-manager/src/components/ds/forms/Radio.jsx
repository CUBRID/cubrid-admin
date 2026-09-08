import React from 'react';
import { Typography } from '../foundation/Typography';

export const Radio = ({
  label,
  value,
  checked = false,
  onChange,
  disabled = false,
  name,
  className = '',
}) => {
  return (
    <label className={`group flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      <div className="relative flex items-center justify-center">
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={(e) => onChange && onChange(e.target.value)}
          disabled={disabled}
          className="peer sr-only"
        />
        <div className="w-4.5 h-4.5 rounded-full border border-slate-300 dark:border-white/25 transition-all bg-white dark:bg-white/10 shadow-xs group-hover:border-amber-500/50 dark:group-hover:border-amber-500/50 peer-checked:border-amber-500 dark:peer-checked:border-amber-500"></div>
        <div className="absolute w-2 h-2 rounded-full bg-amber-500 transition-transform scale-0 peer-checked:scale-100 flex items-center justify-center shadow-xs shadow-amber-500/20"></div>
      </div>
      {label && <Typography variant="label" className="select-none text-14 font-medium text-slate-700 dark:text-slate-200 tracking-normal">{label}</Typography>}
    </label>
  );

};

export const RadioGroup = ({
  options = [],
  value,
  onChange,
  name,
  direction = 'col',
  className = '',
}) => {
  return (
    <div className={`flex ${direction === 'row' ? 'flex-row gap-4' : 'flex-col gap-2'} ${className}`}>
      {options.map((opt) => (
        <Radio
          key={opt.value}
          name={name}
          label={opt.label}
          value={opt.value}
          checked={value === opt.value}
          onChange={onChange}
          disabled={opt.disabled}
        />
      ))}
    </div>
  );
};
