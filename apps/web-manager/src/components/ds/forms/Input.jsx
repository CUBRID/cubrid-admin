import React, { forwardRef } from 'react';
import { FormField } from './FormField';
import { Icon } from '../foundation/Icon';

export const Input = forwardRef(({
  label,
  labelExtra,
  description,
  error,
  required,
  type = 'text',
  className = '',
  size = 'md',
  disabled = false,
  icon,
  onChange,
  value,
  suffix,
  inputClassName = '',
  ...props
}, ref) => {
  const isNumber = type === 'number';
  const isSm = size === 'sm';

  const handleAdjust = (delta) => {
    if (disabled || !onChange) return;
    const currentVal = parseFloat(value) || 0;
    const nextVal = Math.max(0, currentVal + delta);
    onChange({ target: { value: nextVal.toString(), name: props.name } });
  };

  return (
    <FormField 
      label={label} 
      labelExtra={labelExtra} 
      description={description} 
      error={error} 
      required={required} 
      className={className}
    >
      <div className="relative group flex items-center">
        {icon && (
          <div className={`absolute left-3 h-full flex items-center text-slate-400 group-focus-within:text-bk-yellow transition-colors pointer-events-none`}>
            <Icon name={icon} size={isSm ? "14px" : "md"} weight={300} />
          </div>
        )}
        <input
          ref={ref}
          type={type}
          disabled={disabled}
          value={value}
          title={type !== 'password' && (typeof value === 'string' || typeof value === 'number') ? String(value) : undefined}
          onChange={(e) => {
            if (type === 'number' && e.target.value.length > 1 && e.target.value.startsWith('0')) {
              e.target.value = Number(e.target.value).toString();
            }
            if (onChange) onChange(e);
          }}
          className={`w-full ${isSm ? 'h-8 text-14' : 'h-10 text-15'} font-medium bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl focus:outline-hidden transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield] ${
            icon ? 'pl-12' : 'pl-3'
          } ${
            isNumber && suffix ? 'pr-20' : (isNumber ? 'pr-9' : (suffix ? 'pr-12' : 'pr-3'))
          } ${
            error 
              ? 'border-rose-500/50 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10' 
              : 'focus:border-amber-500/60 dark:focus:border-amber-500/60 focus:ring-4 focus:ring-amber-500/10 hover:border-slate-300 dark:hover:border-white/20'
          } ${
            disabled ? 'opacity-60 cursor-not-allowed' : ''
          } ${inputClassName}`}
          style={{
            colorScheme: 'light dark',
            WebkitAppearance: 'none',
            MozAppearance: 'textfield'
          }}
          {...props}
        />

        {suffix && (
          <div className={`absolute inset-y-0 select-none flex items-center justify-center animate-in fade-in duration-300 ${isNumber ? 'right-9' : 'right-3.5'}`}>
            {typeof suffix === 'string' ? (
              <span className="text-12 font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md border border-slate-200/50 dark:border-white/5">
                {suffix}
              </span>
            ) : suffix}
          </div>
        )}

        {isNumber && !disabled && (
          <div className="absolute right-3 px-1 border-l border-slate-200/50 dark:border-white/5 flex flex-col items-center justify-center gap-0.5 h-6 my-auto pointer-events-none">
            <button
               type="button"
               tabIndex="-1"
               onClick={() => (props.onStepChange ? props.onStepChange(1) : handleAdjust(1))}
               className="w-4 h-2.5 flex items-center justify-center text-slate-400 hover:text-bk-yellow transition-all active:scale-95 pointer-events-auto"
            >
              <Icon name="keyboard_arrow_up" size="15px" weight={700} />
            </button>
            <button
               type="button"
               tabIndex="-1"
               onClick={() => (props.onStepChange ? props.onStepChange(-1) : handleAdjust(-1))}
               className="w-4 h-2.5 flex items-center justify-center text-slate-400 hover:text-bk-yellow transition-all active:scale-95 pointer-events-auto"
            >
              <Icon name="keyboard_arrow_down" size="15px" weight={700} />
            </button>
          </div>
        )}
      </div>
    </FormField>
  );
});

Input.displayName = 'Input';
