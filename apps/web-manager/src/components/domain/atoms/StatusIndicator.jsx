import React from 'react';

export const StatusIndicator = ({
  status = 'unknown',
  animate = false,
  label,
}) => {
  const isOk = status === 'on' || status === 'connected';
  const isErr = status === 'error' || status === 'disconnected' || status === 'off';
  const isUnknown = status === 'unknown';

  const baseConfig = isOk
    ? {
        wrapper: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-500/20',
        dot: 'bg-emerald-500',
        ping: 'bg-emerald-400',
        defaultLabel: 'On',
      }
    : isErr
    ? {
        wrapper: 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-500/20',
        dot: 'bg-rose-500',
        ping: 'bg-rose-400',
        defaultLabel: 'Off',
      }
    : {
        wrapper: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-500/20',
        dot: 'bg-amber-500',
        ping: 'bg-amber-400',
      };

  return (
    <span className={`inline-flex items-center ${label ? 'gap-1.5 px-2 py-0.5' : 'p-1'} text-11 font-medium border rounded-full tracking-tighter ${baseConfig.wrapper}`}>
      <span className="relative flex h-1.5 w-1.5">
        {animate && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${baseConfig.ping}`}></span>
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${baseConfig.dot}`}></span>
      </span>
      {label && <span>{label}</span>}
    </span>
  );
};
