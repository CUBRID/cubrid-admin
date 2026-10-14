import React from 'react';
import { Typography } from '../../../../components/ds/foundation/Typography';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { useCM } from '../../../../constants/useCM';

export default function SidebarEmptyState() {
  const CM = useCM();
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-slate-100/70 dark:bg-white/3 flex items-center justify-center">
          <Icon name="dns" weight={300} size="sm" className="text-slate-400 dark:text-slate-500" />
        </div>

        {/* Text content */}
        <div className="space-y-1.5 max-w-[240px]">

          <Typography variant="h6" className="text-[12px] font-medium text-slate-700 dark:text-slate-300 leading-snug whitespace-nowrap">
            {CM.noHostSelectedTitle}
          </Typography>


          <Typography variant="p" className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-600 font-medium">
            {CM.selectServerFromList}
          </Typography>
        </div>

        <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
          <Icon name="arrow_upward" size="12px" weight={400} className="text-slate-400" />
          <Typography variant="span" className="text-[10px] font-medium">
            {CM.serverListAbove}
          </Typography>
        </div>

      </div>
    </div>
  );
}
