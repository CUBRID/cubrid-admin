import { ParamGuard } from './param-guard';
import { compareEngineVersions } from './resolve-param-schema';

/**
 * Value rules for cubrid_broker.conf keys BROKER_PARAM_SCHEMA doesn't list,
 * so a hand-edited broker.conf is still checked the way broker_config.c
 * reads it (broker_config_read_internal). Keys are upper case; the broker
 * matches them case-insensitively. Each is read only in a per-broker
 * [%name] section. Checked against release/11.0 through release/11.4,
 * v11.4.5 and develop (11.5.0). `minVersion`/`maxVersion` are inclusive
 * engine versions, as in the schema tables (VersionedParamSchemaEntry;
 * "11.2.999" closes a whole release line); an entry without them is the
 * same on every one of those refs. Resolved per host by
 * `resolveBrokerKeyGuards`.
 *
 * Readers, as these rules model them:
 * - ini_getint: strtol base 0. An unparsable value becomes 0 (not the
 *   default) and then meets the key's own check. Rejected here as not a
 *   number instead.
 * - ini_getuint: 0, a negative or an unparsable value silently becomes the
 *   default; ini_getuint_max also silently lowers anything above its max to
 *   the max. Such a value is rejected here, since what the broker runs with
 *   is not what the file says.
 * - ini_gethex: base 16.
 * - ON/OFF keys (conf_get_value_table_on_off): only ON or OFF,
 *   case-insensitive; anything else fails the load.
 *
 * Not listed, because the broker accepts any value: paths and names
 * (ACCESS_LOG_DIR, DATABASES_CONNECTION_FILE, SHARD_DB_NAME/USER/PASSWORD,
 * SHARD_KEY_FUNCTION_NAME, SHARD_KEY_LIBRARY_NAME, SHARD_PROXY_LOG_DIR),
 * SHARD_KEY_MODULAR (ini_getuint, no limit), APPL_SERVER_PORT (only read on
 * Windows) and the reserved DEFAULT_SHARD_* keys (never read).
 * The *_LOG_DIR paths go through MAKE_FILEPATH (before 11.4) or
 * make_abs_path (11.4 on); on Linux both cut a long value to the 128-char
 * buffer (strncpy / snprintf) rather than fail the load.
 */
const ON_OFF: ParamGuard = { kind: 'enum', options: ['ON', 'OFF'] };

export interface VersionedBrokerKeyGuard {
  key: string;
  guard: ParamGuard;
  minVersion?: string;
  maxVersion?: string;
}

