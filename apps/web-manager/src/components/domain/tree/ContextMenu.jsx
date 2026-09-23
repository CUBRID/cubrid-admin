import React, { useEffect, useRef } from 'react';
import { Icon } from '../../ds/foundation/Icon';
import { Typography } from '../../ds/foundation/Typography';

export const ContextMenu = ({
  items = [],
  isOpen,
  position = { x: 0, y: 0 },
  onClose,
}) => {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    // Use capturing to avoid immediate close from the initiating click event
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('contextmenu', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('contextmenu', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-9999 context-menu-container min-w-[220px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-lg py-1 flex flex-col"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {items.map((item, idx) => {
        if (item.divider) {
          return (
            <div
              key={`divider-${idx}`}
              className="my-1 border-b border-slate-100 dark:border-white/5"
            />
          );
        }

        if (item.header) {
          return (
            <div
              key={`header-${idx}`}
              className="px-4 py-2 text-13 font-medium text-slate-400 border-b border-slate-100 dark:border-white/5 mb-1"
            >
              {item.header}
            </div>
          );
        }

        const isDanger = item.variant === 'danger';
        const colorClass = isDanger
          ? 'text-rose-600 dark:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10'
          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5';

        const iconColor = isDanger ? 'text-rose-500' : 'text-slate-400';

        return (
          <button
            key={item.label || idx}
            className={`flex items-center gap-2 px-4 py-2 text-sm w-full text-left transition-colors ${colorClass} ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={(e) => {
              if (item.disabled) return;
              e.stopPropagation();
              if (item.onClick) item.onClick();
              onClose();
            }}
            disabled={item.disabled}
          >
            {item.icon && (
              <Icon name={item.icon} size="md" className={iconColor}  weight={300} />
            )}
            <Typography variant="span" className="text-sm font-medium">
              {item.label}
            </Typography>
          </button>
        );
      })}
    </div>
  );
};
