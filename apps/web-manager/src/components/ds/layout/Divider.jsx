import React from 'react';

export const Divider = ({
  orientation = 'horizontal',
  label,
  className = '',
}) => {
  if (orientation === 'vertical') {
    return (
      <div className={`flex flex-col items-center ${className}`}>
        <div className="w-px h-full bg-slate-100 dark:bg-slate-800/50" />
        {label && (
          <span className="py-2 text-12 font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</span>
        )}
        {label && <div className="w-[2px] h-full bg-slate-100 dark:bg-slate-800/50" />}
      </div>
    );
  }

  return (
    <div className={`flex items-center w-full gap-2 ${className}`}>
      {label && (
        <span className="text-12 font-medium tracking-wide text-slate-400 dark:text-slate-500 min-w-fit">{label}</span>
      )}
      <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800/50" />
    </div>
  );
};
