import React, { forwardRef } from 'react';
import { FormField } from './FormField';

export const Textarea = forwardRef(({
  label,
  description,
  error,
  required,
  rows = 3,
  className = '',
  disabled = false,
  ...props
}, ref) => {
  return (
    <FormField label={label} description={description} error={error} required={required} className={className}>
      <textarea
        ref={ref}
        rows={rows}
        disabled={disabled}
        className={`w-full px-3 py-2 text-14 font-medium bg-slate-50 dark:bg-bk-main/30 border rounded focus:outline-hidden focus:border-bk-yellow/50 dark:text-slate-100 transition-all resize-y placeholder:text-slate-400 dark:placeholder:text-slate-600 ${
          error 
            ? 'border-rose-500/50 focus:border-rose-500' 
            : 'border-slate-300 dark:border-slate-800'
        } ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        {...props}
      />
    </FormField>
  );
});

Textarea.displayName = 'Textarea';
