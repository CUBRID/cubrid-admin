import React from 'react';
import { Tabs } from '../../ds/layout/Tabs';
import { Typography } from '../../ds/foundation/Typography';
import { EmptyState } from '../../ds/layout/EmptyState';
import { useCM } from '../../../constants/useCM';

export const BrokerChart = ({
  data = [],
  range = '1h',
  onRangeChange,
}) => {
  const CM = useCM();
  const rangeTabs = [
    { id: '1h', label: CM.oneHourLabel },
    { id: '6h', label: CM.sixHoursLabel },
    { id: '24h', label: CM.twentyFourHoursLabel },
  ];

  return (
    <div className="flex flex-col border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden h-full">
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Typography variant="h5" className="text-base">{CM.brokerMetricsTitle}</Typography>
          <Typography variant="p" className="text-xs text-slate-500">{CM.connectionsQpsOverTimeDesc}</Typography>
        </div>
        <div className="w-64">
          <Tabs
            variant="pills"
            activeTab={range}
            onChange={onRangeChange}
            tabs={rangeTabs}
          />
        </div>
      </div>
      
      <div className="flex-1 p-4 flex flex-col justify-end relative min-h-[250px] bg-slate-50/50 dark:bg-slate-950/50">
        {data.length === 0 ? (
          <EmptyState title={CM.noMetricsAvailableTitle} description={CM.noDataForTimeRangeDesc} icon="show_chart" />
        ) : (
          <div className="w-full h-full relative border-l border-b border-slate-200 dark:border-slate-700">
            {/* Simple static/CSS placeholder since proper charting libraries aren't available */}
            <div className="absolute inset-0 flex items-end justify-between px-2 pt-4">
              {data.map((point, idx) => {
                const maxQps = Math.max(...data.map(d => d.qps || 1));
                const heightPct = Math.max(5, ((point.qps || 0) / maxQps) * 100);
                return (
                  <div key={idx} className="w-1/12 flex flex-col items-center justify-end h-full group relative">
                    <div 
                      className="w-full bg-amber-500/80 hover:bg-amber-600 rounded-t-sm transition-all"
                      style={{ height: `${heightPct}%` }}
                    />
                    <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-12 py-1 px-2 rounded-sm pointer-events-none transition-opacity whitespace-nowrap z-10">
                      <div>{CM.timeColonLabel}{point.timestamp}</div>
                      <div>{CM.qps}: {point.qps}</div>
                      <div>{CM.connColonLabel}{point.activeConnections}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="absolute -left-8 top-0 text-12 text-slate-400">{CM.maxLabel}</div>
            <div className="absolute -left-8 bottom-0 text-12 text-slate-400">0</div>
          </div>
        )}
      </div>
    </div>
  );
};
