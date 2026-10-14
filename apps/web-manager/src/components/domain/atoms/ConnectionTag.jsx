import React from 'react';
import { Icon } from '../../ds/foundation/Icon';

export const ConnectionTag = ({
  host,
  port,
  status = 'connected',
  className = '',
}) => {
  const isConnected = status === 'connected' || status === 'on';
  
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-xs ${className}`}>
      <Icon 
        name={isConnected ? 'lan' : 'wifi_off'} 
        size="sm" 
        className={isConnected ? 'text-emerald-500' : 'text-rose-500'} 
       weight={300} />
      <div className="flex items-center font-mono text-13 text-slate-700 dark:text-slate-300">
        <span className="font-semibold">{host}</span>
        <span className="text-slate-400 mx-0.5">:</span>
        <span className="text-slate-500 dark:text-slate-400">{port}</span>
      </div>
    </div>
  );
};
