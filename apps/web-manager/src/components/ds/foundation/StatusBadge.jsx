import React from 'react';
import { Icon } from './Icon';

/**
 * Standardized Semantic Status Badge for Processes and Transactions
 * Supports pulsing live states and standardized color tokens.
 * 
 * @param {string} label - Contextual status text (e.g., "Active", "Busy")
 * @param {string} icon - Optional Material Icon name
 * @param {string} variant - Semantic variant: emerald, amber, rose, violet, sky, slate
 * @param {boolean} pulse - If true, adds a rhythmic pulsing dot to indicate live activity
 * @param {string} className - Optional styling overrides
 */
export const StatusBadge = ({ 
  label, 
  icon, 
  variant = 'emerald', 
  pulse = false, 
  className = '' 
}) => {
  const themes = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 dot-emerald-500',
    amber:   'bg-amber-500/10   border-amber-500/30   text-amber-600   dark:text-amber-400   dot-amber-500',
    rose:    'bg-rose-500/10    border-rose-500/30    text-rose-600    dark:text-rose-400    dot-rose-500',
    violet:  'bg-violet-500/10  border-violet-500/30  text-violet-600  dark:text-violet-400  dot-violet-500',
    sky:     'bg-sky-500/10     border-sky-500/30     text-sky-600     dark:text-sky-400     dot-sky-500',
    slate:   'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 dot-slate-400',
  };

  const currentTheme = themes[variant] || themes.slate;
  const dotColor = currentTheme.split('dot-').pop();

  return (
    <div className={`px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 shrink-0 w-fit transition-all select-none ${currentTheme} ${className}`}>
      {icon ? (
        <Icon name={icon} size="13px" weight={400} className="shrink-0" />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full bg-${dotColor} shrink-0 relative flex`}>
          {pulse && (
            <span className={`absolute inset-0 rounded-full bg-${dotColor} animate-ping opacity-75`} />
          )}
        </span>
      )}
      <span className="text-11 font-black uppercase tracking-widest leading-none">
        {label}
      </span>
    </div>
  );
};
