import React from 'react';
import { Typography } from './Typography';

/**
 * Standardized Progress and Usage Visualizer
 * Supports value labels and semantic thresholds for automated coloring.
 * 
 * @param {number} pct - Current percentage between 0 and 100
 * @param {string} label - Optional label displayed above or next to the bar
 * @param {string} valueLabel - Optional value (e.g., "12.5%") to display
 * @param {string} variant - emerald, amber, rose, sky, violet, slate (or "auto" for threshold logic)
 * @param {boolean} showValue - If true, displays the valueLabel (defaults to pct + "%")
 * @param {string} className - Optional container overrides
 */
export const ProgressBar = ({ 
  pct = 0, 
  label, 
  valueLabel,
  variant = 'auto', 
  showValue = false,
  className = ''
}) => {
  const percentage = Math.min(Math.max(0, pct), 100);
  
  const getAutoVariant = (p) => {
    if (p >= 85) return 'rose';
    if (p >= 65) return 'amber';
    return 'emerald';
  };

  const finalVariant = variant === 'auto' ? getAutoVariant(percentage) : variant;

  const themes = {
    emerald: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]',
    amber:   'bg-amber-500   shadow-[0_0_8px_rgba(245,158,11,0.3)]',
    rose:    'bg-rose-500    shadow-[0_0_8px_rgba(244,63,94,0.3)]',
    sky:     'bg-sky-500     shadow-[0_0_8px_rgba(14,165,233,0.3)]',
    violet:  'bg-violet-500  shadow-[0_0_8px_rgba(139,92,246,0.3)]',
    slate:   'bg-slate-400',
  };

  const barColor = themes[finalVariant] || themes.slate;

  return (
    <div className={`space-y-1.5 w-full ${className}`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between px-0.5">
          {label && (
            <Typography variant="label" className="text-12 font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {label}
            </Typography>
          )}
          {showValue && (
            <Typography variant="caption" className="text-12 font-mono font-black text-slate-700 dark:text-slate-200">
              {valueLabel ?? `${percentage}%`}
            </Typography>
          )}
        </div>
      )}
      <div className="w-full h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden flex relative">
        <div 
          className={`h-full ${barColor} transition-all duration-700 rounded-full animate-in slide-in-from-left-full`} 
          style={{ width: `${percentage}%` }} 
        />
      </div>
    </div>
  );
};
