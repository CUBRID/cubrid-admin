import React from 'react';
import { Icon } from '../foundation/Icon';

/**
 * TabGroup - Standardized pill-style navigation for modals and features.
 * 
 * @param {Array} tabs - Array of { id, label, icon, badge }
 * @param {string} active - Currently active tab id
 * @param {function} onChange - Callback when tab changes
 * @param {string} className - Optional extra wrapper classes
 * @param {boolean} fullWidth - Stretch to fit container
 */
export function TabGroup({ tabs = [], active, onChange, className = '', fullWidth = true, testId }) {
  return (
    <div className={`flex gap-1 p-0.5 bg-slate-100 dark:bg-white/5 rounded-sm border border-slate-200/60 dark:border-white/6 ${fullWidth ? 'w-full' : 'w-fit'} ${className}`}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            data-testid={testId ? `${testId}-${tab.id}` : undefined}
            onClick={() => onChange(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-sm text-13 font-bold uppercase tracking-wider transition-colors
              ${isActive
                ? 'bg-white dark:bg-white/10 text-amber-600 dark:text-amber-400 shadow-xs border border-slate-200/80 dark:border-white/10'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
          >
            {tab.icon && <Icon name={tab.icon} size="sm" weight={300} className="shrink-0" />}
            <span className="truncate">{tab.label}</span>
            {tab.badge !== undefined && tab.badge !== null && (
              <span className={`text-11 font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none transition-colors
                ${isActive ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400'}`}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
