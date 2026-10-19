/**
 * Source-verified input guards for the table-form parameter editors
 * (DatabasePropertyModal, BrokerPropertyModal), keyed by conf-file key /
 * BROKER_PARAM name. Every bound here was checked against engine source
 * (CUBRID-DATABASE-PROPERTY-PARAM-AUDIT.md, CUBRID-BROKER-PROPERTY-PARAM-AUDIT.md)
 * and confirmed identical across all 6 supported branches (release/11.0-11.4,
 * develop) — a field is only listed here if its guard is version-unaware-safe.
 *
 * Enum/bool-shaped fields (yes|no, ON|OFF, ha_mode's 5 keywords,
 * isolation_level's 3 values, ACCESS_MODE's RW|RO|SO, etc.) are deliberately
 * NOT listed here: both modals render those as a closed <Select>, which
 * already makes an out-of-range value structurally impossible to produce —
 * adding a duplicate guard entry for every one would just be redundant with
 * the option list itself. This registry exists for the fields a free-text
 * <Input> could otherwise get wrong: numeric ranges, 64-bit integers, and
 * comma-separated integer lists.
 */

/** @typedef {{ type: 'int'|'float'|'bigint'|'intList'|'sizeM', min?: number, max?: number }} ParamGuard */

/** @type {Record<string, ParamGuard>} */
export const DATABASE_PARAM_GUARDS = {
  // ADVANCED_PARAMS_SCHEMA
  checkpoint_every_npages: { type: 'int', min: 10 },
  data_aout_ratio: { type: 'float', min: 0.0, max: 3.0 },
  data_buffer_flush_ratio: { type: 'float', min: 0.01, max: 0.95 },
  backup_volume_max_size_bytes: { type: 'bigint', min: 32768 }, // 1024*32; upper is DB_BIGINT_MAX, not independently enforceable client-side
  call_stack_dump_activation_list: { type: 'intList' },
  call_stack_dump_deactivation_list: { type: 'intList' },
  csql_history_num: { type: 'int', min: 1, max: 200 },
  group_commit_interval_in_msecs: { type: 'int', min: 0 },
  ha_port_id: { type: 'int', min: 1, max: 65535 },
  insert_execution_mode: { type: 'int', min: 0, max: 31 }, // bitmask
  max_query_cache_entries: { type: 'int', min: 0 },
  query_cache_size_in_pages: { type: 'int', min: 0 },
  temp_file_memory_size_in_pages: { type: 'int', min: 0, max: 20 },
  unfill_factor: { type: 'float', min: 0.0, max: 0.3 },

  // GENERAL_PARAMS_SCHEMA
  lock_escalation: { type: 'int', min: 5 },
  lock_timeout_in_secs: { type: 'int', min: -1 }, // -1 = unlimited sentinel
  deadlock_detection_interval_in_secs: { type: 'float', min: 0.1 },
  checkpoint_interval_in_mins: { type: 'int', min: 1 },
  cubrid_port_id: { type: 'int', min: 1, max: 65535 },
  max_clients: { type: 'int', min: 10, max: 4000 }, // upper = CSS_MAX_CLIENT_COUNT

  // BUFFER_GROUPS — only the "pages" side is guarded numerically; the
  // "size" side is the same underlying value with a K/M/G/T unit suffix
  // reconciled at save time (getEffectiveParams), so validating pages
  // covers the value regardless of which radio the user picked.
  data_buffer_pages: { type: 'int', min: 1024 },
  sort_buffer_pages: { type: 'int', min: 1 },
  log_buffer_pages: { type: 'int', min: 128 }, // LOGPB_BUFFER_NPAGES_LOWER
  index_scan_oid_buffer_pages: { type: 'float', min: 0.05, max: 16.0 },
};

