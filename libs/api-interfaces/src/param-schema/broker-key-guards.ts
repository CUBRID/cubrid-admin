import { ParamGuard } from './param-guard';

/**
 * Value rules for cubrid_broker.conf keys BROKER_PARAM_SCHEMA doesn't list,
 * so a hand-edited broker.conf is still checked the way broker_config.c
 * reads it (broker_config_read_internal). Keys are upper case; the broker
 * matches them case-insensitively. Each is read only in a per-broker
 * [%name] section. Checked against v11.4.5; the limits used here are the
 * same from release/11.0 through develop.
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
 */
const ON_OFF: ParamGuard = { kind: 'enum', options: ['ON', 'OFF'] };

export const BROKER_KEY_GUARDS: Record<string, ParamGuard> = {
  // tbl_appl_server
  APPL_SERVER: { kind: 'enum', options: ['CAS', 'CAS_ORACLE', 'CAS_MYSQL51', 'CAS_MYSQL', 'CAS_CGW'] },
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
  // ini_getuint_max (..., DEFAULT_JOB_QUEUE_SIZE, JOB_QUEUE_MAX_SIZE = 4096).
  JOB_QUEUE_SIZE: { kind: 'int', min: 0, max: 4096, base: 0 },
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
