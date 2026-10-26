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
  { key: 'access_ip_control', category: 'advanced', scope: 'SERVER', guard: { kind: 'boolean' }, default: 'no' },
  { key: 'access_ip_control_file', category: 'advanced', scope: 'SERVER', guard: { kind: 'string' }, default: '' },
  { key: 'async_commit', category: 'advanced', scope: 'SERVER', guard: { kind: 'boolean' }, default: 'no' },
  // Real engine default is 100000 (system_parameter.c:1400) — '10' was the
  // *lower bound* (same struct's last field, system_parameter.c:1402)
  // mistakenly copied into the default slot. Live-confirmed via CMS
  // paramdump against a real 11.4.5 host with no conf override for this
  // key: reported value was exactly 100000.
  { key: 'checkpoint_every_npages', category: 'advanced', scope: 'SERVER', guard: { kind: 'int', min: 10 }, default: '100000' },
  { key: 'data_aout_ratio', category: 'advanced', scope: 'SERVER', guard: { kind: 'float', min: 0.0, max: 3.0 }, default: '0.0' },
  { key: 'data_buffer_flush_ratio', category: 'advanced', scope: 'SERVER', guard: { kind: 'float', min: 0.01, max: 0.95 }, default: '0.01' },
  // Engine default is 0 = "no split limit" (file_io.c only applies the
  // cap when it's > 0) — but that is only what the engine uses when the
  // key is ABSENT. Writing 0 explicitly goes through the range check like
  // any other value and fails the load: lower_limit is 32K on every
  // version (`1024 * 32`, PRM_ID_IO_BACKUP_MAX_VOLUME_SIZE). PRM_BIGINT
  // with PRM_SIZE_UNIT, so "1G" etc. is valid.
  { key: 'backup_volume_max_size_bytes', category: 'advanced', scope: 'SERVER', guard: { kind: 'size', min: 32768, max: '9223372036854775807' }, default: '0' },
  { key: 'block_ddl_statement', category: 'advanced', scope: 'CLIENT', guard: { kind: 'boolean' }, default: 'no' },
  { key: 'block_nowhere_statement', category: 'advanced', scope: 'CLIENT', guard: { kind: 'boolean' }, default: 'no' },
  { key: 'call_stack_dump_activation_list', category: 'advanced', scope: 'BOTH', guard: { kind: 'intList', allowDefaultElement: true }, default: '' },
  { key: 'call_stack_dump_deactivation_list', category: 'advanced', scope: 'BOTH', guard: { kind: 'intList' }, default: '' },
  { key: 'call_stack_dump_on_error', category: 'advanced', scope: 'BOTH', guard: { kind: 'boolean' }, default: 'no' },
  { key: 'compactdb_page_reclaim_only', category: 'advanced', scope: 'SERVER', guard: { kind: 'int' }, default: '0' },
  // PRM_DEPRECATED + PRM_HIDDEN on develop only (system_parameter.c:2213,
  // CUBRID-PARAM-VERSION-MATRIX.md §3) — still a live, applicable BOOLEAN
  // on every released branch (11.0–11.4), being phased out going forward.
  // Excluded on develop (maxVersion) rather than guarded identically
  // everywhere, since showing a deprecated knob in a "current recommended
  // settings" editor for the branch that's actively dropping it would be
  // actively misleading, not just stale documentation.
  { key: 'compat_numeric_division_scale', category: 'advanced', scope: 'BOTH', guard: { kind: 'boolean' }, default: 'no', maxVersion: '11.4.999' },
  { key: 'compat_primary_key', category: 'advanced', scope: 'CLIENT', guard: { kind: 'boolean' }, default: 'no' },
  { key: 'csql_history_num', category: 'advanced', scope: 'CLIENT', guard: { kind: 'int', min: 1, max: 200 }, default: '50' },
  { key: 'db_hosts', category: 'advanced', scope: 'CLIENT', guard: { kind: 'string' }, default: '' },
  { key: 'dont_reuse_heap_file', category: 'advanced', scope: 'SERVER', guard: { kind: 'boolean' }, default: 'no' },
  { key: 'error_log', category: 'advanced', scope: 'BOTH', guard: { kind: 'string' }, default: 'cubrid.err' },
  { key: 'file_lock', category: 'advanced', scope: 'SERVER', guard: { kind: 'boolean' }, default: 'yes' },
  { key: 'garbage_collection', category: 'advanced', scope: 'CLIENT', guard: { kind: 'boolean' }, default: 'no' },
  { key: 'group_commit_interval_in_msecs', category: 'advanced', scope: 'SERVER', guard: { kind: 'int', min: 0 }, default: '0' },
  // NOT commonOnly — a [@dbname] override is a real, intentional engine
  // feature: prm_read_and_parse_ini_file (system_parameter.c:6857-6862)
  // reads [common] then explicitly re-applies [@dbname] on top of it, and
  // boot_sr.c:2146's ER_PRM_CONFLICT_EXISTS_ON_MULTIPLE_SECTIONS check is
  // gated behind `!HA_DISABLED()` — i.e. it never fires when the
  // per-database override resolves to ha_mode=off. This is exactly how an
  // otherwise-HA host runs one specific database standalone (non-HA).
  // ha_mode_words (connection_defs.h HA_MODE_*), plus any integer in
  // [HA_MODE_OFF, HA_MODE_REPLICA] = [0, 5] — identical on every version.
  { key: 'ha_mode', category: 'advanced', scope: 'SERVER', guard: { kind: 'enum', options: ['off', 'no', 'n', '0', 'false', 'yes', 'y', '1', 'true', 'on', 'fail-back', 'role-change', 'r', 'repl', 'replica', '2'], numericRange: { min: 0, max: 5 } }, default: 'off' },
  // [common] only — ha_node_list is PRM_FOR_HA; whenever ha_mode is on,
  // system_parameter.c's sysprm_load_and_init_internal re-reads
  // cubrid_ha.conf's (db-agnostic, [@dbname]-incapable) [common] section
  // afterward and overwrites it, so a [@dbname] value here is silently
  // clobbered, not actually applied per-database.
  { key: 'ha_node_list', category: 'advanced', scope: 'SERVER', guard: { kind: 'string' }, default: '', commonOnly: true },
  // Source-confirmed (not a guess): PRM_ID_HA_PORT_ID is read exclusively
  // by master_heartbeat.c (the host-wide HA heartbeat daemon, not
  // database-specific) — setting it has no effect at all unless ha_mode
  // is actually on, and [common] only for the same cubrid_ha.conf-reload
  // reason as ha_node_list above (HA clustering is per-host, not per-db).
  { key: 'ha_port_id', category: 'advanced', scope: 'SERVER', guard: { kind: 'int', min: 1, max: 65535 }, default: '', advisory: { dependsOnKey: 'ha_mode', inactiveWhen: ['off', 'no', 'n', '0', 'false'] }, commonOnly: true },
  { key: 'hostvar_late_binding', category: 'advanced', scope: 'CLIENT', guard: { kind: 'boolean' }, default: 'no' },
  { key: 'index_scan_in_oid_order', category: 'advanced', scope: 'CLIENT', guard: { kind: 'boolean' }, default: 'no' },
  { key: 'insert_execution_mode', category: 'advanced', scope: 'CLIENT', guard: { kind: 'int', min: 0, max: 31 }, default: '1' }, // bitmask
  { key: 'intl_mbs_support', category: 'advanced', scope: 'CLIENT', guard: { kind: 'boolean' }, default: 'no' },
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
  { key: 'oracle_style_empty_string', category: 'advanced', scope: 'CLIENT', guard: { kind: 'boolean' }, default: 'no' },
  { key: 'oracle_style_outerjoin', category: 'advanced', scope: 'CLIENT', guard: { kind: 'boolean' }, default: 'no' },
  { key: 'pthread_scope_process', category: 'advanced', scope: 'SERVER', guard: { kind: 'boolean' }, default: 'yes' },
  // PRM_INTEGER [0, 65535], from 11.4 (java_stored_procedure_port before).
  // On develop (11.5) the engine refuses it in [common] outright —
  // prm_load_by_section returns PRM_ERR_CANNOT_CHANGE when
  // is_common_section && PRM_ID_STORED_PROCEDURE_PORT, failing the load —
  // so it's instanceOnly there; release/11.4 and v11.4.5 have no such check.
  { key: 'stored_procedure_port', category: 'advanced', scope: 'SERVER', guard: { kind: 'int', min: 0, max: 65535 }, default: '0', minVersion: '11.4', maxVersion: '11.4.999' },
  { key: 'stored_procedure_port', category: 'advanced', scope: 'SERVER', guard: { kind: 'int', min: 0, max: 65535 }, default: '0', instanceOnly: true, minVersion: '11.5' },
  { key: 'query_cache_size_in_pages', category: 'advanced', scope: 'SERVER', guard: { kind: 'int', min: 0 }, default: '0' },
  { key: 'temp_file_max_size_in_pages', category: 'advanced', scope: 'SERVER', guard: { kind: 'int' }, default: '-1' }, // -1 = unlimited sentinel, no other bound in source
  { key: 'temp_file_memory_size_in_pages', category: 'advanced', scope: 'SERVER', guard: { kind: 'int', min: 0, max: 20 }, default: '4' },
  { key: 'temp_volume_path', category: 'advanced', scope: 'SERVER', guard: { kind: 'string' }, default: '' },
  { key: 'unfill_factor', category: 'advanced', scope: 'SERVER', guard: { kind: 'float', min: 0.0, max: 0.3 }, default: '0.1' },
  { key: 'volume_extension_path', category: 'advanced', scope: 'SERVER', guard: { kind: 'string' }, default: '' },

  // ── general ──
  { key: 'lock_escalation', category: 'general', guard: { kind: 'int', min: 5 }, default: '100000' },
  { key: 'lock_timeout_in_secs', category: 'general', guard: { kind: 'int', min: -1 }, default: '-1' }, // -1 = unlimited sentinel
  { key: 'deadlock_detection_interval_in_secs', category: 'general', guard: { kind: 'float', min: 0.1 }, default: '1' },
  // Real engine default is 360 SECONDS internally (system_parameter.c:1422,
  // PRM_ID_LOG_CHECKPOINT_INTERVAL_SECS) = 6 minutes via prm_sec_to_min.
  // '1000' had no traceable source. Live-confirmed: a real 11.4.5 host with
  // no conf override for this key reported exactly 6.
  { key: 'checkpoint_interval_in_mins', category: 'general', guard: { kind: 'int', min: 1 }, default: '6' },
  // TRAN_REP_CLASS_COMMIT_INSTANCE == TRAN_READ_COMMITTED, the engine's own
  // literal default (system_parameter.c, isolation_level's prm_Def entry).
  // isolation_level_words, plus any integer in [TRAN_READ_COMMITTED,
  // TRAN_SERIALIZABLE] = [4, 6] (dbtran_def.h) — identical on every version.
  { key: 'isolation_level', category: 'general', guard: { kind: 'enum', options: ['tran_serializable', 'tran_no_phantom_read', 'tran_rep_class_rep_instance', 'tran_rep_read', 'tran_rep_class_commit_instance', 'tran_read_committed', 'tran_cursor_stability', 'serializable', 'no_phantom_read', 'rep_class_rep_instance', 'rep_read', 'rep_class_commit_instance', 'read_committed', 'cursor_stability'], numericRange: { min: 4, max: 6 } }, default: 'TRAN_REP_CLASS_COMMIT_INSTANCE' },
  // [common] only — read exactly once at cub_master startup
  // (executables/master.c's master_util_config_startup/css_master_init)
  // to bind the host's single listening TCP port before any database is
  // loaded; per-db processes only use it to locate that one master
  // (network_sr.c:1156, network_cl.c:3625), never to bind their own.
  { key: 'cubrid_port_id', category: 'general', guard: { kind: 'int', min: 1, max: 65535 }, default: '1523', commonOnly: true },
  { key: 'max_clients', category: 'general', guard: { kind: 'int', min: 10, max: 4000 }, default: '100' }, // upper = CSS_MAX_CLIENT_COUNT
  // Was entirely missing from this schema despite shipping in CUBRID's own
  // default cubrid.conf template — unknown-key values (including garbage
  // like "512MAAA") passed through unvalidated. PRM_ID_DB_VOLUME_SIZE
  // (system_parameter.c:3294-3304): default/lower_limit both 512M
  // (536870912 bytes), upper_limit 20G (21474836480 bytes). No real lower
  // bound below the default — lower_limit is literally 0 in the struct —
  // so only `max` is enforced here.
  { key: 'db_volume_size', category: 'general', guard: { kind: 'size', max: 21474836480 }, default: '512M' },
  // Same gap as db_volume_size above. PRM_ID_LOG_VOLUME_SIZE
  // (system_parameter.c:3306-3316): default 512M, lower_limit 20M
  // (20971520 bytes), upper_limit 4G (4294967296 bytes) — both ends
  // source-confirmed, unlike db_volume_size.
  { key: 'log_volume_size', category: 'general', guard: { kind: 'size', min: 20971520, max: 4294967296 }, default: '512M' },
  // Same gap again. PRM_ID_LOG_MAX_ARCHIVES (system_parameter.c:3037-3047):
  // PRM_INTEGER, default INT_MAX (keep every archive log forever),
  // lower_limit 0, no upper_limit. CUBRID's shipped default cubrid.conf
  // template explicitly overrides this to 0 — but that's the template's
  // own choice, not the engine's fallback when the key is absent, so the
  // schema default below is the engine's real one (INT_MAX), same
  // convention as every other entry's `default` here.
  { key: 'log_max_archives', category: 'general', guard: { kind: 'int', min: 0 }, default: '2147483647' },
  // Version-split, NOT a single commonOnly rule — the engine's own
  // consumer of this PRM relocated at the 11.3/11.4 boundary:
  //  - 11.0–11.3: read inside cub_server's OWN crash_handler
  //    (executables/server.c:222, confirmed identical on release/11.0
  //    through release/11.3) — genuinely per-database (`both`), each db's
  //    own server process decides whether to resurrect itself.
  //  - 11.4+: that server.c read is GONE; it's now read exactly once at
  //    cub_master startup (executables/master.c, line 1311 on 11.4 /
  //    1347 on develop) to decide whether to construct the single
  //    host-wide server_monitor that watches/restarts every crashed
  //    cub_server process — `commonOnly` from here on.
  //
  // Real engine default is `true` ("yes") on every branch checked
  // (release/11.0: prm_auto_restart_server_default = true; develop:
  // {false, {.b = true}}) — this was inverted. Live-confirmed: a real
  // 11.4.5 host with no conf override for this key reported "y".
  { key: 'auto_restart_server', category: 'general', guard: { kind: 'boolean' }, default: 'yes', maxVersion: '11.3.999' },
  { key: 'auto_restart_server', category: 'general', guard: { kind: 'boolean' }, default: 'yes', commonOnly: true, minVersion: '11.4' },

  // ── buffer (pages/size pairs — only one side of each pair is ever sent,
  // per the UI's radio choice) ──
  // Real engine default is 32768 pages (system_parameter.c:1211,
  // PRM_ID_PB_NBUFFERS) — '25000' had no traceable source. At the default
  // 16KB IO page size this is exactly 512M, matching data_buffer_size's
  // default below (which was already correct) — live-confirmed too: a
  // real 11.4.5 host with data_buffer_size explicitly set to 512M in conf
  // reported exactly 32768 for this key.
  { key: 'data_buffer_pages', category: 'buffer', guard: { kind: 'int', min: 1024 }, default: '32768', bufferGroup: { pairKey: 'data', role: 'pages' } },
  // PRM_INTEGER + SIZE_UNIT + DIFFER_UNIT: the engine rounds the bytes UP
  // to whole pages (prm_size_to_io_pages / prm_size_to_log_pages) and
  // range-checks the page count, and a page count past INT_MAX fails too.
  // Page size is fixed per database at createdb (4K..16K, IO_MIN/MAX_PAGE_SIZE
  // — log pages likewise), which this schema can't know, so the byte
  // bounds below are the conservative ones the engine rejects on EVERY
  // page size: min = (lowerPages - 1) * 4K + 1, max = INT_MAX * 16K.
  { key: 'data_buffer_size', category: 'buffer', guard: { kind: 'size', min: 4190209, max: 35184372072448 }, default: '512M', bufferGroup: { pairKey: 'data', role: 'size' } },
  // Real engine default is 128 pages (system_parameter.c:1178,
  // PRM_ID_SR_NBUFFERS) — '16' had no traceable source. At the default
  // 16KB IO page size this is exactly 2M, matching sort_buffer_size's
  // default below (already correct) — live-confirmed the same way as
  // data_buffer_pages above.
  { key: 'sort_buffer_pages', category: 'buffer', guard: { kind: 'int', min: 1 }, default: '128', bufferGroup: { pairKey: 'sort', role: 'pages' } },
  // Same conservative page bounds as data_buffer_size (lower limit 1 page).
  { key: 'sort_buffer_size', category: 'buffer', guard: { kind: 'size', min: 1, max: 35184372072448 }, default: '2M', bufferGroup: { pairKey: 'sort', role: 'size' } },
  // Real engine default is `16 * ONE_K` = 16384 pages (system_parameter.c:1378,
  // comment: "16k pages => 64M / 128M / 256M based on log page size") — the
  // previous '50' default violated this entry's own min:128 guard outright,
  // always failing validation the moment this key's effective value (loaded
  // or defaulted) was checked, regardless of which buffer pair side the UI
  // had selected.
  { key: 'log_buffer_pages', category: 'buffer', guard: { kind: 'int', min: 128 }, default: '16384', bufferGroup: { pairKey: 'log', role: 'pages' } }, // LOGPB_BUFFER_NPAGES_LOWER
  // Byte-equivalent default: the real conversion is log-page-size
  // dependent (same source comment above — 64M/128M/256M depending on
  // that setting), not a fixed ratio, so this can't be universally exact
  // the way data/sort_buffer_size's defaults are. '256' (M) is not a
  // guess though — live-confirmed on a real 11.4.5 host (its log page
  // size resolves 16384 pages to exactly 256M). Guard
  // bounds: same conservative page bounds as data_buffer_size, with
  // LOGPB_BUFFER_NPAGES_LOWER (128) log pages as the lower limit.
  { key: 'log_buffer_size', category: 'buffer', guard: { kind: 'size', min: 520193, max: 35184372072448 }, default: '256M', bufferGroup: { pairKey: 'log', role: 'size' } },
  // index_scan_oid_buffer_{pages,size} share one underlying PRM (same
  // dynamic_flag in system_parameter.c) exactly like the other three
  // pairs — unlike those, the "pages" side is a float ratio (engine range
  // [0.05, 16.0]), not a page count.
  { key: 'index_scan_oid_buffer_pages', category: 'buffer', guard: { kind: 'float', min: 0.05, max: 16.0 }, default: '4', bufferGroup: { pairKey: 'indexScanOid', role: 'pages' } },
  // PRM_FLOAT pages, [0.05, 16.0] after the engine's ceil-to-0.01 rounding
  // of bytes / IO page size. Rejected on every page size (4K..16K) only
  // when bytes <= 0.04 * 4K (163) or bytes > 16 * 16K.
  { key: 'index_scan_oid_buffer_size', category: 'buffer', guard: { kind: 'size', min: 164, max: 262144 }, default: '65536', bufferGroup: { pairKey: 'indexScanOid', role: 'size' } },
];
