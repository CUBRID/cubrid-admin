/**
 * Deprecated cubrid.conf key -> the key that now sets the same value.
 * Taken from system_parameter.c's PARAM_VALUE_SHARE table (develop), where
 * each row lists the deprecated PRM and its replacement sharing one
 * value. The java_stored_procedure* rows only exist on develop (11.5+);
 * on older engines those keys are not deprecated, so the catalog's own
 * `deprecated` flag decides whether this map is consulted at all.
 */
export const DEPRECATED_PARAM_REPLACEMENTS: Record<string, string> = {
  sort_buffer_pages: 'sort_buffer_size',
  data_buffer_pages: 'data_buffer_size',
  index_scan_oid_buffer_pages: 'index_scan_oid_buffer_size',
  lock_timeout_in_secs: 'lock_timeout',
  log_buffer_pages: 'log_buffer_size',
  checkpoint_every_npages: 'checkpoint_every_size',
  checkpoint_interval_in_mins: 'checkpoint_interval',
  index_scan_key_buffer_pages: 'index_scan_key_buffer_size',
  page_flush_interval_in_msecs: 'page_flush_interval',
  max_flush_pages_per_second: 'max_flush_size_per_second',
  sync_on_nflush: 'sync_on_flush_size',
  sql_trace_slow_msecs: 'sql_trace_slow',
  java_stored_procedure: 'stored_procedure',
  java_stored_procedure_port: 'stored_procedure_port',
  java_stored_procedure_jvm_options: 'stored_procedure_vm_options',
  java_stored_procedure_debug: 'stored_procedure_debug',
  java_stored_procedure_uds: 'stored_procedure_uds',
};
