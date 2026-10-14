import React, { forwardRef, useId } from 'react';
import { FormField } from './FormField';

export const Textarea = forwardRef(({
  label,
  description,
  error,
  required,
  rows = 3,
  className = '',
  disabled = false,
  id,
  ...props
}, ref) => {
  const generatedId = useId();
  const textareaId = id || generatedId;
  const descriptionId = description ? `${textareaId}-description` : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;
  return (
    <FormField label={label} description={description} error={error} required={required} className={className} htmlFor={textareaId} descriptionId={descriptionId} errorId={errorId}>
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        required={required}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[descriptionId, errorId].filter(Boolean).join(' ') || undefined}
        className={`w-full px-3 py-2 text-[13px] font-medium bg-slate-50 dark:bg-white/[0.03] border rounded-xl focus-visible:outline-none focus:border-amber-500/60 focus:ring-4 focus:ring-amber-500/10 dark:text-slate-100 transition-all resize-y placeholder:text-slate-400 dark:placeholder:text-slate-600 ${
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
