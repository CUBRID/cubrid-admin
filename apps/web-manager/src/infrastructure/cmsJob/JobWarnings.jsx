import React from 'react';

export function JobWarnings({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <div className="w-full space-y-2 text-left">
      {warnings.map((warning, index) => (
        <p key={index} role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-14 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {warning}
        </p>
      ))}
    </div>
  );
}
