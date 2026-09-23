import React from 'react';
import { Icon } from '../foundation/Icon';
import { Typography } from '../foundation/Typography';
import { useCM } from '../../../constants/useCM';

/**
 * PageLoader - Standardized premium loading state for pages and major sections.
 * 
 * @param {string} title - Main loading title
 * @param {string} subtitle - Descriptive sub-text
 * @param {string} icon - Material icon name
 * @param {string} accent - Accent color (amber, blue, rose, etc)
 * @param {string} className - Extra wrapper classes
 * @param {boolean} fullHeight - Take up full parent height
 */
export function PageLoader({
  title = null,
  subtitle = null,
  icon = "analytics",
  accent = "amber",
  className = "",
  fullHeight = true
}) {
  const CM = useCM();
  const resolvedTitle = title ?? CM.synchronizingDataTitle;
  const resolvedSubtitle = subtitle ?? CM.fetchingMetricsSubtitle;
  const accentColors = {
    amber: "border-t-amber-500 text-amber-500",
    blue: "border-t-blue-500 text-blue-500",
    rose: "border-t-rose-500 text-rose-500",
    indigo: "border-t-indigo-500 text-indigo-500",
    emerald: "border-t-emerald-500 text-emerald-500",
  };

  const selectedAccent = accentColors[accent] || accentColors.amber;

  return (
    <div className={`flex flex-col items-center justify-center gap-6 animate-in fade-in zoom-in duration-700 ${fullHeight ? 'flex-1 h-full min-h-[400px]' : 'py-20'} ${className}`}>
      <div className="relative w-20 h-20">
        {/* Outer track */}
        <div className="absolute inset-0 rounded-full border-4 border-slate-100 dark:border-white/5" />
        
        {/* Main rotating ring */}
        <div className={`absolute inset-0 rounded-full border-4 border-transparent ${selectedAccent} animate-spin`} style={{ animationDuration: '0.9s' }} />
        
        {/* Subtle inner reverse ring */}
        <div className="absolute inset-3 rounded-full border-2 border-transparent border-b-slate-300 dark:border-b-white/10 animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
        
        {/* Center icon */}
        <div className={`absolute inset-0 flex items-center justify-center ${selectedAccent.split(' ')[1]}`}>
          <Icon name={icon} size="md" weight={400} className="animate-pulse" />
        </div>
      </div>

      <div className="text-center space-y-1.5 px-8 max-w-[320px]">
        <Typography variant="h4" className="text-17 font-black tracking-tight uppercase tracking-widest text-slate-800 dark:text-slate-100">
          {resolvedTitle}
        </Typography>
        <Typography variant="p" className="text-14 text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
          {resolvedSubtitle}
        </Typography>
      </div>

      {/* Progress track background decoration */}
      <div className="w-48 h-1 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden relative">
        <div className={`absolute top-0 bottom-0 left-0 bg-gradient-to-r from-transparent via-current to-transparent opacity-50 animate-[loading_2s_ease-in-out_infinite] ${selectedAccent.split(' ')[1]}`} style={{ width: '60%' }} />
      </div>

      <style jsx>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}
