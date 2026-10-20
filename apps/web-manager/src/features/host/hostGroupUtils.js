/** Mirrors apps/api-server/src/host/host-group.util.ts UNGROUPED_GROUP_ID — reserved bucket id for hosts with no user-created group. */
export const UNGROUPED_GROUP_ID = '__ungrouped__';

/** Drag payload MIME type used when dragging a host row in the sidebar tree. */
export const HOST_DRAG_MIME = 'application/x-cubrid-host';

/** Flatten nested host_groups into a host array (no groupId on host objects). */
export function flattenHostsFromGroups(hostGroups) {
  const hosts = [];
  if (!hostGroups) return hosts;
  for (const group of Object.values(hostGroups)) {
    for (const host of Object.values(group.hosts || {})) {
      hosts.push(host);
    }
  }
  return hosts;
}

/** addHost only returns the updated host_groups map, not the new host's uid —
 * find it by matching the connection fields the backend enforces as unique. */
export function findHostUidByConnection(hostGroups, { address, port, id }) {
  const hosts = flattenHostsFromGroups(hostGroups);
  const match = hosts.find((h) =>
    String(h.address) === String(address) && String(h.port) === String(port) && h.id === id
  );
  return match?.uid ?? null;
}

export function findGroupIdForHost(hostGroups, hostUid) {
  if (!hostGroups || !hostUid) return null;
  for (const [groupId, group] of Object.entries(hostGroups)) {
    if (group.hosts?.[hostUid]) return groupId;
  }
  return null;
}

/** Group id present in `nextGroups` but not in `previousGroups` (e.g. after createHostGroup). */
export function findNewGroupId(previousGroups, nextGroups) {
  const prev = new Set(Object.keys(previousGroups || {}));
  return Object.keys(nextGroups || {}).find((id) => !prev.has(id)) ?? null;
}

export function getGroupHostUids(group) {
  return Object.keys(group?.hosts || {});
}

/** Host UIDs in one group or entire tree that are not CMS-logged-in yet. */
export function getUnauthorizedHostUids(hostGroups, authorizedHosts, groupId = null) {
  const authorized = new Set(authorizedHosts || []);
  const uids = [];

  const groups = groupId
    ? (hostGroups?.[groupId] ? [[groupId, hostGroups[groupId]]] : [])
    : Object.entries(hostGroups || {});

  for (const [, group] of groups) {
    for (const uid of Object.keys(group?.hosts || {})) {
      if (!authorized.has(uid)) uids.push(uid);
    }
  }
  return uids;
}

export function resolveDefaultHostUid(group) {
  if (!group) return null;
  if (group.defaultHostUid && group.hosts?.[group.defaultHostUid]) {
    return group.defaultHostUid;
  }
  const uids = getGroupHostUids(group);
  return uids[0] ?? null;
}

/** Ungrouped bucket always sorts last; other groups sort alphabetically by name. */
export function orderedGroupEntries(hostGroups) {
  return Object.entries(hostGroups || {}).sort(([idA, a], [idB, b]) => {
    const aUngrouped = idA === UNGROUPED_GROUP_ID;
    const bUngrouped = idB === UNGROUPED_GROUP_ID;
    if (aUngrouped !== bUngrouped) return aUngrouped ? 1 : -1;
    return (a.name || '').localeCompare(b.name || '');
  });
}

const HA_ROLE_SORT_ORDER = { master: 0, slave: 1, replica: 2 };

/**
 * Strip a (master)/(slave)/(replica) tag from the END of a host alias, for
 * display only. This used to undo a real mutation (processHaLoginSideEffects
 * persisted this tag onto the host's actual alias) — that mutation is gone,
 * so this now only cleans up aliases that were already tagged by the old
 * code before this fix shipped. Anchored to the end of the string so it
 * can't also eat a user-typed "(master)" that appears anywhere but there.
 */
export function stripHaRoleTagFromAlias(alias) {
  return (alias || '')
    .replace(/\s*\((master|slave|replica)\)$/i, '')
    .trim();
}

/** HA role from live Redux haInfo — never inferred from the alias text. */
export function inferHaNodeType(host, haInfoEntry) {
  const fromStore = haInfoEntry?.isHA ? haInfoEntry.currentNodeType : null;
  if (fromStore && HA_ROLE_SORT_ORDER[fromStore] !== undefined) return fromStore;
  return null;
}

/** Sort host UIDs within a group: master → slave → replica → unknown (then alias). */
export function sortHostUidsByHaRole(hostUids, hostsByUid, haInfoByUid = {}) {
  const roleRank = (uid) => {
    const role = inferHaNodeType(hostsByUid?.[uid], haInfoByUid[uid]);
    return role != null && HA_ROLE_SORT_ORDER[role] !== undefined
      ? HA_ROLE_SORT_ORDER[role]
      : 99;
  };
  const label = (uid) =>
    (hostsByUid?.[uid]?.alias || hostsByUid?.[uid]?.id || uid).toLowerCase();

  return [...hostUids].sort((a, b) => {
    const byRole = roleRank(a) - roleRank(b);
    if (byRole !== 0) return byRole;
    return label(a).localeCompare(label(b));
  });
}
