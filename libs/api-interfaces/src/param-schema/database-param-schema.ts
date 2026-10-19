import { VersionedParamSchemaEntry } from './param-schema-entry';

/**
 * Master, version-aware rule table for every cubrid.conf key exposed by
 * DatabasePropertyModal. This is the single source of truth: the API
 * server resolves it against a connected host's actual engine version
 * (CmsConfigService.getEnv's CUBRIDVER) and sends only the result to the
 * client — the client never imports this file directly, only the
 * `ResolvedParamSchemaEntry[]` it receives over the wire (see
 * GetEnvClientResponse.paramSchemas). Source citations for every
 * inclusion/exclusion live in CUBRID-DATABASE-PROPERTY-PARAM-AUDIT.md and
 * CUBRID-PARAM-VERSION-MATRIX.md.
 *
 * `isolation_level`'s real keyword table (system_parameter.c) has 14 legal
 * strings collapsing to exactly 3 enum values; `ha_mode`'s has 14
 * collapsing to 5. Lookup is case-insensitive (intl_mbs_casecmp) — these
 * uppercase/lowercase spellings match what the engine itself accepts.
 *
 * `scope` (SERVER/CLIENT/BOTH) is system_parameter.c's PRM_FOR_SERVER /
 * PRM_FOR_CLIENT flags — which process(es) the PRM affects. Purely
 * informational (CA's own "Parameter Type" column); only `advanced`
 * entries carry it, matching what the table previously displayed.
 */
