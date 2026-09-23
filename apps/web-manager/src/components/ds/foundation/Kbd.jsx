import React from 'react';

export const Kbd = ({
  children,
  className = '',
}) => {
  return (
    <kbd className={`inline-flex items-center justify-center px-1.5 py-0.5 text-13 font-mono font-medium rounded-md text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-[0_1px_0_rgba(203,213,225,1)] dark:shadow-[0_1px_0_rgba(51,65,85,1)] ${className}`}>
      {children}
    </kbd>
  );
};
