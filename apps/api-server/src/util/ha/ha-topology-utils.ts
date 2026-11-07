import type { HaClusterNodeClient } from '@api-interfaces';
import { splitConfList } from '@api-interfaces';
import type { GetAllSysParamCmsResponse } from '@type/cms-response/get-all-sys-param-cms-response';
import type {
  HaApplyLogElementItem,
  HaCopyLogElementItem,
  HaDbModeItem,
  HaDbProcInfoItem,
  HaServerItem,
  HeartbeatListCmsResponse,
} from '@type/cms-response/heartbeat-list-cms-response';
import type { StartInfoCmsResponse } from '@type/cms-response/start-info-cms-response';
import { CMS_CONFNAME_CUBRID, CMS_CONFNAME_HACONF } from '@database/database.constants';
import { parseConfigParamsBySection } from '../config/parse-config-params';

/**
 * databases.txt (CMS confname `databases`) as name -> volume path. Columns
 * are white-space separated: name, vol-path, db-host, log-path, lob-base-path;
 * '#' starts a comment line.
 */
export function parseDatabasesTxt(response: Pick<GetAllSysParamCmsResponse, 'conflist'>): Map<string, string> {
  const lines = response?.conflist?.[0]?.confdata ?? [];
  const out = new Map<string, string>();
  for (const line of Array.isArray(lines) ? lines : [lines]) {
    const text = String(line ?? '').trim();
    if (text === '' || text.startsWith('#')) continue;
    const [name, volPath] = text.split(/\s+/);
    if (name && volPath && !out.has(name)) out.set(name, volPath);
  }
  return out;
}

/**
 * Database names listed in `[common]` `ha_db_list` of cubrid_ha.conf (CMS confname `haconf`).
 * The list splits as the engine splits it (splitConfList: spaces, commas,
 * colons); empty or missing `ha_db_list` yields an empty set (no HA DBs).
 */
