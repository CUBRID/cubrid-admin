import React, { useState } from 'react';
import { Typography } from '../foundation/Typography';
import { Icon } from '../foundation/Icon';

export const Card = ({
  title,
  subtitle,
  rightContent,
  children,
  footer,
  className = '',
  bodyClassName = '',
  collapsible = false,
  defaultCollapsed = false,
  isCollapsed: controlledCollapsed,
  onToggle,
  /** Stable e2e hook — renders data-testid on the card root. */
  testId,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const toggleCollapse = () => {
    if (collapsible) {
      if (onToggle) {
        onToggle(!isCollapsed);
      } else {
        setInternalCollapsed(!isCollapsed);
      }
    }
  };

  const renderSubtitle = typeof subtitle === 'function' ? subtitle(isCollapsed) : subtitle;
  const renderRightContent = typeof rightContent === 'function' ? rightContent(isCollapsed) : rightContent;

  return (
    <div data-testid={testId} className={`bg-white dark:bg-bk-side border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden shadow-xs transition-all duration-300 ${isCollapsed ? 'ring-0 shadow-none' : ''} ${className}`}>
      {(title || renderSubtitle) && (
        <div 
          className={`px-5 py-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/2 flex items-center justify-between ${collapsible ? 'cursor-pointer hover:bg-slate-100/50 dark:hover:bg-white/4 transition-colors group' : ''}`}
          onClick={toggleCollapse}
        >
          <div className="flex-1">
            {title && (
              <Typography variant="h4" className="text-18 font-bold text-slate-900 dark:text-white leading-tight tracking-wide flex items-center gap-2">
                {title}
              </Typography>
            )}
            {renderSubtitle && !isCollapsed && (
              <Typography variant="p" className="text-13 text-slate-500 dark:text-slate-400 mt-1">
                {renderSubtitle}
              </Typography>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {renderRightContent}
            {collapsible && (
              <button 
                className={`w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 dark:text-slate-500 transition-all ${isCollapsed ? '-rotate-90' : ''}`}
              >
                <Icon name="expand_more" size="sm" weight={300} />
              </button>
            )}
          </div>
        </div>
      )}
      
      {!isCollapsed && (
        <>
          <div className={`p-5 animate-in slide-in-from-top-2 duration-300 ${bodyClassName}`}>
            {children}
          </div>
          
          {footer && (
            <div className="px-5 py-3 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/2">
              {footer}
            </div>
          )}
        </>
      )}
    </div>
  );
};
