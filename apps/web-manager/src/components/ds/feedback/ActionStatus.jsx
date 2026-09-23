import React, { useState } from 'react';
import { Icon } from '../foundation/Icon';
import { Button } from '../foundation/Button';
import { Typography } from '../foundation/Typography';
import { useCM } from '../../../constants/useCM';

export const ModalStatusLoading = ({ title, subtitle, onBackground }) => {
  const CM = useCM();
  const displayTitle = title || CM.processing;
  const displaySubtitle = subtitle || CM.pleaseWait;
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-7 text-center animate-in fade-in duration-200">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-slate-100 dark:border-white/5" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-500 animate-spin" style={{ animationDuration: '0.9s' }} />
        <div className="absolute inset-[10px] rounded-full border-[1.5px] border-transparent border-b-amber-500/30 animate-spin" style={{ animationDuration: '1.7s', animationDirection: 'reverse' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon name="schedule" size="md" weight={400} className="text-amber-500 animate-pulse" />
        </div>
      </div>

      <div className="space-y-1.5 px-8">
        <Typography variant="h4" className="text-17 font-bold text-slate-900 dark:text-white">{displayTitle}</Typography>
        <Typography variant="p" className="text-14 text-slate-500 dark:text-slate-400 max-w-[320px] mx-auto leading-relaxed">
          {displaySubtitle}
        </Typography>
      </div>

      <div className="w-32 h-[2px] bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
        <div className="h-full bg-amber-500 rounded-full" style={{ animation: 'modalSlide 1.5s ease-in-out infinite' }} />
      </div>

      {onBackground && (
        <div className="flex flex-col items-center gap-3 pt-1">
          <Typography variant="caption" className="text-13 text-slate-400 dark:text-slate-500">
            {CM.continueInBackgroundHint}
          </Typography>
          <Button variant="secondary" onClick={onBackground} icon="check_circle">{CM.confirm}</Button>
        </div>
      )}
    </div>
  );
};

export const ModalStatusSuccess = ({
  title,
  message,
  onConfirm,
  confirmText,
}) => {
  const CM = useCM();
  const displayTitle = title || CM.operationComplete;
  const displayMessage = message || CM.operationCompletedSuccess;
  const displayConfirmText = confirmText || CM.ok;
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-7 text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="relative">
        <div className="absolute inset-0 bg-emerald-500/10 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
        <div className="relative w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-[0_0_24px_rgba(16,185,129,0.3)]">
          <Icon name="verified" size="lg" weight={700} className="text-white" />
        </div>
      </div>

      <div className="space-y-2 px-8">
        <Typography variant="h4" className="text-17 font-bold text-slate-900 dark:text-white">{displayTitle}</Typography>
        <Typography variant="p" className="text-14 text-slate-500 dark:text-slate-400 leading-relaxed max-w-[360px] mx-auto">
          {displayMessage}
        </Typography>
      </div>

      {onConfirm && (
        <Button data-testid="modal-status-confirm-btn" variant="primary" onClick={onConfirm} icon="check_circle" className="px-10">{displayConfirmText}</Button>
      )}
    </div>
  );
};

export const ModalStatusError = ({
  title,
  error,
  guidance,
  onRetry,
  onCancel,
  retryText,
  cancelText,
}) => {
  const CM = useCM();
  const [showDetail, setShowDetail] = useState(false);
  const displayTitle = title || CM.operationFailed;
  const displayRetryText = retryText || CM.retry;
  const displayCancelText = cancelText || CM.close;
  const guidanceItems = Array.isArray(guidance) ? guidance : (guidance ? [guidance] : []);
  const rawDetail = error ? (typeof error === 'string' ? error : (error?.message || CM.unknownErrorFallback)) : null;
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative">
        <div className="absolute inset-0 bg-rose-500/10 rounded-full animate-ping" style={{ animationDuration: '2.5s' }} />
        <div className="relative w-14 h-14 bg-rose-500 rounded-full flex items-center justify-center shadow-[0_0_24px_rgba(244,63,94,0.3)]">
          <Icon name="report_problem" size="sm" weight={300} className="text-white" />
        </div>
      </div>

      <div className="space-y-2 px-6">
        <Typography variant="h4" className="text-17 font-bold text-rose-600 dark:text-rose-400">{displayTitle}</Typography>
        <Typography variant="p" className="text-14 text-slate-500 dark:text-slate-400 leading-relaxed">
          {CM.operationCouldNotBeCompleted}
        </Typography>
      </div>

      {guidanceItems.length > 0 && (
        <div className="w-full max-w-[440px] bg-amber-500/5 border border-amber-500/15 rounded-xl px-5 py-4 text-left">
          <Typography variant="caption" className="text-12 font-semibold uppercase tracking-wide text-amber-500 mb-1.5 block">
            {CM.thingsToCheck}
          </Typography>
          <ul className="space-y-1">
            {guidanceItems.map((item, idx) => (
              <li key={idx} className="text-13 text-slate-600 dark:text-slate-300 leading-relaxed flex gap-1.5">
                <span className="text-amber-500 shrink-0">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rawDetail && (
        <div className="w-full max-w-[440px] text-left">
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            className="flex items-center gap-1 text-12 font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <Icon name={showDetail ? 'expand_less' : 'expand_more'} size="15px" weight={300} />
            {showDetail ? CM.hideDetails : CM.showDetails}
          </button>
          {showDetail && (
            <div className="mt-2 bg-rose-500/5 border border-rose-500/15 rounded-xl px-5 py-4 animate-in fade-in slide-in-from-top-1 duration-200">
              <Typography variant="caption" className="text-12 font-semibold uppercase tracking-wide text-rose-400 mb-1 block">
                {CM.message || 'Message'}
              </Typography>
              <Typography variant="caption" className="text-rose-600/90 dark:text-rose-400/90 font-mono leading-relaxed block break-words text-13">
                {rawDetail}
              </Typography>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        {onCancel && <Button data-testid="modal-status-cancel-btn" variant="secondary" onClick={onCancel}>{displayCancelText}</Button>}
        {onRetry && <Button data-testid="modal-status-retry-btn" variant="primary" icon="refresh" onClick={onRetry}>{displayRetryText}</Button>}
      </div>
    </div>
  );
};
