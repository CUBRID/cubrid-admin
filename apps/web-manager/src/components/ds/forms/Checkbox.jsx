import React, { forwardRef, useRef, useImperativeHandle, useEffect } from 'react';
import { Typography } from '../foundation/Typography';

/**
 * Premium Checkbox component
 * Correctly handles the indeterminate state via internal ref and useEffect.
 */
export const Checkbox = forwardRef(({
  label,
  description,
  error,
  className = '',
  disabled = false,
  indeterminate = false,
  checked = false,
  onChange,
  ...props
}, ref) => {
  const internalRef = useRef(null);
  
  // Expose the internal input ref to the parent
  useImperativeHandle(ref, () => internalRef.current);

  // Apply the indeterminate property to the DOM element
  useEffect(() => {
    if (internalRef.current) {
      internalRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <div className={`flex flex-col gap-1 w-fit ${className}`}>
      <label className={`flex ${description ? 'items-start' : 'items-center'} gap-2 cursor-pointer group ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <div className={`relative flex items-center justify-center ${description ? 'pt-0.5' : ''}`}>
          <input
            ref={internalRef}
            type="checkbox"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            className="peer sr-only"
            {...props}
          />
          {/* Custom Checkbox UI */}
          <div className="w-4.5 h-4.5 bg-white dark:bg-white/10 border border-slate-300 dark:border-white/25 rounded-md flex shrink-0 justify-center items-center transition-all shadow-xs group-hover:border-amber-500/50 dark:group-hover:border-amber-500/50 peer-checked:bg-amber-500 peer-checked:border-amber-500 dark:peer-checked:bg-amber-500 dark:peer-checked:border-amber-500 peer-[&:indeterminate]:bg-amber-500/60 peer-[&:indeterminate]:border-amber-500/30 pointer-events-none">
            {/* Checked Icon */}
            <svg 
              className={`w-3.5 h-3.5 text-white dark:text-bk-side pointer-events-none transition-opacity duration-150 ${checked && !indeterminate ? 'opacity-100' : 'opacity-0'}`} 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="4" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            
            {/* Indeterminate Icon */}
            <div className={`absolute w-2 h-0.5 bg-white dark:bg-bk-side rounded-full transition-opacity duration-150 ${indeterminate ? 'opacity-100' : 'opacity-0'}`} />
          </div>
        </div>
        
        {label && (
          <div className="flex flex-col">
            <Typography variant="span" className="select-none text-14 font-medium text-slate-700 dark:text-slate-200 tracking-normal">
              {label}
            </Typography>
            {description && (
              <Typography variant="p" className="text-12 text-slate-500 mt-0.5 leading-relaxed font-medium">
                {description}
              </Typography>
            )}
          </div>
        )}
      </label>
      {error && (
        <Typography variant="p" className="ml-6.5 mt-0.5 text-13 text-rose-500! dark:text-rose-400! font-semibold tracking-tight">
          {error}
        </Typography>
      )}
    </div>
  );
});

Checkbox.displayName = 'Checkbox';
