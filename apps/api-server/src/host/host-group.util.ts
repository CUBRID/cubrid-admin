import { v4 as uuidv4 } from 'uuid';
import { omitHashMap } from '@util';
import { HashMap } from '@type/collections';
import { HostGroupInfo, HostInfo, User } from '@type/index';
import { SafeHostList, SafeHostGroupsMap, SafeHostGroupInfo } from '@type/collections';

export type HostRef = {
  groupId: string;
  group: HostGroupInfo;
  host: HostInfo;
};

/**
 * Reserved group id for hosts that don't belong to any user-created group.
 * Always present once touched — cannot be renamed or deleted (see updateGroup/deleteGroup).
 */
export const UNGROUPED_GROUP_ID = '__ungrouped__';

/** Lazily creates the reserved ungrouped bucket. Idempotent. */
export function ensureUngroupedGroup(user: User): HostGroupInfo {
  const groups = ensureHostGroupsWritable(user);
  if (!groups[UNGROUPED_GROUP_ID]) {
    groups[UNGROUPED_GROUP_ID] = { name: 'Ungrouped', hosts: {} };
  }
  return groups[UNGROUPED_GROUP_ID];
}

/** Read path: missing host_groups on deserialized JSON. */
export function readHostGroups(user: Pick<User, 'host_groups'>): HashMap<HostGroupInfo> {
  return user.host_groups ?? {};
}

/** Read path: missing hosts on a group record. */
export function readGroupHosts(group: Pick<HostGroupInfo, 'hosts'>): HashMap<HostInfo> {
  return group.hosts ?? {};
}

/** Write path: ensure host_groups exists before in-place mutation (persisted on save). */
export function ensureHostGroupsWritable(user: User): HashMap<HostGroupInfo> {
  return (user.host_groups ??= {});
}

function ensureGroupHostsWritable(group: HostGroupInfo): HashMap<HostInfo> {
  return (group.hosts ??= {});
}

export function findHostRef(user: User, hostUid: string): HostRef | null {
  for (const [groupId, group] of Object.entries(readHostGroups(user))) {
    const host = readGroupHosts(group)[hostUid];
    if (host) {
      return { groupId, group, host };
    }
  }
  return null;
}

export function getHost(user: User, hostUid: string): HostInfo | null {
  return findHostRef(user, hostUid)?.host ?? null;
}

export function countAllHosts(user: User): number {
  return Object.values(readHostGroups(user)).reduce(
    (n, g) => n + Object.keys(readGroupHosts(g)).length,
    0
  );
}

export function forEachHost(user: User, fn: (ref: HostRef) => void): void {
  for (const [groupId, group] of Object.entries(readHostGroups(user))) {
    for (const host of Object.values(readGroupHosts(group))) {
      fn({ groupId, group, host });
    }
  }
}

export function findDuplicateHost(
  user: User,
  candidate: Pick<HostInfo, 'address' | 'port' | 'id' | 'alias'>,
  excludeHostUid?: string
): HostInfo | undefined {
  let found: HostInfo | undefined;
  forEachHost(user, ({ host }) => {
    if (found || (excludeHostUid && host.uid === excludeHostUid)) return;
    const sameConnection =
      host.address === candidate.address &&
      host.port === candidate.port &&
      host.id === candidate.id;
    if (sameConnection) {
      found = host;
    }
  });
  return found;
}

function hasSameDefinedAlias(a: string | undefined, b: string | undefined): boolean {
  const left = a?.trim() ?? '';
  const right = b?.trim() ?? '';
  return left !== '' && right !== '' && left === right;
}

/** Alias is a user-facing nickname, not a connection identity, so it's checked
 * separately from findDuplicateHost — two different physical hosts can't share
 * one, even though their address/port/id are all different. */
export function findDuplicateAlias(
  user: User,
  alias: string,
  excludeHostUid?: string
): HostInfo | undefined {
  let found: HostInfo | undefined;
  forEachHost(user, ({ host }) => {
    if (found || (excludeHostUid && host.uid === excludeHostUid)) return;
    if (hasSameDefinedAlias(host.alias, alias)) {
      found = host;
    }
  });
  return found;
}

export function sanitizeHostGroups(user: User): SafeHostGroupsMap {
  const out: SafeHostGroupsMap = {};
  for (const [groupId, group] of Object.entries(readHostGroups(user))) {
    out[groupId] = {
      name: group.name,
      defaultHostUid: group.defaultHostUid,
      createdAt: group.createdAt,
      hosts: omitHashMap(readGroupHosts(group), ['password', 'token', 'dbProfiles']) as SafeHostList,
    };
  }
  // Always show the ungrouped bucket, even before any host has ever landed there.
  if (!out[UNGROUPED_GROUP_ID]) {
    out[UNGROUPED_GROUP_ID] = { name: 'Ungrouped', hosts: {} };
  }
  return out;
}

