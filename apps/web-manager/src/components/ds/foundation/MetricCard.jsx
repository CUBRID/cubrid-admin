import React from 'react';
import { Icon } from './Icon';
import { Typography } from './Typography';

/**
 * Premium Status Card for High-Value Metrics and Live Data
 * Standardizes the "Icon + Label + Value + Unit" pattern.
 * 
 * @param {string} icon - Material Icon name
 * @param {string} label - Conceptual metric title (e.g., "Active Sessions")
 * @param {string|number} value - The primary metric data
 * @param {string} unit - Optional data unit (e.g., "ms", "KB")
 * @param {string} accent - Design token: amber, sky, violet, rose, emerald, slate
 * @param {string} className - Optional container overrides
 * @param {boolean} isLoading - Shows subtle pulse state when polling
 */
export const MetricCard = ({ 
  icon, 
  label, 
  value, 
  unit, 
  accent = 'amber',
  className = '',
  isLoading = false
}) => {
  const colors = {
    amber:  { ring: 'border-amber-500/20 bg-amber-500/5',    icon: 'text-amber-500',   val: 'text-amber-600 dark:text-amber-400' },
    sky:    { ring: 'border-sky-500/20 bg-sky-500/5',        icon: 'text-sky-500',     val: 'text-sky-600 dark:text-sky-400' },
    violet: { ring: 'border-violet-500/20 bg-violet-500/5',  icon: 'text-violet-500',  val: 'text-violet-600 dark:text-violet-400' },
    rose:   { ring: 'border-rose-500/20 bg-rose-500/5',      icon: 'text-rose-500',    val: 'text-rose-600 dark:text-rose-400' },
    emerald:{ ring: 'border-emerald-500/20 bg-emerald-500/5',icon: 'text-emerald-500', val: 'text-emerald-600 dark:text-emerald-400' },
    slate:  { ring: 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/2', icon: 'text-slate-400', val: 'text-slate-700 dark:text-slate-200' },
  };

  const c = colors[accent] || colors.slate;

  return (
    <div className={`rounded-2xl border p-4 flex items-center gap-4 transition-all duration-300 hover:shadow-xs group ${c.ring} ${isLoading ? 'animate-pulse opacity-80' : ''} ${className}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-white/70 dark:bg-black/20 border border-white/60 dark:border-white/10 shadow-xs transition-transform group-hover:scale-105`}>
        <Icon name={icon} size="sm" weight={300} className={c.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-12 font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
          {label}
        </div>
        <div className="flex items-baseline gap-1.5 overflow-hidden">
          <span className={`text-20 font-mono font-black leading-none tracking-tight truncate ${c.val}`}>
            {value ?? '--'}
          </span>
          {unit && (
            <span className="text-12 font-black text-slate-400 dark:text-slate-500/60 uppercase italic tracking-tighter">
              {unit}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
