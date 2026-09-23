import React from 'react';
import { Icon } from '../foundation/Icon';

export const Tabs = ({
  tabs = [],
  activeTab,
  onChange,
  variant = 'line',
  className = '',
}) => {
  const isPills = variant === 'pills';

  return (
    <div className={`w-full ${className}`}>
      {/* Tab Bar */}
      <div className={`flex items-center gap-1 ${
        isPills
          ? 'bg-slate-100/80 dark:bg-white/[0.04] p-1 rounded-xl border border-slate-200/60 dark:border-white/[0.06]'
          : 'border-b border-slate-100 dark:border-white/[0.06]'
      }`}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          if (isPills) {
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={`relative flex-1 flex items-center justify-center gap-2 px-4 py-2 text-13 font-semibold rounded-lg border transition-all duration-150 ${
                  isActive
                    ? 'bg-white dark:bg-bk-side text-slate-900 dark:text-amber-500 shadow-sm border-slate-200/80 dark:border-white/10'
                    : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-white/5'
                }`}
              >
                {tab.icon && (
                  <Icon
                    name={tab.icon}
                    size="14px"
                    weight={isActive ? 600 : 300}
                    className={isActive ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}
                  />
                )}
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-amber-500/40" />
                )}
              </button>
            );
          }

          // Line variant
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`relative flex items-center gap-1.5 px-4 py-2 text-14 font-semibold border-b-2 transition-all ${
                isActive
                  ? 'border-amber-500 text-slate-900 dark:text-amber-500'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:border-slate-200 dark:hover:border-slate-700'
              }`}
            >
              {tab.icon && (
                <Icon
                  name={tab.icon}
                  size="14px"
                  weight={isActive ? 600 : 300}
                  className={isActive ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}
                />
              )}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="pt-4">
        {tabs.find((t) => t.id === activeTab)?.content}
      </div>
    </div>
  );
};