/**
 * Group names are display strings only, never the map key groups are stored
 * under (a real group's key is always a generated uuid — see createEmptyGroup
 * — and UNGROUPED_GROUP_ID is a fixed literal in that same key namespace, not
 * derived from any name). So a user naming a group "__ungrouped__" can't
 * actually collide with the reserved bucket. This guard exists purely so
 * group names don't read like an internal/reserved token in the sidebar.
 */
export function isValidGroupNameStart(name: string): boolean {
  return /^[\p{L}\p{N}]/u.test(name);
}

export function createEmptyGroup(user: User, name: string): string {
  const groupId = uuidv4();
  const trimmed = (name ?? '').trim();
  ensureHostGroupsWritable(user)[groupId] = {
    name: trimmed || 'Group',
    createdAt: new Date().toISOString(),
    hosts: {},
  };
  return groupId;
}

export function deleteGroup(user: User, groupId: string): boolean {
  if (groupId === UNGROUPED_GROUP_ID) return false;
  const groups = readHostGroups(user);
  if (!groups[groupId]) return false;
  delete ensureHostGroupsWritable(user)[groupId];
  return true;
}

export function updateGroup(
  user: User,
  groupId: string,
  patch: { name?: string; defaultHostUid?: string | null }
): boolean {
  const group = readHostGroups(user)[groupId];
  if (!group) return false;

  if (patch.name !== undefined) {
    if (groupId === UNGROUPED_GROUP_ID) {
      throw new Error('CANNOT_RENAME_UNGROUPED');
    }
    const trimmed = String(patch.name ?? '').trim();
    if (!trimmed) {
      throw new Error('BLANK_GROUP_NAME_NOT_ALLOWED');
    }
    if (!isValidGroupNameStart(trimmed)) {
      throw new Error('GROUP_NAME_INVALID_START');
    }
    group.name = trimmed;
  }

  if (patch.defaultHostUid !== undefined) {
    const next = patch.defaultHostUid ?? undefined;
    if (next && !readGroupHosts(group)[next]) {
      throw new Error('DEFAULT_HOST_NOT_IN_GROUP');
    }
    group.defaultHostUid = next;
  }

  return true;
}

export function addHostToGroup(user: User, groupId: string, host: HostInfo): void {
  const group = readHostGroups(user)[groupId];
  if (!group) {
    throw new Error(`Host group not found: ${groupId}`);
  }
  ensureGroupHostsWritable(group)[host.uid] = host;
  if (!group.defaultHostUid) {
    group.defaultHostUid = host.uid;
  }
}

export function moveHostToGroup(user: User, hostUid: string, targetGroupId: string): boolean {
  const ref = findHostRef(user, hostUid);
  if (!ref) return false;

  if (ref.groupId === targetGroupId) {
    return true;
  }

  if (targetGroupId === UNGROUPED_GROUP_ID) {
    ensureUngroupedGroup(user);
  }

  const targetGroup = readHostGroups(user)[targetGroupId];
  if (!targetGroup) {
    return false;
  }

  const host = ref.host;
  const sourceHosts = ensureGroupHostsWritable(ref.group);
  delete sourceHosts[hostUid];

  if (ref.group.defaultHostUid === hostUid) {
    const remaining = Object.values(sourceHosts);
    ref.group.defaultHostUid = remaining[0]?.uid;
  }

  // Empty groups are preserved — users created them intentionally and may
  // want to add more hosts later. Deletion is an explicit user action only.

  ensureGroupHostsWritable(targetGroup)[hostUid] = host;
  if (!targetGroup.defaultHostUid) {
    targetGroup.defaultHostUid = hostUid;
  }

  return true;
}

export function removeHostFromUser(user: User, hostUid: string): boolean {
  const ref = findHostRef(user, hostUid);
  if (!ref) return false;
  const hosts = ensureGroupHostsWritable(ref.group);
  delete hosts[hostUid];
  if (ref.group.defaultHostUid === hostUid) {
    const remaining = Object.values(hosts);
    ref.group.defaultHostUid = remaining[0]?.uid;
  }
  // Empty groups are preserved after host deletion.
  return true;
}

export function findHostMatchingPeer(
  user: User,
  peer: { ip?: string; hostname?: string }
): HostRef | null {
  const nIp = (peer.ip || '').toLowerCase();
  const nHost = (peer.hostname || '').toLowerCase();
  const isLoopback = (addr: string) => addr === 'localhost' || addr === '127.0.0.1';

  let match: HostRef | null = null;
  forEachHost(user, (ref) => {
    if (match) return;
    const hAddr = (ref.host.address || '').toLowerCase();
    if (hAddr === nIp || hAddr === nHost) {
      match = ref;
      return;
    }
    if (isLoopback(hAddr) && (isLoopback(nIp) || isLoopback(nHost))) {
      match = ref;
    }
  });
  return match;
}
