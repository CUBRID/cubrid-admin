import React from 'react';
import { Icon } from '../foundation/Icon';
import { Typography } from '../foundation/Typography';

/**
 * Premium Empty State Component for Tables, Lists, and Monitors
 * Provides a consistent "Visual + Title + Subtitle" pattern for absence of data.
 * 
 * @param {string} icon - Material Icon name (default: "sentiment_neutral")
 * @param {string} title - Action-oriented headline
 * @param {string} subtitle - Explanatory narrative or hint to resolve
 * @param {string} accent - Design token: emerald, amber, rose, violet, slate
 * @param {string} py - Vertical padding (default: "py-16")
 * @param {React.ReactNode} action - Optional action button or element
 */
export const EmptyState = ({ 
  icon = 'sentiment_neutral', 
  title, 
  subtitle, 
  accent = 'emerald',
  py = 'py-16',
  action
}) => {
  const accentClass = { 
    emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', 
    amber:   'text-amber-500 bg-amber-500/10 border-amber-500/20', 
    rose:    'text-rose-500 bg-rose-500/10 border-rose-500/20',
    violet:  'text-violet-500 bg-violet-500/10 border-violet-500/20',
    slate:   'text-slate-400 bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10' 
  };
  
  const c = accentClass[accent] || accentClass.slate;

  return (
    <div className={`flex flex-col items-center justify-center ${py} gap-5 opacity-40 animate-in fade-in zoom-in-95 duration-500`}>
      <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center shadow-xs ${c}`}>
        <Icon name={icon} size="lg" weight={100} />
      </div>
      
      <div className="text-center space-y-2 max-w-[320px]">
        <Typography variant="p" className="text-14 font-black font-sans uppercase tracking-[0.2em] text-slate-700 dark:text-slate-200 leading-none">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" className="text-13 font-sans text-slate-500 dark:text-slate-400 italic leading-relaxed block px-4">
            {subtitle}
          </Typography>
        )}
      </div>

      {action && (
        <div className="mt-2 animate-in slide-in-from-top-2 duration-300">
          {action}
        </div>
      )}
    </div>
  );
};
