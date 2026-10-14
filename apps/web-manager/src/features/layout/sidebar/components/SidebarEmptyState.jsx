import React from 'react';
import { Typography } from '../../../../components/ds/foundation/Typography';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { useCM } from '../../../../constants/useCM';

export default function SidebarEmptyState() {
  const CM = useCM();
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden animate-in fade-in duration-500 select-none">

      {/* Subtle dot grid background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04] dark:opacity-[0.06]"
        style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '18px 18px' }}
      />

      {/* Faint radial glow behind icon */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-amber-400/5 dark:bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-5">

        {/* Icon cluster */}
        <div className="relative">
          {/* Orbit ring */}
          <div className="absolute inset-0 rounded-full border border-dashed border-slate-200 dark:border-white/[0.07] scale-[1.75] animate-[spin_20s_linear_infinite] opacity-60" />

          {/* Central icon box */}
          <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-white/4 border border-slate-200 dark:border-white/8 flex items-center justify-center shadow-xs">
            <Icon name="dns" weight={300} size="23px" className="text-slate-400 dark:text-slate-500" />
          </div>

          {/* Satellite dots */}
          <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-amber-500" />
          </div>
          <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-white/10" />
        </div>

        {/* Text content */}
        <div className="space-y-1.5 max-w-[240px]">

          <Typography variant="h6" className="text-13 font-black text-slate-800 dark:text-slate-200 uppercase tracking-[0.2em] leading-none whitespace-nowrap">
            {CM.noHostSelectedTitle}
          </Typography>


          <Typography variant="p" className="text-13 leading-relaxed text-slate-400 dark:text-slate-600 font-medium">
            {CM.selectServerFromList}
          </Typography>
        </div>

        {/* Hint badge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/4 border border-slate-200 dark:border-white/6">
          <Icon name="arrow_upward" size="13px" weight={400} className="text-slate-400" />
          <Typography variant="span" className="text-12 text-slate-400 font-semibold tracking-wide">
            {CM.serverListAbove}
          </Typography>
        </div>

      </div>
    </div>
  );
}
