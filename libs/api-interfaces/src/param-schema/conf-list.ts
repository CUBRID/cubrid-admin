import { parseConfText } from './parse-conf-text';

// List values split the way the engine splits them (util_split_string,
// strtok_r): any run of delimiter characters separates two names, and empty
// pieces are dropped. `server=` in `[service]` and the cubrid_ha.conf lists
// (ha_db_list, the hosts of ha_node_list/ha_replica_list,
// ha_copy_sync_mode) use space, comma and colon (util_common.c,
// util_service.c); `service=` uses space, tab and comma (util_service.c).

/** Delimiters of `server=` and the cubrid_ha.conf lists. */
export const CONF_LIST_DELIMITERS = ' ,:';
/** Delimiters of `[service] service=`. */
export const SERVICE_LIST_DELIMITERS = ' \t,';

/** The names in a list value, split on any of `delimiters`. */
export function splitConfList(value: string | null | undefined, delimiters: string = CONF_LIST_DELIMITERS): string[] {
  const names: string[] = [];
  let name = '';
  for (const c of value ?? '') {
    if (!delimiters.includes(c)) {
      name += c;
    } else if (name) {
      names.push(name);
      name = '';
    }
  }
  if (name) names.push(name);
  return names;
}

/**
 * The databases `cubrid service start` starts, read from cubrid.conf as the
 * engine reads it: only `[service]`, the last `service=` and `server=` keys
 * (a later key replaces an earlier one), with quotes, comments, spacing and
 * `\` continued lines handled by parseConfText. Empty when `service=` does
 * not include `server` (matched case-sensitively, as util_service.c does).
 */
export function autoStartDatabases(confdata: string[]): string[] {
  const service = parseConfText(confdata).sections.find((section) => section.name === 'service');
  const last = (key: string) => service?.entries.filter((entry) => entry.key.toLowerCase() === key).slice(-1)[0]?.value;
  if (!splitConfList(last('service'), SERVICE_LIST_DELIMITERS).includes('server')) return [];
  return splitConfList(last('server'));
}
