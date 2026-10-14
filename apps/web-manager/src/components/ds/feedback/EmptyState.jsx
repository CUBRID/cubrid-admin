import React from 'react';
import { Icon } from '../foundation/Icon';
import { Typography } from '../foundation/Typography';

/**
 * Empty State Component for Tables, Lists, and Monitors
 * Provides a consistent "Visual + Title + Subtitle" pattern for absence of data.
 * 
 * @param {string} icon - Material Icon name (default: "sentiment_neutral")
 * @param {string} title - Action-oriented headline
 * @param {string} subtitle - Explanatory narrative or hint to resolve
 * @param {string} accent - Design token: emerald, amber, rose, violet, slate
 * @param {string} py - Vertical padding (default: "py-10")
 * @param {React.ReactNode} action - Optional action button or element
 */
export const EmptyState = ({ 
  icon = 'sentiment_neutral', 
  title, 
  subtitle, 
  accent = 'emerald',
  py = 'py-10',
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
    <div className={`flex flex-col items-center justify-center ${py} gap-3 text-center animate-in fade-in duration-200`}>
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${c}`}>
        <Icon name={icon} size="sm" weight={300} />
      </div>
      
      <div className="space-y-1 max-w-[320px]">
        <Typography variant="p" className="text-14 font-medium text-slate-700 dark:text-slate-300 leading-snug">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" className="text-13 text-slate-500 dark:text-slate-400 leading-relaxed block px-4">
            {subtitle}
          </Typography>
        )}
      </div>

      {action && (
        <div className="mt-1">
          {action}
        </div>
      )}
    </div>
  );
};
