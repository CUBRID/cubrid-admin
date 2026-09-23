import React from 'react';
import { Icon } from '../../ds/foundation/Icon';
import { Typography } from '../../ds/foundation/Typography';
import { Skeleton } from '../../ds/layout/Skeleton';
import { StatusIndicator } from '../atoms/StatusIndicator';
import { theme } from '../../../styles/theme';

export const TreeNode = React.memo(({
  id,
  label,
  icon = 'folder',
  level = 1,
  isActive = false,
  isLoading = false,
  hasChildren = false,
  status,
  onToggle,
  onSelect,
  onContextMenu,
  onDoubleClick,
  children,
  open: controlledOpen,
}) => {
  const isControlled = controlledOpen !== undefined;
  const [isOpen, setIsOpen] = React.useState(controlledOpen ?? false);
  const indentClass = level === 1 ? theme.tree.levelOneIndent : theme.tree.levelDeepIndent;

  React.useEffect(() => {
    if (isControlled) {
      setIsOpen(controlledOpen);
    }
  }, [isControlled, controlledOpen]);

  const displayOpen = isControlled ? controlledOpen : isOpen;

  const handleToggle = (e) => {
    e.stopPropagation();
    if (e.target !== e.currentTarget) return;
    const nextOpen = e.target.open;
    if (!isControlled) {
      setIsOpen(nextOpen);
    }
    onToggle?.(nextOpen);
  };

  const handleChevronClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isControlled) {
      onToggle?.();
    }
  };

  const handleSelect = (e) => {
    if (isControlled) {
      e.preventDefault();
    }
    e.stopPropagation();
    if (e.target.closest?.('[data-tree-chevron]')) return;
    if (onSelect) onSelect();
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) {
      onContextMenu(e);
    }
  };

  const handleDoubleClick = (e) => {
    if (onDoubleClick) {
      e.stopPropagation();
      onDoubleClick(e);
    }
  };

  const summaryClasses = `
    flex items-center gap-2 px-2 py-[5px] w-full text-left transition-all duration-150
    cursor-pointer list-none rounded select-none group/node relative border border-transparent
    ${isActive
      ? 'bg-amber-500/6 dark:bg-amber-500/10 border-transparent text-amber-600 dark:text-amber-500'
      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-white/4 hover:text-slate-900 dark:hover:text-slate-200'
    }
  `;

  const ActiveBar = () => (
    <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-amber-500 rounded-full" />
  );

  if (!hasChildren && !children && !isLoading) {
    return (
      <button
        data-testid={id != null ? `tree-node-${id}` : undefined}
        className={summaryClasses}
        onClick={handleSelect}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
      >
        {isActive && <ActiveBar />}
        <span className="w-3 shrink-0" />
        <Icon
          name={icon}
          size="17px"
          weight={300}
          className={`shrink-0 transition-colors ${
            isActive
              ? 'text-amber-500'
              : 'text-slate-400 dark:text-slate-500 group-hover/node:text-slate-600 dark:group-hover/node:text-slate-300'
          }`}
        />
        <Typography
          variant="span"
          title={typeof label === 'string' ? label : undefined}
          className={`text-15 font-mono truncate flex-1 ${
            isActive ? 'font-semibold' : 'font-medium'
          }`}
        >
          {label}
        </Typography>
        {status && <StatusIndicator status={status} animate={status === 'on'} />}
      </button>
    );
  }

  return (
    <details
      id={id}
      data-testid={id != null ? `tree-node-${id}` : undefined}
      data-status={status}
      className="group/details block"
      onToggle={isControlled ? undefined : handleToggle}
      open={displayOpen}
    >
      <summary
        className={summaryClasses}
        onClick={handleSelect}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
      >
        {isActive && <ActiveBar />}

        <span
          data-tree-chevron
          className="shrink-0 flex items-center"
          onClick={isControlled ? handleChevronClick : undefined}
        >
          <Icon
            name="chevron_right"
            size="15px"
            weight={400}
            className={`transition-transform duration-150 ${displayOpen ? 'rotate-90' : ''} ${
              isActive ? 'text-amber-500' : 'text-slate-400 dark:text-slate-600'
            }`}
          />
        </span>

        <Icon
          name={icon}
          size="17px"
          weight={300}
          className={`shrink-0 transition-colors ${
            isActive
              ? 'text-amber-500'
              : 'text-slate-400 dark:text-slate-500 group-hover/node:text-slate-600 dark:group-hover/node:text-slate-300'
          }`}
        />

        <Typography
          variant="span"
          title={typeof label === 'string' ? label : undefined}
          className={`text-15 font-mono truncate flex-1 ${
            isActive ? 'font-semibold' : 'font-medium'
          }`}
        >
          {label}
        </Typography>

        {status && <StatusIndicator status={status} animate={status === 'on'} />}
      </summary>

      <div className={`${indentClass} border-l border-slate-200 dark:border-white/6 space-y-px mt-0.5 ml-[13px]`}>
        {isLoading ? (
          <div className="px-3 py-2 flex items-center gap-2 opacity-60">
            <Skeleton variant="text" width="100px" height="13px" />
          </div>
        ) : (
          children
        )}
      </div>
    </details>
  );
});
