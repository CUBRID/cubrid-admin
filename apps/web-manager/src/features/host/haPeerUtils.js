import { flattenHostsFromGroups, findGroupIdForHost } from './hostGroupUtils';

// CUBRID's HA_SERVER_STATE (boot.h) as reported per-db in the heartbeat's
// dbmode.server_mode — the individual db server's own replication state,
// distinct from the node-level master/slave/replica role. Shared styling
// config for every place that renders this as a badge (DatabaseTree,
// DatabaseListSection, ...).
export const HA_DB_STATE_CONFIG = {
  active: { cmKey: 'haDbActive', className: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' },
  standby: { cmKey: 'haDbStandby', className: 'bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400' },
  'to-be-active': { cmKey: 'haDbToBeActive', className: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400' },
  'to-be-standby': { cmKey: 'haDbToBeStandby', className: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400' },
  maintenance: { cmKey: 'haDbMaintenance', className: 'bg-slate-500/10 border-slate-400/20 text-slate-500 dark:text-slate-400' },
  dead: { cmKey: 'haDbDead', className: 'bg-rose-500/10 border-rose-500/20 text-rose-500' },
  idle: { cmKey: 'haDbIdle', className: 'bg-slate-500/10 border-slate-400/20 text-slate-500 dark:text-slate-400' },
};

/** Node list from a `getHaHeartbeatList` response's `hanodelist[0].node`, normalized to an array. */
export function extractHaHeartbeatNodes(haHeartbeat) {
  const rawNodeGroups = haHeartbeat?.hanodelist;
  const nodeGroups = Array.isArray(rawNodeGroups) ? rawNodeGroups : (rawNodeGroups ? [rawNodeGroups] : []);
  const rawNodes = nodeGroups[0]?.node;
  return Array.isArray(rawNodes) ? rawNodes : (rawNodes ? [rawNodes] : []);
}

/**
 * Per-database HA replication state (CUBRID's HA_SERVER_STATE: "active",
 * "standby", "to-be-active", "to-be-standby", "maintenance", "dead", "idle" —
 * see boot.h's HA_SERVER_STATE_*_STR macros) for every database this
 * heartbeat reports, read from `hadbinfolist[].server[].dbmode[].server_mode`
 * (CMS's cmd_get_db_mode, cm_job_task.cpp). Distinct from the node-level
 * master/slave/replica role: this is the individual db server process's own
 * replication state on this node.
 */
export function getHaDbServerModes(haHeartbeat) {
  const modes = new Map();
  const raw = haHeartbeat?.hadbinfolist;
  if (!raw) return modes;

  const ensureArray = (val) => {
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };

  ensureArray(raw).forEach((entry) => {
    ensureArray(entry?.server).forEach((server) => {
      ensureArray(server?.dbmode).forEach((row) => {
        if (row?.dbname && row?.server_mode) {
          modes.set(row.dbname, row.server_mode.trim().toLowerCase());
        }
      });
    });
  });

  return modes;
}

/**
 * True when `dbname` appears anywhere in the heartbeat's per-database HA
 * status (`hadbinfolist[].server[].{dbmode,dbprocinfo,applylogdb,copylogdb}`)
 * — i.e. this database is a live member of an HA pair, not just sitting on a
 * host that happens to also run HA for some other database.
 */
export function isDatabaseInHa(haHeartbeat, dbname) {
  const raw = haHeartbeat?.hadbinfolist;
  if (!raw || !dbname) return false;

  const ensureArray = (val) => {
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };

  let found = false;
  ensureArray(raw).forEach((entry) => {
    const servers = entry?.server;
    if (!servers) return;

    ensureArray(servers).forEach((server) => {
      if (!server) return;

      ensureArray(server.dbmode).forEach((row) => {
        if (row?.dbname === dbname) found = true;
      });
      ensureArray(server.dbprocinfo).forEach((row) => {
        if (row?.dbname === dbname) found = true;
      });
      ensureArray(server.applylogdb).forEach((block) => {
        if (block?.element) {
          ensureArray(block.element).forEach((el) => {
            if (el?.dbname === dbname) found = true;
          });
        }
      });
      ensureArray(server.copylogdb).forEach((block) => {
        if (block?.element) {
          ensureArray(block.element).forEach((el) => {
            if (el?.dbname === dbname) found = true;
          });
        }
      });
    });
  });

  return found;
}

/**
 * True when the heartbeat lists at least one node but none of them report
 * MASTER — likely mid-failover. False (not abnormal) when there's no
 * heartbeat data at all yet, so a still-loading dashboard isn't mistaken for
 * a failover.
 */
export function isHaClusterMissingMaster(haHeartbeat) {
  const nodes = extractHaHeartbeatNodes(haHeartbeat);
  if (nodes.length === 0) return false;
  return !nodes.some((node) => ((node.status || node.state || '').trim().toUpperCase()) === 'MASTER');
}

export function isHaPostLoginModalOpen(hostState) {
  return Boolean(
    hostState?.isDiscoveryModalOpen
      || hostState?.isHaMergeModalOpen
      || hostState?.isHaClusterLinkModalOpen
  );
}

export function clearHaClusterLinkSessionNotices(hostUids = []) {
  for (const uid of hostUids) {
    try {
      sessionStorage.removeItem(`ha_cluster_linked_${uid}`);
    } catch {
      // ignore
    }
  }
}

const isLoopback = (addr) => {
  const value = (addr || '').trim().toLowerCase();
  return value === 'localhost' || value === '127.0.0.1';
};

const normalizeIdent = (value) => (value || '').trim().toLowerCase();

/**
 * Short name vs FQDN, e.g. `node1` ↔ `node1.example.com`.
 * Short-name fallback (first label only) is suppressed when BOTH sides are FQDNs
 * with different domain suffixes — they are distinct endpoints even if the first
 * label matches (e.g. `node1.prod.example.com` ≠ `node1.dev.example.com`).
 */
function hostnameMatches(a, b) {
  const left = normalizeIdent(a);
  const right = normalizeIdent(b);
  if (!left || !right) return false;
  if (left === right) return true;
  // If both carry a domain suffix, they are distinct endpoints — do not
  // collapse to first label, and do not use suffix containment (which would
  // incorrectly match node1.example.com with example.com).
  if (left.includes('.') && right.includes('.')) return false;
  // One side is a plain label (no dots): allow first-label fallback.
  const leftShort = left.split('.')[0];
  const rightShort = right.split('.')[0];
  return leftShort.length > 0 && leftShort === rightShort;
}

/** Match saved host connection to CMS heartbeat peer (ip / hostname). */
export function hostMatchesHaPeer(host, peer) {
  const hAddr = normalizeIdent(host?.address);
  const hAlias = normalizeIdent(host?.alias);
  const nIp = normalizeIdent(peer?.ip);
  const nHost = normalizeIdent(peer?.hostname);

  // Exact identity matches (always authoritative).
  if (hAddr === nIp || hAddr === nHost) return true;

  // IP-confirmed hostname match.
  if (nIp && (hAddr === nIp || hostnameMatches(hAddr, nIp))) return true;

  // Loopback special case.
  if (isLoopback(hAddr) && (isLoopback(nIp) || isLoopback(nHost))) return true;

  // If stored address is FQDN but the peer only exposes a bare short hostname,
  // the first label is too coarse to confirm identity without IP evidence:
  // node1.prod.example.com and node1.dev.example.com both reduce to "node1",
  // so a different cluster's heartbeat can silently suppress discovery or
  // trigger a false merge proposal.  IP evidence was already checked above;
  // if we reach here it did not confirm identity.
  if (hAddr.includes('.') && nHost.length > 0 && !nHost.includes('.')) {
    return false;
  }

  // Alias is a UI display name, not an endpoint identifier.  It must not be
  // used as a fallback for peer matching: alias "node1" on an unrelated host
  // would match any heartbeat peer named "node1".
  return hostnameMatches(hAddr, nHost);
}

export function findHostMatchingHaPeer(hosts, peer, excludeHostUid) {
  return hosts.find((host) => {
    if (excludeHostUid && host.uid === excludeHostUid) return false;
    return hostMatchesHaPeer(host, peer);
  });
}

/** HA nodes from login that are not yet registered as hosts. */
export function findUndiscoveredHaPeers(hosts, haNodes) {
  return (haNodes || []).filter((node) => !findHostMatchingHaPeer(hosts, node));
}

/**
 * Registered peers in the same HA cluster and same group as the anchor host.
 */
export function findRegisteredHaPeersInSameGroup(hostGroups, haNodes, anchorHostUid) {
  const targetGroupId = findGroupIdForHost(hostGroups, anchorHostUid);
  if (!targetGroupId || !haNodes?.length) return [];

  const hosts = flattenHostsFromGroups(hostGroups);
  const peers = [];
  const seenUids = new Set();

  for (const node of haNodes) {
    const matched = findHostMatchingHaPeer(hosts, node, anchorHostUid);
    if (!matched || seenUids.has(matched.uid)) continue;

    const fromGroupId = findGroupIdForHost(hostGroups, matched.uid);
    if (fromGroupId !== targetGroupId) continue;

    seenUids.add(matched.uid);
    peers.push({
      hostUid: matched.uid,
      alias: matched.alias || matched.id,
      address: matched.address,
      port: matched.port,
      haRole: (node.state || '').trim().toLowerCase(),
    });
  }

  return peers;
}

/**
 * Peers in the same HA cluster (haNodes) that exist in host list but live in another group.
 */
export function findHaPeersNeedingMerge(hostGroups, haNodes, anchorHostUid) {
  const targetGroupId = findGroupIdForHost(hostGroups, anchorHostUid);
  if (!targetGroupId || !haNodes?.length) return null;

  const hosts = flattenHostsFromGroups(hostGroups);
  const targetGroupName = hostGroups[targetGroupId]?.name || 'Group';
  const peers = [];
  const seenUids = new Set();

  for (const node of haNodes) {
    const matched = findHostMatchingHaPeer(hosts, node, anchorHostUid);
    if (!matched || seenUids.has(matched.uid)) continue;
    seenUids.add(matched.uid);

    const fromGroupId = findGroupIdForHost(hostGroups, matched.uid);
    if (fromGroupId && fromGroupId !== targetGroupId) {
      peers.push({
        hostUid: matched.uid,
        alias: matched.alias || matched.id,
        address: matched.address,
        port: matched.port,
        fromGroupId,
        fromGroupName: hostGroups[fromGroupId]?.name || 'Group',
        haRole: (node.state || '').trim().toLowerCase(),
      });
    }
  }

  if (peers.length === 0) return null;

  return {
    anchorHostUid,
    targetGroupId,
    targetGroupName,
    peers,
  };
}
