import { VersionedParamSchemaEntry } from './param-schema-entry';

/**
 * Master, version-aware rule table for every broker.conf key exposed by
 * BrokerPropertyModal's per-broker `[%name]` section editor. Same role as
 * DATABASE_PARAM_SCHEMA — see that file's header comment. Source
 * citations live in CUBRID-BROKER-PROPERTY-PARAM-AUDIT.md and
 * CUBRID-BROKER-CONF-PARAM-VERSION-MATRIX.md.
 *
 * The 5 true shared ([broker]-section-only) keys (ACCESS_CONTROL*,
 * MASTER_SHM_ID, ADMIN_LOG_FILE) ARE included below, flagged
 * `commonOnly: true` — broker_config.c reads them via the literal
 * `SECTION_NAME` ("broker"), never any per-broker `[%name]` section, so
 * they only ever make sense in the shared common-properties editor.
 *
 * NOTE: `category` here (`'common'`/`'advance'`) is a pre-existing,
 * unrelated UI grouping (simple vs. advanced fields) — it has nothing to
 * do with `commonOnly`/`instanceOnly`, which are about which *conf
 * section* a key may be written to.
 */
export const BROKER_PARAM_SCHEMA: VersionedParamSchemaEntry[] = [
  { key: 'SERVICE', category: 'common', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'ON' },
  // Real range is 1~65535 (PORT_NUM_LIMIT=USHRT_MAX). instanceOnly:
  // broker_config.c's check_port_number rejects two brokers sharing a
  // port — a single shared value would collide by construction, and
  // [broker] has no inheritance into [%name] anyway (ini_parser.c does
  // exact "section:key" lookups, no section fallback). required: read via
  // `ini_getint(..., "BROKER_PORT", 0, ...)` then `if (port == 0) { ...;
  // goto conf_error; }` — absence/0 fails the WHOLE broker.conf load, not
  // just this key.
  { key: 'BROKER_PORT', category: 'common', guard: { kind: 'int', min: 1, max: 65535, base: 0 }, default: '', instanceOnly: true, required: true },
  { key: 'MIN_NUM_APPL_SERVER', category: 'common', guard: { kind: 'int', min: 1, base: 0 }, default: '5' },
  // Must also be >= MIN_NUM_APPL_SERVER — source-confirmed, not a guess:
  // broker_config.c:716-719 hard-fails the whole config load with
  // PARAM_BAD_MAX_APPL_SERVER when max < min. Enforced via `crossField`
  // (validateCrossFieldParams), not expressible as a single-entry guard.
  { key: 'MAX_NUM_APPL_SERVER', category: 'common', guard: { kind: 'int', min: 1, max: 4096, base: 0 }, default: '40', crossField: { comparedToKey: 'MIN_NUM_APPL_SERVER', rule: 'gte' } }, // APPL_SERVER_NUM_LIMIT
  // instanceOnly: broker_config.c enforces this value is nonzero and
  // unique among this conf's brokers *and* MASTER_SHM_ID (lines ~1296-1312)
  // — same collision reasoning as BROKER_PORT above. required: same
  // `ini_gethex(..., 0, ...)` + `if (== 0) goto conf_error` pattern as
  // BROKER_PORT/MASTER_SHM_ID.
  { key: 'APPL_SERVER_SHM_ID', category: 'common', guard: { kind: 'int', min: 1, base: 16 }, default: '', instanceOnly: true, required: true },
  { key: 'LOG_DIR', category: 'common', guard: { kind: 'string' }, default: 'log/broker/sql_log' },
  { key: 'ERROR_LOG_DIR', category: 'common', guard: { kind: 'string' }, default: 'log/broker/error_log' },
  // tbl_sql_log_mode: ALL/ON, NOTICE, TIMEOUT, ERROR, NONE/OFF.
  { key: 'SQL_LOG', category: 'common', guard: { kind: 'enum', options: ['ALL', 'ON', 'NOTICE', 'TIMEOUT', 'ERROR', 'NONE', 'OFF'] }, default: 'ON' },
  // Broker readers, per key (broker_config.c): ini_getint = strtol base 0,
  // ini_gethex = base 16 (an unparsable value silently becomes 0, which
  // the *_SHM_ID / BROKER_PORT checks then reject); time keys go through
  // ut_time_string_to_sec, SQL_LOG_MAX_SIZE through ut_size_string_to_kbyte
  // with K as the default unit (engine default "10M").
  { key: 'TIME_TO_KILL', category: 'common', guard: { kind: 'brokerTime', truncate: true }, default: '120' },
  { key: 'SESSION_TIMEOUT', category: 'common', guard: { kind: 'brokerTime', truncate: true }, default: '300' },
  // OFF deliberately absent — tbl_keep_connection only has ON/AUTO in all
  // 6 branches; accepting OFF would reintroduce a bug that fails the
  // entire broker.conf parse on next load.
  { key: 'KEEP_CONNECTION', category: 'common', guard: { kind: 'enum', options: ['ON', 'AUTO'] }, default: 'AUTO' },

  { key: 'STATEMENT_POOLING', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'ON' },
  { key: 'LONG_QUERY_TIME', category: 'advance', guard: { kind: 'brokerTime', maxSec: 86400 }, default: '60' }, // LONG_QUERY_TIME_LIMIT
  { key: 'LONG_TRANSACTION_TIME', category: 'advance', guard: { kind: 'brokerTime', maxSec: 86400 }, default: '60' },
  { key: 'SQL_LOG_MAX_SIZE', category: 'advance', guard: { kind: 'brokerSize', defaultUnit: 'K', minKb: 0, maxKb: 2097152 }, default: '10M' }, // MAX_SQL_LOG_MAX_SIZE, KB
  { key: 'LOG_BACKUP', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'OFF' },
  { key: 'SOURCE_ENV', category: 'advance', guard: { kind: 'string' }, default: 'cubrid.env' },
  { key: 'MAX_STRING_LENGTH', category: 'advance', guard: { kind: 'int', base: 0 }, default: '-1' }, // no range in source; -1 = unlimited convention
  // broker_config.c: INI_GETSTR_CHK (s, ini, sec_name, "ACCESS_LOG", "OFF", ...) on release/11.0-11.4 and develop.
  { key: 'ACCESS_LOG', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'OFF' },
  { key: 'ACCESS_LIST', category: 'advance', guard: { kind: 'string' }, default: '' },
  { key: 'CCI_PCONNECT', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'OFF' },
  { key: 'ACCESS_MODE', category: 'advance', guard: { kind: 'enum', options: ['RW', 'RO', 'SO'] }, default: 'RW' },
  { key: 'PREFERRED_HOSTS', category: 'advance', guard: { kind: 'string' }, default: '' },
  { key: 'CCI_DEFAULT_AUTOCOMMIT', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'ON' },
  { key: 'READ_ONLY_BROKER', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'OFF' },
  // ut_size_string_to_kbyte (size_str, "M"): broker_config.c rejects a
  // result < 0 (MAX_SIZE) or <= 0 after the int cast (HARD_LIMIT) — so e.g.
  // HARD_LIMIT=512B (0.5K -> 0) fails the whole broker.conf load.
  { key: 'APPL_SERVER_MAX_SIZE', category: 'advance', guard: { kind: 'brokerSize', defaultUnit: 'M', minKb: 0 }, default: '0' },
  { key: 'APPL_SERVER_MAX_SIZE_HARD_LIMIT', category: 'advance', guard: { kind: 'brokerSize', defaultUnit: 'M', minKb: 1 }, default: '1G' },
  { key: 'MAX_QUERY_TIMEOUT', category: 'advance', guard: { kind: 'brokerTime', maxSec: 86400, truncate: true }, default: '0' },
  { key: 'AUTO_ADD_APPL_SERVER', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'ON' },
  { key: 'CONNECT_ORDER', category: 'advance', guard: { kind: 'enum', options: ['SEQ', 'RANDOM'] }, default: 'SEQ' },
  { key: 'RECONNECT_TIME', category: 'advance', guard: { kind: 'brokerTime', truncate: true }, default: '600' },
  { key: 'SLOW_LOG', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'ON' },
  { key: 'SLOW_LOG_DIR', category: 'advance', guard: { kind: 'string' }, default: '' },
  // broker_config.c: INI_GETSTR_CHK (s, ini, sec_name, "SSL", DEFAULT_SSL_MODE)
  // then conf_get_value_table_on_off — only ON/OFF, anything else fails the
  // whole broker.conf load (PARAM_BAD_VALUE). DEFAULT_SSL_MODE is "OFF" on
  // release/11.0 through develop.
  { key: 'SSL', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'OFF' },

  // ── [broker] section only (commonOnly) — broker_config.c:560-607 reads
  // these via SECTION_NAME ("broker") exclusively, never per-broker. ──
  // required: `ini_gethex(..., "MASTER_SHM_ID", 0, ...)` then
  // `if (master_shm_id == 0) { PRINTERROR(...); goto conf_error; }` —
  // fails the entire broker.conf load, not just this key.
  { key: 'MASTER_SHM_ID', category: 'common', guard: { kind: 'int', min: 1, base: 16 }, default: '', commonOnly: true, required: true }, // ini_gethex, no documented range
  { key: 'ADMIN_LOG_FILE', category: 'common', guard: { kind: 'string' }, default: 'log/broker/cubrid_broker.log', commonOnly: true },
  { key: 'ACCESS_CONTROL', category: 'common', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'OFF', commonOnly: true },
  { key: 'ACCESS_CONTROL_FILE', category: 'common', guard: { kind: 'string' }, default: '', commonOnly: true },
  // minVersion: ACCESS_CONTROL_DEFAULT_POLICY doesn't exist on
  // release/11.0 through release/11.3 (grep-confirmed absent on all 4);
  // first appears on release/11.4.
  { key: 'ACCESS_CONTROL_DEFAULT_POLICY', category: 'common', guard: { kind: 'enum', options: ['ALLOW', 'DENY'] }, default: 'DENY', commonOnly: true, minVersion: '11.4' },
];
