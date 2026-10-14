import React from 'react';
import { Icon } from '../foundation/Icon';
import { Typography } from '../foundation/Typography';
import { useCM } from '../../../constants/useCM';

export const EmptyState = ({
  icon = 'inbox',
  title = null,
  description,
  action,
  className = '',
}) => {
  const CM = useCM();
  const resolvedTitle = title ?? CM.noDataTitle;
  return (
    <div className={`flex flex-col items-center justify-center py-8 px-4 text-center ${className}`}>
      <div className="mb-3 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100/70 dark:bg-white/3">
        <Icon name={icon} size="sm" className="text-slate-400 dark:text-slate-500" weight={300} />
      </div>
      <Typography variant="h5" className="mb-1 text-[13px] font-medium text-slate-700 dark:text-slate-300">
        {resolvedTitle}
      </Typography>
      {description && (
        <Typography variant="p" className="mb-5 max-w-sm mx-auto text-[12px] text-slate-500 dark:text-slate-400">
          {description}
        </Typography>
      )}
      {action && (
        <div>
          {action}
        </div>
      )}
    </div>
  );
};