export function parseHaDbListDbNamesFromHaConf(
  response: Pick<GetAllSysParamCmsResponse, 'conflist'>
): Set<string> {
  const grouped = parseConfigParamsBySection(response as GetAllSysParamCmsResponse);
  const commonSectionKey = Object.keys(grouped).find((k) => k.trim().toLowerCase() === 'common');
  if (!commonSectionKey) {
    return new Set<string>();
  }

  const commonParams = grouped[commonSectionKey] ?? {};
  const haDbListKey = Object.keys(commonParams).find(
    (k) => k.trim().toLowerCase() === 'ha_db_list'
  );
  const raw = haDbListKey ? commonParams[haDbListKey] : undefined;
  const out = new Set<string>();
  if (raw === undefined || raw.trim() === '') {
    return out;
  }

  // Allow inline comments and quoted db names in config values.
  const valueWithoutComment = raw.replace(/[;#].*$/, '').trim();
  for (const part of splitConfList(valueWithoutComment)) {
    const name = part.replace(/^['"]+|['"]+$/g, '');
    if (name) {
      out.add(name);
    }
  }
  return out;
}

// Mirrors CUBRID's own ha_mode_words keyword table (system_parameter.c) —
// only these are HA_MODE_OFF. Everything else, including "replica"/"repl"/
// "r"/"2" (HA_MODE_REPLICA, a distinct enabled mode from "on"'s
// HA_MODE_FAIL_BACK), means HA is enabled for this host. A prior version of
// this check only matched the literal string "on", which made replica hosts
// (whose own cubrid.conf sets ha_mode=replica, not ha_mode=on) look like
// non-HA hosts entirely, skipping heartbeat/peer discovery for them. An
// empty value counts as off, like a missing key.
const HA_MODE_OFF_KEYWORDS = new Set(['', 'off', 'no', 'n', '0', 'false']);

/**
 * Whether cubrid.conf makes the host an HA node: `[common]` `ha_mode` is not
 * off (on, replica). The engine reads cubrid_ha.conf and runs `cubrid
 * heartbeat` only then.
 */
export function isHostHaModeOnFromCubridConf(
  response: Pick<GetAllSysParamCmsResponse, 'conflist'>
): boolean {
  const grouped = parseConfigParamsBySection(response as GetAllSysParamCmsResponse);
  const raw = grouped['common']?.['ha_mode'];
  if (raw === undefined) {
    return false;
  }
  return !HA_MODE_OFF_KEYWORDS.has(raw.trim().toLowerCase());
}

/**
 * The HA databases of a host: the `ha_db_list` ones of cubrid_ha.conf when
 * cubrid.conf makes it an HA node (isHostHaModeOnFromCubridConf), none
 * otherwise. `readConf` reads a conf file by CMS confname; cubrid_ha.conf is
 * read only on an HA node.
 */
export async function readHaDbNames(
  readConf: (confname: string) => Promise<Pick<GetAllSysParamCmsResponse, 'conflist'>>
): Promise<Set<string>> {
  if (!isHostHaModeOnFromCubridConf(await readConf(CMS_CONFNAME_CUBRID))) {
    return new Set<string>();
  }
  return parseHaDbListDbNamesFromHaConf(await readConf(CMS_CONFNAME_HACONF));
}

/**
 * Database names that explicitly set `ha_mode=off` under a `[@dbname]` section.
 * Section title from CMS lines is the part inside brackets, e.g. `[@mydb]` → section `@mydb`.
 */
export function getPerDbHaModeOffDbNames(
  response: Pick<GetAllSysParamCmsResponse, 'conflist'>
): Set<string> {
  const grouped = parseConfigParamsBySection(response as GetAllSysParamCmsResponse);
  const out = new Set<string>();

  for (const [section, params] of Object.entries(grouped)) {
    if (!section.startsWith('@')) {
      continue;
    }
    const haMode = params['ha_mode'];
    if (haMode === undefined) {
      continue;
    }
    if (haMode.trim().toLowerCase() !== 'off') {
      continue;
    }
    const dbname = section.slice(1).trim();
    if (dbname) {
      out.add(dbname);
    }
  }

  return out;
}

/**
 * Collects `dbname` values from CMS `startinfo` domain payload (`dblist`).
 */
export function extractDbNamesFromStartInfo(
  response: Pick<StartInfoCmsResponse, 'dblist'>
): string[] {
  const names = new Set<string>();
  const dblist = response.dblist;
  if (!Array.isArray(dblist)) {
    return [];
  }
  for (const block of dblist) {
    const dbs = block?.dbs;
    if (!Array.isArray(dbs)) {
      continue;
    }
    for (const db of dbs) {
      const n = db?.dbname?.trim();
      if (n) {
        names.add(n);
      }
    }
  }
  return sortUnique(names);
}

function sortUnique(names: Set<string>): string[] {
  return [...names].sort((a, b) => a.localeCompare(b));
}

function addDbModeNames(items: HaDbModeItem[] | undefined, out: Set<string>): void {
  if (!items) {
    return;
  }
  for (const row of items) {
    const n = row?.dbname?.trim();
    if (n) {
      out.add(n);
    }
  }
}

function addDbProcNames(items: HaDbProcInfoItem[] | undefined, out: Set<string>): void {
  if (!items) {
    return;
  }
  for (const row of items) {
    const n = row?.dbname?.trim();
    if (n) {
      out.add(n);
    }
  }
}

function addApplyLogNames(
  blocks: Array<{ element: HaApplyLogElementItem[] }> | undefined,
  out: Set<string>
): void {
  if (!blocks) {
    return;
  }
  for (const block of blocks) {
    const elements = block?.element;
    if (!Array.isArray(elements)) {
      continue;
    }
    for (const el of elements) {
      const n = el?.dbname?.trim();
      if (n) {
        out.add(n);
      }
    }
  }
}

function addCopyLogNames(
  blocks: Array<{ element: HaCopyLogElementItem[] }> | undefined,
  out: Set<string>
): void {
  if (!blocks) {
    return;
  }
  for (const block of blocks) {
    const elements = block?.element;
    if (!Array.isArray(elements)) {
      continue;
    }
    for (const el of elements) {
      const n = el?.dbname?.trim();
      if (n) {
        out.add(n);
      }
    }
  }
}

function collectFromHaServer(server: HaServerItem, out: Set<string>): void {
  addDbModeNames(server.dbmode, out);
  addDbProcNames(server.dbprocinfo, out);
  addApplyLogNames(server.applylogdb, out);
  addCopyLogNames(server.copylogdb, out);
}

/**
 * Collects `dbname` values from CMS `heartbeatlist` domain payload (`hadbinfolist` / servers).
 */
export function extractDbNamesFromHeartbeatList(
  response: Pick<HeartbeatListCmsResponse, 'hadbinfolist'>
): string[] {
  const names = new Set<string>();
  const raw = response.hadbinfolist;

  if (!raw || Array.isArray(raw) === false) {
    return [];
  }

  if (Array.isArray(raw) && raw.length === 0) {
    return [];
  }

  const list = raw as Array<{ server?: HaServerItem[] }>;
  for (const entry of list) {
    const servers = entry?.server;
    if (!Array.isArray(servers)) {
      continue;
    }
    for (const server of servers) {
      if (server) {
        collectFromHaServer(server, names);
      }
    }
  }

  return sortUnique(names);
}

export type HaDbTopologyRow = {
  dbname: string;
  inStartInfo: boolean;
  inHeartbeat: boolean;
  confHaModeOff: boolean;
  /** True when the host runs HA and this DB is treated as participating in HA for this node. */
  effectiveHaDb: boolean;
};

/**
 * Derives per-database HA flags from startinfo names, heartbeat names, cubrid `ha_mode` overrides,
 * and whether the host has global HA enabled in `cubridconf`.
 *
 * Rule (when `hostHaEnabled`): `effectiveHaDb` iff name is in both start and heartbeat sets and
 * not listed as `ha_mode=off` under `[@dbname]`.
 */
export function computeHaDbTopology(params: {
  hostHaEnabled: boolean;
  startInfoNames: Iterable<string>;
  heartbeatNames: Iterable<string>;
  confHaModeOffNames: Iterable<string>;
}): HaDbTopologyRow[] {
  const startSet = new Set<string>();
  for (const n of params.startInfoNames) {
    const t = n.trim();
    if (t) {
      startSet.add(t);
    }
  }

  const hbSet = new Set<string>();
  for (const n of params.heartbeatNames) {
    const t = n.trim();
    if (t) {
      hbSet.add(t);
    }
  }

  const offSet = new Set<string>();
  for (const n of params.confHaModeOffNames) {
    const t = n.trim();
    if (t) {
      offSet.add(t);
    }
  }

  const union = new Set<string>([...startSet, ...hbSet, ...offSet]);
  const rows: HaDbTopologyRow[] = [];

  for (const dbname of sortUnique(union)) {
    const inStartInfo = startSet.has(dbname);
    const inHeartbeat = hbSet.has(dbname);
    const confHaModeOff = offSet.has(dbname);
    const effectiveHaDb =
      params.hostHaEnabled && inStartInfo && inHeartbeat && !confHaModeOff;

    rows.push({
      dbname,
      inStartInfo,
      inHeartbeat,
      confHaModeOff,
      effectiveHaDb,
    });
  }

  return rows;
}

/**
 * Flattens CMS `hanodelist` blocks into a single node array for clients.
 */
export function flattenHanodelist(
  hanodelist: HeartbeatListCmsResponse['hanodelist'] | undefined
): HaClusterNodeClient[] {
  if (!hanodelist || !Array.isArray(hanodelist)) {
    return [];
  }
  const out: HaClusterNodeClient[] = [];
  for (const block of hanodelist) {
    const nodes = block?.node;
    if (!Array.isArray(nodes)) {
      continue;
    }
    for (const n of nodes) {
      if (!n?.hostname?.trim()) {
        continue;
      }
      out.push({
        hostname: n.hostname.trim(),
        ip: (n.ip ?? '').trim(),
        priority: String(n.priority ?? '').trim(),
        state: (n.state ?? '').trim(),
      });
    }
  }
  return out;
}

/**
 * Resolves this host's role: prefer the `hanodelist` entry matching `currentnode`, else `currentnodestate`.
 */
export function resolveCurrentNodeRole(
  currentnode: string | undefined,
  currentnodestate: string | undefined,
  flatNodes: HaClusterNodeClient[]
): string {
  const cn = currentnode?.trim();
  if (cn) {
    const match = flatNodes.find((n) => n.hostname === cn);
    if (match?.state) {
      return match.state;
    }
  }
  return (currentnodestate ?? '').trim();
}
