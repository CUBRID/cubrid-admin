import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../../components/ds/foundation/Icon';

/**
 * A single tab item in the Breadcrumb bar.
 */
export default function TabItem({
  tabId,
  isActive,
  isDirty,
  label,
  icon,
  closeLabel,
  onClick,
  onClose,
  onContextMenu
}) {
  const labelRef = useRef(null);
  const [isLabelTruncated, setIsLabelTruncated] = useState(false);

  const updateLabelTruncation = useCallback(() => {
    const labelElement = labelRef.current;
    if (!labelElement) return;
    setIsLabelTruncated(labelElement.scrollWidth > labelElement.clientWidth + 1);
  }, []);

  useLayoutEffect(() => {
    updateLabelTruncation();
  }, [label, updateLabelTruncation]);

  useEffect(() => {
    const labelElement = labelRef.current;
    if (!labelElement) return undefined;

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateLabelTruncation);
    observer?.observe(labelElement);
    window.addEventListener('resize', updateLabelTruncation);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateLabelTruncation);
    };
  }, [updateLabelTruncation]);

  return (
    <div
      data-testid={`tab-${tabId}`}
      data-tab-id={tabId}
      title={isLabelTruncated ? label : undefined}
      aria-label={label}
      className={`group flex flex-none items-center gap-2 px-3 h-full border-r cursor-pointer min-w-[160px] max-w-[260px] transition-colors whitespace-nowrap relative select-none ${
        isActive
          ? 'bg-white dark:bg-bk-main border-r-slate-200 dark:border-r-white/6 z-10'
          : 'bg-slate-100/80 dark:bg-bk-side border-r-slate-200 dark:border-r-white/4 text-slate-500 hover:bg-white/70 dark:hover:bg-white/3'
      }`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      role="tab"
      tabIndex={isActive ? 0 : -1}
      aria-selected={isActive}
    >
      {/* Active indicator bar */}
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-amber-500" />
      )}

      {/* Icon + dirty dot */}
      <div className="relative flex items-center justify-center shrink-0">
        <Icon 
           name={icon || 'description'} 
           size="17px" 
           className={isActive ? 'text-amber-500' : 'text-slate-400 dark:text-slate-600'} 
           weight={isActive ? 400 : 300}
        />
        {isDirty && (
          <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-500 rounded-full border border-white dark:border-bk-side shadow-xs" />
        )}
      </div>
      
      {/* Label */}
      <span
        ref={labelRef}
        data-testid={`tab-${tabId}-label`}
        className={`min-w-0 truncate flex-1 text-14 font-semibold tracking-tight leading-none ${isActive ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-500'}`}
      >
        {label}
      </span>

      {/* Close button */}
      <button
        type="button"
        data-testid={`tab-${tabId}-close`}
        aria-label={closeLabel}
        className={`flex items-center justify-center w-5 h-5 rounded-sm hover:bg-slate-200 dark:hover:bg-white/10 transition-all shrink-0 ${isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:opacity-100!'}`}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <Icon name="close" size="14px" weight={400} className="text-slate-500 dark:text-slate-400" />
      </button>
    </div>
  );
}