export const DATABASE_PARAM_SCHEMA: VersionedParamSchemaEntry[] = [
  // ── advanced ──
  { key: 'access_ip_control', category: 'advanced', scope: 'SERVER', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  { key: 'access_ip_control_file', category: 'advanced', scope: 'SERVER', guard: { kind: 'string' }, default: '' },
  { key: 'async_commit', category: 'advanced', scope: 'SERVER', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  { key: 'checkpoint_every_npages', category: 'advanced', scope: 'SERVER', guard: { kind: 'int', min: 10 }, default: '10' },
  { key: 'data_aout_ratio', category: 'advanced', scope: 'SERVER', guard: { kind: 'float', min: 0.0, max: 3.0 }, default: '0.0' },
  { key: 'data_buffer_flush_ratio', category: 'advanced', scope: 'SERVER', guard: { kind: 'float', min: 0.01, max: 0.95 }, default: '0.01' },
  { key: 'backup_volume_max_size_bytes', category: 'advanced', scope: 'SERVER', guard: { kind: 'bigint', min: '32768' }, default: '0' },
  { key: 'block_ddl_statement', category: 'advanced', scope: 'CLIENT', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  { key: 'block_nowhere_statement', category: 'advanced', scope: 'CLIENT', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  { key: 'call_stack_dump_activation_list', category: 'advanced', scope: 'BOTH', guard: { kind: 'intList' }, default: '' },
  { key: 'call_stack_dump_deactivation_list', category: 'advanced', scope: 'BOTH', guard: { kind: 'intList' }, default: '' },
  { key: 'call_stack_dump_on_error', category: 'advanced', scope: 'BOTH', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  { key: 'compactdb_page_reclaim_only', category: 'advanced', scope: 'SERVER', guard: { kind: 'int' }, default: '0' },
  // PRM_DEPRECATED + PRM_HIDDEN on develop only (system_parameter.c:2213,
  // CUBRID-PARAM-VERSION-MATRIX.md §3) — still a live, applicable BOOLEAN
  // on every released branch (11.0–11.4), being phased out going forward.
  // Excluded on develop (maxVersion) rather than guarded identically
  // everywhere, since showing a deprecated knob in a "current recommended
  // settings" editor for the branch that's actively dropping it would be
  // actively misleading, not just stale documentation.
  { key: 'compat_numeric_division_scale', category: 'advanced', scope: 'BOTH', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no', maxVersion: '11.4.999' },
  { key: 'compat_primary_key', category: 'advanced', scope: 'CLIENT', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  { key: 'csql_history_num', category: 'advanced', scope: 'CLIENT', guard: { kind: 'int', min: 1, max: 200 }, default: '50' },
  { key: 'db_hosts', category: 'advanced', scope: 'CLIENT', guard: { kind: 'string' }, default: '' },
  { key: 'dont_reuse_heap_file', category: 'advanced', scope: 'SERVER', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  { key: 'error_log', category: 'advanced', scope: 'BOTH', guard: { kind: 'string' }, default: 'cubrid.err' },
  { key: 'file_lock', category: 'advanced', scope: 'SERVER', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'yes' },
  { key: 'garbage_collection', category: 'advanced', scope: 'CLIENT', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  { key: 'group_commit_interval_in_msecs', category: 'advanced', scope: 'SERVER', guard: { kind: 'int', min: 0 }, default: '0' },
  { key: 'ha_mode', category: 'advanced', scope: 'SERVER', guard: { kind: 'enum', options: ['on', 'off', 'yes', 'no', 'replica'] }, default: 'off' },
  { key: 'ha_node_list', category: 'advanced', scope: 'SERVER', guard: { kind: 'string' }, default: '' },
  { key: 'ha_port_id', category: 'advanced', scope: 'SERVER', guard: { kind: 'int', min: 1, max: 65535 }, default: '' },
  { key: 'hostvar_late_binding', category: 'advanced', scope: 'CLIENT', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  { key: 'index_scan_in_oid_order', category: 'advanced', scope: 'CLIENT', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  { key: 'insert_execution_mode', category: 'advanced', scope: 'CLIENT', guard: { kind: 'int', min: 0, max: 31 }, default: '1' }, // bitmask
  { key: 'intl_mbs_support', category: 'advanced', scope: 'CLIENT', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  // PRM_INTEGER, no lower bound; upper bound 10000 exists ONLY on develop
  // (system_parameter.c:2247, CUBRID-PARAM-VERSION-MATRIX.md §5) — 11.0
  // through 11.4 have no upper bound at all. Two entries, not one
  // version-unaware guard: `resolveParamSchema` returns at most one of
  // these per host (their ranges don't overlap), so each host gets
  // exactly the rule its own engine actually enforces.
  // NOTE: the `minVersion: '11.5'` boundary on the develop variant is an
  // inference (develop reliably sorts after the newest release branch's
  // version), not something directly confirmed against a live develop
  // build's actual CUBRIDVER string — flagged here in case that needs
  // correcting once one is checked.
  { key: 'max_plan_cache_entries', category: 'advanced', scope: 'BOTH', guard: { kind: 'int' }, default: '1000', maxVersion: '11.4.999' },
  { key: 'max_plan_cache_entries', category: 'advanced', scope: 'BOTH', guard: { kind: 'int', max: 10000 }, default: '1000', minVersion: '11.5' },
  { key: 'max_query_cache_entries', category: 'advanced', scope: 'SERVER', guard: { kind: 'int', min: 0 }, default: '0' },
  { key: 'oracle_style_empty_string', category: 'advanced', scope: 'CLIENT', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  { key: 'oracle_style_outerjoin', category: 'advanced', scope: 'CLIENT', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  { key: 'pthread_scope_process', category: 'advanced', scope: 'SERVER', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'yes' },
  { key: 'query_cache_size_in_pages', category: 'advanced', scope: 'SERVER', guard: { kind: 'int', min: 0 }, default: '0' },
  { key: 'single_byte_compare', category: 'advanced', scope: 'SERVER', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },
  { key: 'temp_file_max_size_in_pages', category: 'advanced', scope: 'SERVER', guard: { kind: 'int' }, default: '-1' }, // -1 = unlimited sentinel, no other bound in source
  { key: 'temp_file_memory_size_in_pages', category: 'advanced', scope: 'SERVER', guard: { kind: 'int', min: 0, max: 20 }, default: '4' },
  { key: 'temp_volume_path', category: 'advanced', scope: 'SERVER', guard: { kind: 'string' }, default: '' },
  { key: 'unfill_factor', category: 'advanced', scope: 'SERVER', guard: { kind: 'float', min: 0.0, max: 0.3 }, default: '0.1' },
  { key: 'volume_extension_path', category: 'advanced', scope: 'SERVER', guard: { kind: 'string' }, default: '' },

  // ── general ──
  { key: 'lock_escalation', category: 'general', guard: { kind: 'int', min: 5 }, default: '100000' },
  { key: 'lock_timeout_in_secs', category: 'general', guard: { kind: 'int', min: -1 }, default: '-1' }, // -1 = unlimited sentinel
  { key: 'deadlock_detection_interval_in_secs', category: 'general', guard: { kind: 'float', min: 0.1 }, default: '1' },
  { key: 'checkpoint_interval_in_mins', category: 'general', guard: { kind: 'int', min: 1 }, default: '1000' },
  // TRAN_REP_CLASS_COMMIT_INSTANCE == TRAN_READ_COMMITTED, the engine's own
  // literal default (system_parameter.c, isolation_level's prm_Def entry).
  { key: 'isolation_level', category: 'general', guard: { kind: 'enum', options: ['TRAN_SERIALIZABLE', 'TRAN_REP_CLASS_REP_INSTANCE', 'TRAN_REP_CLASS_COMMIT_INSTANCE'] }, default: 'TRAN_REP_CLASS_COMMIT_INSTANCE' },
  { key: 'cubrid_port_id', category: 'general', guard: { kind: 'int', min: 1, max: 65535 }, default: '1523' },
  { key: 'max_clients', category: 'general', guard: { kind: 'int', min: 10, max: 4000 }, default: '100' }, // upper = CSS_MAX_CLIENT_COUNT
  { key: 'auto_restart_server', category: 'general', guard: { kind: 'enum', options: ['yes', 'no'] }, default: 'no' },

  // ── buffer (pages/size pairs — only one side of each pair is ever sent,
  // per the UI's radio choice) ──
  { key: 'data_buffer_pages', category: 'buffer', guard: { kind: 'int', min: 1024 }, default: '25000', bufferGroup: { pairKey: 'data', role: 'pages' } },
  { key: 'data_buffer_size', category: 'buffer', guard: { kind: 'size' }, default: '512', bufferGroup: { pairKey: 'data', role: 'size' } },
  { key: 'sort_buffer_pages', category: 'buffer', guard: { kind: 'int', min: 1 }, default: '16', bufferGroup: { pairKey: 'sort', role: 'pages' } },
  { key: 'sort_buffer_size', category: 'buffer', guard: { kind: 'size' }, default: '2', bufferGroup: { pairKey: 'sort', role: 'size' } },
  { key: 'log_buffer_pages', category: 'buffer', guard: { kind: 'int', min: 128 }, default: '50', bufferGroup: { pairKey: 'log', role: 'pages' } }, // LOGPB_BUFFER_NPAGES_LOWER
  { key: 'log_buffer_size', category: 'buffer', guard: { kind: 'size' }, default: '4', bufferGroup: { pairKey: 'log', role: 'size' } },
  // index_scan_oid_buffer_{pages,size} share one underlying PRM (same
  // dynamic_flag in system_parameter.c) exactly like the other three
  // pairs — unlike those, the "pages" side is a float ratio (engine range
  // [0.05, 16.0]), not a page count.
  { key: 'index_scan_oid_buffer_pages', category: 'buffer', guard: { kind: 'float', min: 0.05, max: 16.0 }, default: '4', bufferGroup: { pairKey: 'indexScanOid', role: 'pages' } },
  { key: 'index_scan_oid_buffer_size', category: 'buffer', guard: { kind: 'size' }, default: '65536', bufferGroup: { pairKey: 'indexScanOid', role: 'size' } },
];
