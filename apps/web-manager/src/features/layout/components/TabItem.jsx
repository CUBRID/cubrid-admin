import { Typography } from '../../../components/ds/foundation/Typography';
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
  onClick,
  onClose,
  onContextMenu
}) {
  return (
    <div
      data-testid={`tab-${tabId}`}
      className={`group flex items-center gap-2 px-3 h-full border-r cursor-pointer min-w-[120px] max-w-[220px] transition-colors whitespace-nowrap relative select-none ${
        isActive
          ? 'bg-white dark:bg-bk-main border-r-slate-200 dark:border-r-white/6 z-10'
          : 'bg-slate-100/80 dark:bg-bk-side border-r-slate-200 dark:border-r-white/4 text-slate-500 hover:bg-white/70 dark:hover:bg-white/3'
      }`}
      onClick={onClick}
      onContextMenu={onContextMenu}
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
      <Typography 
        variant="caption" 
        className={`truncate flex-1 text-14 font-semibold tracking-tight leading-none ${isActive ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-500'}`}
      >
        {label}
      </Typography>

      {/* Close button */}
      <div
        data-testid={`tab-${tabId}-close`}
        className={`flex items-center justify-center w-5 h-5 rounded-sm hover:bg-slate-200 dark:hover:bg-white/10 transition-all shrink-0 ${isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:opacity-100!'}`}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <Icon name="close" size="15px" weight={400} className="text-slate-500 dark:text-slate-400" />
      </div>
    </div>
  );
}
