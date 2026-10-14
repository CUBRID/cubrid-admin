import React from 'react';
import { Icon } from './Icon';
import { Typography } from './Typography';

/**
 * Standardized Section Header for Modals and Forms
 * Identical to the planned roadmap for UI unification.
 * 
 * @param {string} title - The section title text
 * @param {string} icon - Optional Material Icon name
 * @param {boolean} showLine - Whether to show the horizontal divider line (default: true)
 * @param {string|number} badge - Optional badge text/count to show next to title
 * @param {string} className - Optional container overrides
 */
export const SectionHeader = ({ 
  title, 
  icon, 
  showLine = true,
  badge,
  className = "" 
}) => {
  return (
    <div className={`flex items-center gap-2.5 mb-4 mt-8 first:mt-2 animate-in fade-in slide-in-from-left-2 duration-300 ${className}`}>
      {icon ? (
        <div className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.05)]">
          <Icon name={icon} size="14px" weight={400} className="text-amber-500" />
        </div>
      ) : (
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
      )}
      
      <Typography 
        variant="caption" 
        className="font-medium text-slate-500 dark:text-slate-400 capitalize tracking-wide text-14 select-none"
      >
        {title}
      </Typography>

      {badge !== undefined && badge !== null && (
        <span className="text-11 font-black px-1.5 py-0.5 rounded-sm bg-amber-500/10 border border-amber-500/20 text-amber-500 -ml-1 animate-in zoom-in duration-300">
          {badge}
        </span>
      )}

      {showLine && (
        <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-white/10 dark:to-transparent ml-1" />
      )}
    </div>
  );
};
