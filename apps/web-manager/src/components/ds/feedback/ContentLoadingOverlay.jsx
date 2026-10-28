import React from 'react';
import { Spinner } from '../foundation/Spinner';
import { useCM } from '../../../constants/useCM';

/**
 * Light spinner overlay for a content area that is (re)loading in place.
 * The parent must be `relative`; whatever is underneath stays mounted and
 * visible, so a refresh doesn't blank or resize the view.
 */
export const ContentLoadingOverlay = ({ show, label, testId }) => {
  const CM = useCM();
  if (!show) return null;
  return (
    <div
      data-testid={testId}
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/60 dark:bg-bk-side/60 animate-in fade-in duration-200"
    >
      <Spinner size="lg" className="text-amber-500" />
      <span className="text-13 font-medium text-slate-500 dark:text-slate-400">{label ?? CM.loadingLabel}</span>
    </div>
  );
};
