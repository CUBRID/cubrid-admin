import { useCM } from '../../../../constants/useCM';
import { stripHaRoleTagFromAlias } from '../../../host/hostGroupUtils';

const HA_ROLE_CONFIG = {
  master:  { cmKey: 'haMaster',  icon: 'star',                    className: 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400' },
  slave:   { cmKey: 'haSlave',   icon: 'settings_backup_restore', className: 'bg-slate-500/10 border-slate-400/20 text-slate-500 dark:text-slate-400' },
  replica: { cmKey: 'haReplica', icon: 'copy_all',                className: 'bg-blue-500/10 border-blue-400/20 text-blue-600 dark:text-blue-400'   },
  // The backend falls back to this when heartbeatlist doesn't resolve a
  // known role (e.g. mid-failover, right after ha_start before the node
  // settles) — surfacing it as its own badge instead of silently showing
  // nothing makes that transitional/unhealthy state visible.
  unknown: { cmKey: 'haUnknown', icon: 'help',                    className: 'bg-orange-500/10 border-orange-400/20 text-orange-600 dark:text-orange-400' },
};

export default function ServerListItem({
  host,
  isSelected,
  isMultiSelected = false,
  onMultiSelect,
  isAuthorized,
  haInfo,
  onContextMenu,
  onSelect,
  onActivate,
  compact = false,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
}) {
  const CM = useCM();

  const getInferredHaInfo = () => {
    if (haInfo?.isHA) return haInfo;
    const alias = (host.alias || '').toLowerCase();
    if (alias.includes('(master)')) return { isHA: true, currentNodeType: 'master' };
    if (alias.includes('(slave)')) return { isHA: true, currentNodeType: 'slave' };
    if (alias.includes('(replica)')) return { isHA: true, currentNodeType: 'replica' };
    return null;
  };

  const activeHaInfo = getInferredHaInfo();
  const haRole = activeHaInfo?.currentNodeType;
  const roleConfig = haRole ? HA_ROLE_CONFIG[haRole] : null;

  // Strip HA role tags from display name for cleanliness
  const displayName = stripHaRoleTagFromAlias(host.alias || host.id) || host.id;

  return (
    <div
      title={`${host.address}:${host.port}`}
      data-testid={`host-item-${host.uid}`}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={`relative flex items-center gap-2.5 py-1.5 select-none transition-all duration-150 group
        ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
        ${isDragging ? 'opacity-40' : ''}
        ${compact ? 'pl-6 pr-2' : 'pl-3 pr-2'}
        ${isSelected
          ? 'bg-amber-500/8 dark:bg-amber-500/10'
          : isMultiSelected
            ? 'bg-sky-500/8 dark:bg-sky-500/10'
            : 'hover:bg-slate-100/80 dark:hover:bg-white/[0.04]'
        }
        ${isMultiSelected ? 'ring-1 ring-inset ring-sky-400/40' : ''}`}
      onClick={(e) => {
        // Cmd/Ctrl-click toggles this host in the multi-selection, shift-click
        // range-selects — neither changes the active dashboard host. A plain
        // click clears any multi-selection and falls through to the normal
        // single-select (focus-only) behavior below.
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          onMultiSelect?.(e, host.uid);
          return;
        }
        onMultiSelect?.(e, host.uid);
        onSelect?.(host.uid);
        // A plain click also refreshes the Resources section for an
        // already-authorized host (activation for it never triggers login —
        // onActivate/activateHost only does that for a not-yet-authorized
        // host), so switching focus shows current data without needing the
        // double-click below. A not-yet-authorized host still requires the
        // double-click gesture to trigger login.
        if (isAuthorized) {
          onActivate?.(host.uid);
        }
      }}
      onDoubleClick={() => {
        // Login (if needed) + open the dashboard. onActivate already handles
        // the authorized/unauthorized branches — for an unauthorized host
        // this is still the only gesture that triggers login.
        onActivate?.(host.uid);
      }}
      onContextMenu={(e) => {
        // Prevent bubbling to group TreeNode context menu
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, host.alias || host.id, host.uid, host.alias || host.id);
      }}
    >
      {/* Selected accent bar */}
      <div
        className={`absolute left-0 top-0.5 bottom-0.5 w-[3px] rounded-r-full transition-all duration-200 ${
          isSelected ? 'bg-amber-500 opacity-100' : 'opacity-0'
        }`}
      />

      {/* Status dot: green = online, yellow = online but HA role unknown, red = not logged in */}
      <div className="shrink-0 flex items-center justify-center w-4">
        {isAuthorized ? (
          <span className="relative flex w-1.5 h-1.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-40 ${
              haRole === 'unknown' ? 'bg-amber-400' : 'bg-emerald-400'
            }`} />
            <span className={`relative inline-flex rounded-full w-1.5 h-1.5 ${
              haRole === 'unknown' ? 'bg-amber-500' : 'bg-emerald-500'
            }`} />
          </span>
        ) : (
          <span className="w-1.5 h-1.5 rounded-full flex-none bg-rose-500" />
        )}
      </div>

      {/* Server name */}
      <span className={`flex-1 min-w-0 text-14 leading-none truncate font-medium transition-colors ${
        isSelected
          ? 'text-amber-700 dark:text-amber-400 font-semibold'
          : 'text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200'
      }`}>
        {displayName}
      </span>

      {/* Right side: HA role badge */}
      {roleConfig && (
        <span className={`shrink-0 inline-flex items-center justify-center min-w-[56px] px-1.5 h-4 rounded border text-10 font-black leading-none transition-all whitespace-nowrap ${roleConfig.className}`}>
          {CM[roleConfig.cmKey]}
        </span>
      )}
    </div>
  );
}
