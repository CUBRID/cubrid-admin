import React, { useRef, useEffect } from 'react';
import { Badge } from '../../ds/foundation/Badge';
import { SearchInput } from '../../ds/forms/SearchInput';
import { EmptyState } from '../../ds/layout/EmptyState';
import { Skeleton } from '../../ds/layout/Skeleton';
import { useCM } from '../../../constants/useCM';
import { Select } from '../../ds/forms/Select';

export const LogViewer = ({
  lines = [],
  loading = false,
  autoScroll = true,
  filter = { level: 'all', search: '' },
  onFilterChange,
}) => {
  const CM = useCM();
  const scrollRef = useRef(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const levelOptions = [
    { label: CM.logAllLevels, value: 'all' },
    { label: CM.error,        value: 'error' },
    { label: CM.warning,      value: 'warn' },
    { label: CM.infoLog,      value: 'info' },
  ];

  const getBadgeVariant = (level) => {
    switch (level) {
      case 'error': return 'danger';
      case 'warn': return 'warning';
      case 'info': return 'info';
      default: return 'default';
    }
  };

  return (
    <div className="flex flex-col h-full border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-950">
      <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="w-48">
          <Select
            label=""
            options={levelOptions}
            value={filter.level}
            onChange={(val) => onFilterChange({ ...filter, level: val })}
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <SearchInput
            value={filter.search}
            onChange={(val) => onFilterChange({ ...filter, search: val })}
            onClear={() => onFilterChange({ ...filter, search: '' })}
            placeholder={CM.searchLogsPlaceholder}
          />
        </div>
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 font-mono text-sm">
        {loading && lines.length === 0 ? (
          <div className="space-y-3">
            <Skeleton variant="text" width="100%" height="20px" />
            <Skeleton variant="text" width="80%" height="20px" />
            <Skeleton variant="text" width="90%" height="20px" />
          </div>
        ) : lines.length === 0 ? (
          <EmptyState title={CM.noLogsFoundTitle} description={CM.adjustFiltersDesc} icon="receipt_long" />
        ) : (
          <div className="space-y-1">
            {lines.map((line, idx) => (
              <div key={idx} className="flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-900 p-1.5 rounded-sm transition-colors group">
                <span className="text-slate-400 dark:text-slate-500 whitespace-nowrap pt-0.5 text-13">{line.timestamp}</span>
                <Badge variant={getBadgeVariant(line.level)} size="sm" className="w-16 justify-center tracking-wider uppercase shrink-0">
                  {line.level}
                </Badge>
                <span className="text-slate-700 dark:text-slate-300 break-all">{line.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
