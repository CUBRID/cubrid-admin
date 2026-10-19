import { VersionedParamSchemaEntry } from './param-schema-entry';

/**
 * Master, version-aware rule table for every broker.conf key exposed by
 * BrokerPropertyModal's per-broker `[%name]` section editor. Same role as
 * DATABASE_PARAM_SCHEMA — see that file's header comment. Source
 * citations live in CUBRID-BROKER-PROPERTY-PARAM-AUDIT.md and
 * CUBRID-BROKER-CONF-PARAM-VERSION-MATRIX.md.
 *
 * The 5 global ([broker]-section-only) keys (ACCESS_CONTROL*,
 * MASTER_SHM_ID, ADMIN_LOG_FILE) are deliberately absent — this editor's
 * save path only ever writes into a per-broker `[%name]` section, and
 * giving a global key a per-broker override here hasn't been verified
 * against broker_config_read's actual section-merge rules.
 */
export const BROKER_PARAM_SCHEMA: VersionedParamSchemaEntry[] = [
  { key: 'SERVICE', category: 'common', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'ON' },
  // Real range is 1~65535 (PORT_NUM_LIMIT=USHRT_MAX).
  { key: 'BROKER_PORT', category: 'common', guard: { kind: 'int', min: 1, max: 65535 }, default: '' },
  { key: 'MIN_NUM_APPL_SERVER', category: 'common', guard: { kind: 'int', min: 1 }, default: '5' },
  // Must also be >= MIN_NUM_APPL_SERVER — a cross-field rule, not a single-entry guard.
  { key: 'MAX_NUM_APPL_SERVER', category: 'common', guard: { kind: 'int', min: 1, max: 4096 }, default: '40' }, // APPL_SERVER_NUM_LIMIT
  // Real constraint is "nonzero + unique among this conf's brokers/MASTER_SHM_ID" — not independently enforceable as a single-field guard.
  { key: 'APPL_SERVER_SHM_ID', category: 'common', guard: { kind: 'int', min: 1 }, default: '' },
  { key: 'LOG_DIR', category: 'common', guard: { kind: 'string' }, default: 'log/broker/sql_log' },
  { key: 'ERROR_LOG_DIR', category: 'common', guard: { kind: 'string' }, default: 'log/broker/error_log' },
  { key: 'SQL_LOG', category: 'common', guard: { kind: 'enum', options: ['ON', 'OFF', 'ERROR', 'NOTICE', 'TIMEOUT'] }, default: 'ON' },
  { key: 'TIME_TO_KILL', category: 'common', guard: { kind: 'int', min: 0 }, default: '120' },
  { key: 'SESSION_TIMEOUT', category: 'common', guard: { kind: 'int', min: 0 }, default: '300' },
  // OFF deliberately absent — tbl_keep_connection only has ON/AUTO in all
  // 6 branches; accepting OFF would reintroduce a bug that fails the
  // entire broker.conf parse on next load.
  { key: 'KEEP_CONNECTION', category: 'common', guard: { kind: 'enum', options: ['ON', 'AUTO'] }, default: 'AUTO' },

  { key: 'STATEMENT_POOLING', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'ON' },
  { key: 'LONG_QUERY_TIME', category: 'advance', guard: { kind: 'float', min: 0, max: 86400 }, default: '60' }, // LONG_QUERY_TIME_LIMIT
  { key: 'LONG_TRANSACTION_TIME', category: 'advance', guard: { kind: 'float', min: 0, max: 86400 }, default: '60' },
  { key: 'SQL_LOG_MAX_SIZE', category: 'advance', guard: { kind: 'int', min: 0, max: 2097152 }, default: '100000' }, // MAX_SQL_LOG_MAX_SIZE, KB
  { key: 'LOG_BACKUP', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'OFF' },
  { key: 'SOURCE_ENV', category: 'advance', guard: { kind: 'string' }, default: 'cubrid.env' },
  { key: 'MAX_STRING_LENGTH', category: 'advance', guard: { kind: 'int' }, default: '-1' }, // no range in source; -1 = unlimited convention
  { key: 'ACCESS_LOG', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'ON' },
  { key: 'ACCESS_LIST', category: 'advance', guard: { kind: 'string' }, default: '' },
  { key: 'CCI_PCONNECT', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'OFF' },
  { key: 'ACCESS_MODE', category: 'advance', guard: { kind: 'enum', options: ['RW', 'RO', 'SO'] }, default: 'RW' },
  { key: 'PREFERRED_HOSTS', category: 'advance', guard: { kind: 'string' }, default: '' },
  { key: 'CCI_DEFAULT_AUTOCOMMIT', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'ON' },
  { key: 'READ_ONLY_BROKER', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'OFF' },
  { key: 'APPL_SERVER_MAX_SIZE', category: 'advance', guard: { kind: 'size' }, default: '0' },
  { key: 'APPL_SERVER_MAX_SIZE_HARD_LIMIT', category: 'advance', guard: { kind: 'size', min: 1 }, default: '1G' }, // must be > 0
  { key: 'MAX_QUERY_TIMEOUT', category: 'advance', guard: { kind: 'int', min: 0, max: 86400 }, default: '0' },
  { key: 'AUTO_ADD_APPL_SERVER', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'ON' },
  { key: 'CONNECT_ORDER', category: 'advance', guard: { kind: 'enum', options: ['SEQ', 'RANDOM'] }, default: 'SEQ' },
  { key: 'RECONNECT_TIME', category: 'advance', guard: { kind: 'int', min: 0 }, default: '600' },
  { key: 'SLOW_LOG', category: 'advance', guard: { kind: 'enum', options: ['ON', 'OFF'] }, default: 'ON' },
  { key: 'SLOW_LOG_DIR', category: 'advance', guard: { kind: 'string' }, default: '' },
];
