import React from 'react';
import { useCM } from '../../../constants/useCM';

/**
 * A sleek, high-fidelity loading overlay for in-place actions.
 * Adopts the premium design from common/LoadingOverlay while maintaining
 * context-aware dynamic feedback.
 */
export const RefreshingOverlay = ({
  show,
  title = null,
  subtitle = "",
  className = ""
}) => {
  const CM = useCM();
  const resolvedTitle = title ?? CM.processingEllipsis;
  if (!show) return null;

  // Standardized formatting for action-based text
  // Standardized formatting for action-based text
  const formatText = (text) => {
    if (!text) return "";
    return text
      .trim()
      .replace(/\s*\.\.\.$/g, '')
      .replace(/^Starting/gi, 'Start')
      .replace(/^Stopping/gi, 'Stop')
      .replace(/^Restarting/gi, 'Restart');
  };

  // Context detection for the top label
  const getContextLabel = () => {
    const text = (resolvedTitle + ' ' + subtitle).toLowerCase();
    if (text.includes('database') || text.includes('db')) return CM.databaseAction;
    if (text.includes('broker')) return CM.brokerAction;
    if (text.includes('service')) return CM.serviceActionLabel;
    if (text.includes('host') || text.includes('server')) return CM.hostActionLabel;
    return CM.actionLabel;
  };

  const contextLabel = getContextLabel();
  let primaryText = formatText(resolvedTitle);
  let secondaryText = formatText(subtitle);

  // Auto-deduplicate: If title is just a generic 'Database Action' or similar, 
  // and it matches our header, use the more specific subtitle instead.
  if (primaryText.toUpperCase() === contextLabel.toUpperCase() || primaryText.toLowerCase().includes('action')) {
    if (secondaryText) {
      primaryText = secondaryText;
      secondaryText = "";
    }
  }

  return (
    <div
      data-testid="loading-overlay"
      className={`absolute inset-0 z-[10001] flex flex-col items-center justify-center bg-white/80 dark:bg-bk-side/95 backdrop-blur-[4px] animate-in fade-in duration-300 rounded-xl overflow-hidden ${className}`}
    >

      {/* Soft ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] bg-amber-500/10 rounded-full blur-[100px] pointer-events-none opacity-50" />

      <div className="relative z-10 flex flex-col items-center gap-7 text-center w-full px-10">

        {/* Spinner stack */}
        <div className="relative w-[72px] h-[72px]">
          {/* Outer track */}
          <div className="absolute inset-0 rounded-full border-2 border-slate-200/50 dark:border-white/5" />
          
          {/* Main arc */}
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-500 animate-spin shadow-[0_0_15px_rgba(245,158,11,0.25)]"
            style={{ animationDuration: '0.9s' }}
          />
          
          {/* Inner reversed arc */}
          <div
            className="absolute inset-[11px] rounded-full border-[1.5px] border-transparent border-b-amber-500/40 animate-spin"
            style={{ animationDuration: '1.7s', animationDirection: 'reverse' }}
          />
          
          {/* Center dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_12px_4px_rgba(245,158,11,0.35)] animate-pulse" />
          </div>
        </div>

        {/* Text stack - Standardized hierarchy */}
        <div className="space-y-1.5 flex flex-col items-center animate-in slide-in-from-bottom-2 duration-500">
          <h4 className="text-13 font-black text-slate-800 dark:text-amber-500 tracking-[0.25em] uppercase leading-none mb-0.5">
            {contextLabel}
          </h4>
          <p className="text-14 text-slate-500 dark:text-slate-400 font-medium tracking-normal px-4 text-center leading-relaxed">
            {primaryText}
          </p>
          {secondaryText && (
             <p className="text-13 text-slate-400/80 dark:text-slate-500 font-medium tracking-tight px-6 text-center leading-tight">
              {secondaryText}
            </p>
          )}
        </div>

        {/* Sliding progress bar */}
        <div className="w-36 h-[2.5px] bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.4)]"
            style={{ animation: 'overlaySlide 1.5s ease-in-out infinite' }}
          />
        </div>

        {/* Status pill */}
        <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 shadow-sm transition-all duration-300">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDuration: '1s' }} />
          <span className="text-11 font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
            {CM.requestInProgressLabel}
          </span>
        </div>

      </div>

      <style>{`
        @keyframes overlaySlide {
          0%   { transform: translateX(-100%); width: 40%; }
          50%  { transform: translateX(100%);  width: 50%; }
          100% { transform: translateX(200%);  width: 40%; }
        }
      `}</style>
    </div>
  );
};

