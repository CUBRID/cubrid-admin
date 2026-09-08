import React from 'react';
import { Typography } from '../foundation/Typography';
import { useCM } from '../../../constants/useCM';

export const FormField = ({
  label,
  labelExtra,
  description,
  error,
  required = false,
  className = '',
  children,
}) => {
  const CM = useCM();
  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      {label && (
        <div className="flex justify-between items-center mb-0.5 ml-0.5">
          <div className="flex items-center gap-1.5">
            <Typography variant="label" className="text-13 font-medium text-slate-500 dark:text-slate-300 font-sans">
              {label}
            </Typography>
            {required && <span className="text-rose-500 text-12" title={CM.requiredFieldTitle}>*</span>}
            {labelExtra && (
              <span className="text-11 text-slate-400 dark:text-slate-500 font-normal italic leading-none pt-0.5">
                {labelExtra}
              </span>
            )}
          </div>
        </div>
      )}
      {description && (
        <Typography variant="p" className="text-12 text-slate-400 dark:text-slate-500 mb-0.5 ml-0.5 font-medium leading-tight">
          {description}
        </Typography>
      )}
      
      {children}
      
      {error && (
        <Typography variant="p" className="mt-1 text-13 text-rose-500! dark:text-rose-400! font-semibold tracking-tight ml-0.5">
          {error}
        </Typography>
      )}
    </div>
  );
};