/** @type {Record<string, ParamGuard>} */
export const BROKER_PARAM_GUARDS = {
  BROKER_PORT: { type: 'int', min: 1, max: 65535 }, // PORT_NUM_LIMIT
  MIN_NUM_APPL_SERVER: { type: 'int', min: 1 },
  MAX_NUM_APPL_SERVER: { type: 'int', min: 1, max: 4096 }, // APPL_SERVER_NUM_LIMIT; must also be >= MIN_NUM_APPL_SERVER, checked separately (cross-field)
  APPL_SERVER_SHM_ID: { type: 'int', min: 1 }, // hex-parsed, must be nonzero; cross-broker uniqueness is not a single-field guard
  TIME_TO_KILL: { type: 'int', min: 0 },
  SESSION_TIMEOUT: { type: 'int', min: 0 },
  LONG_QUERY_TIME: { type: 'float', min: 0, max: 86400 }, // LONG_QUERY_TIME_LIMIT
  LONG_TRANSACTION_TIME: { type: 'float', min: 0, max: 86400 },
  SQL_LOG_MAX_SIZE: { type: 'int', min: 0, max: 2097152 }, // MAX_SQL_LOG_MAX_SIZE, KB
  MAX_QUERY_TIMEOUT: { type: 'int', min: 0, max: 86400 },
  RECONNECT_TIME: { type: 'int', min: 0 },
  APPL_SERVER_MAX_SIZE: { type: 'sizeM', min: 0 },
  APPL_SERVER_MAX_SIZE_HARD_LIMIT: { type: 'sizeM', min: 1 }, // must be > 0
};

/**
 * Validates a raw string value against a guard. Returns `null` when valid,
 * or a short human-readable reason when not. Empty string is treated as
 * valid (an unset field falls back to the engine/schema default, not 0).
 */
export function validateParamValue(guard, rawValue) {
  if (!guard) return null;
  const value = rawValue ?? '';
  if (value === '') return null;

  switch (guard.type) {
    case 'intList': {
      const parts = value.split(',').map(s => s.trim()).filter(s => s !== '');
      const allInts = parts.every(p => /^-?\d+$/.test(p));
      return allInts ? null : 'Comma-separated integers only (e.g. -493,-494)';
    }
    case 'bigint':
    case 'int': {
      if (!/^-?\d+$/.test(value.trim())) return 'Must be an integer';
      // Compare as BigInt so 64-bit values entered for `bigint` fields
      // don't silently lose precision the way Number() would.
      const n = BigInt(value.trim());
      if (guard.min !== undefined && n < BigInt(guard.min)) return `Must be >= ${guard.min}`;
      if (guard.max !== undefined && n > BigInt(guard.max)) return `Must be <= ${guard.max}`;
      return null;
    }
    case 'sizeM': {
      // APPL_SERVER_MAX_SIZE-style values: a plain number of megabytes, or
      // that number with a K/M/G/T unit suffix (broker_config.c's size
      // parser). "0" (no suffix) is the documented "unlimited" sentinel.
      const match = /^(\d+)([KMGT])?$/i.exec(value.trim());
      if (!match) return 'Must be a number optionally followed by K/M/G/T (e.g. 512 or 1G)';
      const n = Number(match[1]);
      if (guard.min !== undefined && n < guard.min) return `Must be >= ${guard.min}`;
      if (guard.max !== undefined && n > guard.max) return `Must be <= ${guard.max}`;
      return null;
    }
    case 'float': {
      const n = Number(value.trim());
      if (Number.isNaN(n)) return 'Must be a number';
      if (guard.min !== undefined && n < guard.min) return `Must be >= ${guard.min}`;
      if (guard.max !== undefined && n > guard.max) return `Must be <= ${guard.max}`;
      return null;
    }
    default:
      return null;
  }
}

/** Runs every guarded key in `params` against `guards`, returning only the invalid ones as { key: reason }. */
export function collectGuardErrors(params, guards) {
  const errors = {};
  for (const [key, guard] of Object.entries(guards)) {
    const reason = validateParamValue(guard, params[key]);
    if (reason) errors[key] = reason;
  }
  return errors;
}
