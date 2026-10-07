import React from 'react';
import { Icon } from '../foundation/Icon';

export function PageToolbar({
  icon,
  title,
  subtitle,
  titleMonospace = false,
  iconClassName = 'text-amber-600 dark:text-bk-yellow',
  iconContainerClassName = 'bg-amber-50 dark:bg-amber-900/20',
  center,
  actions,
  className = '',
}) {
  return (
    <header className={`page-toolbar-container shrink-0 bg-white dark:bg-bk-side border-b border-slate-200 dark:border-slate-800 z-10 ${className}`}>
      <div className="page-toolbar-shell px-4 py-2.5 flex items-center justify-between gap-3 font-sans">
        <div className="page-toolbar-identity flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconContainerClassName}`}>
            <Icon name={icon} size="sm" weight={300} className={iconClassName} />
          </div>
          <div className="min-w-0">
            <h2
              className={`text-[13px] font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate ${titleMonospace ? 'font-mono' : ''}`}
              title={typeof title === 'string' ? title : undefined}
            >
              {title}
            </h2>
            {subtitle && (
              <p
                className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate"
                title={typeof subtitle === 'string' ? subtitle : undefined}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {center && <div className="page-toolbar-center shrink-0">{center}</div>}
        {actions && <div className="page-toolbar-actions flex items-center gap-1 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