const GUARDS: Record<string, ParamGuard | Omit<VersionedBrokerKeyGuard, 'key'>[]> = {
  // tbl_appl_server: CAS_CGW is added on release/11.2; develop (11.5) drops
  // the Oracle and MySQL CAS types.
  APPL_SERVER: [
    { guard: { kind: 'enum', options: ['CAS', 'CAS_ORACLE', 'CAS_MYSQL51', 'CAS_MYSQL'] }, maxVersion: '11.1.999' },
    { guard: { kind: 'enum', options: ['CAS', 'CAS_ORACLE', 'CAS_MYSQL51', 'CAS_MYSQL', 'CAS_CGW'] }, minVersion: '11.2', maxVersion: '11.4.999' },
    { guard: { kind: 'enum', options: ['CAS', 'CAS_CGW'] }, minVersion: '11.5' },
  ],
  // ut_size_string_to_kbyte, default unit K; < 0 is PARAM_BAD_VALUE, > MAX_ACCESS_LOG_MAX_SIZE (2G) PARAM_BAD_RANGE.
  ACCESS_LOG_MAX_SIZE: { kind: 'brokerSize', defaultUnit: 'K', minKb: 0, maxKb: 2097152 },
  // is_invalid_buf_size: 16, 32, 48 or 64 KB only (11.3 and later; the key is new there).
  NET_BUF_SIZE: { kind: 'brokerSize', defaultUnit: 'K', exactKb: [16, 32, 48, 64] },
  CACHE_USER_INFO: ON_OFF,
  ENABLE_MONITOR_HANG: ON_OFF,
  ENABLE_MONITOR_SERVER: ON_OFF,
  JDBC_CACHE: ON_OFF,
  JDBC_CACHE_HINT_ONLY: ON_OFF,
  REPLICA_ONLY: ON_OFF,
  SHARD: ON_OFF,
  SHARD_IGNORE_HINT: ON_OFF,
  STRIPPED_COLUMN_NAME: ON_OFF,
  TRIGGER_ACTION: ON_OFF,
  // ini_getint with no check after it.
  JDBC_CACHE_LIFE_TIME: { kind: 'int', base: 0 },
  // ini_getuint_max (..., DEFAULT_JOB_QUEUE_SIZE, JOB_QUEUE_MAX_SIZE);
  // broker_shm.h JOB_QUEUE_MAX_SIZE is 2048 through release/11.2, 4096 from
  // release/11.3.
  JOB_QUEUE_SIZE: [
    { guard: { kind: 'int', min: 0, max: 2048, base: 0 }, maxVersion: '11.2.999' },
    { guard: { kind: 'int', min: 0, max: 4096, base: 0 }, minVersion: '11.3' },
  ],
  // ini_getint, < -1 is PARAM_BAD_VALUE.
  MAX_NUM_DELAYED_HOSTS_LOOKUP: { kind: 'int', min: -1, base: 0 },
  // ini_getint, < 1 is PARAM_BAD_VALUE.
  MAX_PREPARED_STMT_COUNT: { kind: 'int', min: 1, base: 0 },
  SHARD_MAX_PREPARED_STMT_COUNT: { kind: 'int', min: 1, base: 0 },
  // ini_getuint_max (..., SQL_LOG2_NONE, SQL_LOG2_MAX = 3); read on Linux only.
  SQL_LOG2: { kind: 'int', min: 0, max: 3, base: 0 },
  // An empty value is PARAM_BAD_VALUE.
  SHARD_CONNECTION_FILE: { kind: 'string', nonEmpty: true },
  SHARD_KEY_FILE: { kind: 'string', nonEmpty: true },
  // ini_getuint; more than MAX_PROXY_NUM (8) is PARAM_BAD_VALUE.
  SHARD_NUM_PROXY: { kind: 'int', min: 0, max: 8, base: 0 },
  // ini_getuint; more than CLIENT_INFO_SIZE_LIMIT (10000) * SHARD_NUM_PROXY is
  // PARAM_BAD_VALUE. Only the bound at the most proxies (8) is checked here.
  SHARD_MAX_CLIENTS: { kind: 'int', min: 0, max: 80000, base: 0 },
  // tbl_proxy_log_mode
  SHARD_PROXY_LOG: { kind: 'enum', options: ['ALL', 'ON', 'SHARD', 'SCHEDULE', 'NOTICE', 'TIMEOUT', 'ERROR', 'NONE', 'OFF'] },
  // ut_size_string_to_kbyte, default unit K; > MAX_PROXY_LOG_MAX_SIZE (about 1G) is PARAM_BAD_RANGE.
  SHARD_PROXY_LOG_MAX_SIZE: { kind: 'brokerSize', defaultUnit: 'K', minKb: 0, maxKb: 1048576 },
  // ini_gethex; 0 only fails when SHARD=ON (checked after all brokers are read).
  SHARD_PROXY_SHM_ID: { kind: 'int', base: 16 },
  // ut_time_string_to_sec, default unit sec, kept as (int); > MAX_PROXY_TIMEOUT_LIMIT (86400) is PARAM_BAD_RANGE.
  SHARD_PROXY_TIMEOUT: { kind: 'brokerTime', maxSec: 86400, truncate: true },
  SHARD_PROXY_CONN_WAIT_TIMEOUT: { kind: 'brokerTime', maxSec: 86400, truncate: true },
};

/** Every rule, version range included (also read by the catalog consistency test). */
export const BROKER_KEY_GUARDS: VersionedBrokerKeyGuard[] = Object.entries(GUARDS).flatMap(([key, rule]) =>
  Array.isArray(rule) ? rule.map((r) => ({ key, ...r })) : [{ key, guard: rule }]
);

/**
 * The guards that apply to an engine version (a bare "11.4" or a full
 * CUBRIDVER banner), keyed by upper-case broker key. Same inclusive
 * [minVersion, maxVersion] filter as resolveParamSchema.
 */
export function resolveBrokerKeyGuards(engineVersion: string): Record<string, ParamGuard> {
  const resolved: Record<string, ParamGuard> = {};
  for (const { key, guard, minVersion, maxVersion } of BROKER_KEY_GUARDS) {
    if (minVersion && compareEngineVersions(engineVersion, minVersion) < 0) continue;
    if (maxVersion && compareEngineVersions(engineVersion, maxVersion) > 0) continue;
    resolved[key] = guard;
  }
  return resolved;
}
