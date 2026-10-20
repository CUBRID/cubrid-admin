import { BaseCmsResponse } from './base-cms-response';

/**
 * Server parameter configuration.
 * All parameter values are returned as strings from CMS API.
 *
 * @category CMS Responses
 * @since 1.0.0
 */
export type ServerParameter = {
  access_ip_control: string;
  access_ip_control_file: string;
  adaptive_flush_control: string;
  add_column_update_hard_default: string;
  agg_hash_respect_order: string;
  allow_truncated_string: string;
  alter_table_change_type_strict: string;
  ansi_quotes: string;
  async_commit: string;
  auto_restart_server: string;
  background_archiving: string;
  backup_volume_max_size_bytes: string;
  block_ddl_statement: string;
  block_nowhere_statement: string;
  call_stack_dump_activation_list: string;
  call_stack_dump_deactivation_list: string;
  call_stack_dump_on_error: string;
  check_peer_alive: string;
  checkpoint_every_npages: string;
  checkpoint_every_size: string;
  checkpoint_interval: string;
  checkpoint_interval_in_mins: string;
  commit_on_shutdown: string;
  communication_histogram: string;
  compactdb_page_reclaim_only: string;
  compat_mode: string;
  compat_numeric_division_scale: string;
  compat_primary_key: string;
  connection_timeout: string;
  create_table_reuseoid: string;
  csql_auto_commit: string;
  csql_history_num: string;
  csql_single_line_mode: string;
  cte_max_recursions: string;
  cubrid_port_id: string;
  data_aout_ratio: string;
  data_buffer_neighbor_flush_nondirty: string;
  data_buffer_neighbor_flush_pages: string;
  data_buffer_pages: string;
  data_buffer_size: string;
  data_file_os_advise: string;
  db_hosts: string;
  db_volume_size: string;
  dblink_auto_commit: string;
  ddl_audit_log: string;
  ddl_audit_log_size: string;
  deadlock_detection_interval_in_secs: string;
  deduplicate_key_level: string;
  default_week_format: string;
  dont_reuse_heap_file: string;
  double_write_buffer_size: string;
  enable_memory_monitoring: string;
  enable_string_compression: string;
  error_log: string;
  error_log_level: string;
  error_log_production_mode: string;
  error_log_size: string;
  error_log_warning: string;
  event_activation_list: string;
  event_handler: string;
  extended_statistics_activation: string;
  flashback_timeout: string;
  force_remove_log_archives: string;
  garbage_collection: string;
  group_commit_interval_in_msecs: string;
  group_concat_max_len: string;
  ha_apply_max_mem_size: string;
  ha_applylogdb_ignore_error_list: string;
  ha_applylogdb_max_commit_interval: string;
  ha_applylogdb_max_commit_interval_in_msecs: string;
  ha_applylogdb_retry_error_list: string;
  ha_check_disk_failure_interval: string;
  ha_copy_log_base: string;
  ha_copy_log_max_archives: string;
  ha_copy_log_timeout: string;
  ha_copy_sync_mode: string;
  ha_db_list: string;
  ha_delay_limit: string;
  ha_delay_limit_delta: string;
  ha_enable_sql_logging: string;
  ha_mode: string;
  ha_mode_for_sa_utils_only: string;
  ha_node_list: string;
  ha_ping_hosts: string;
  ha_port_id: string;
  ha_repl_filter_file: string;
  ha_repl_filter_type: string;
  ha_replica_delay: string;
  ha_replica_list: string;
  ha_replica_time_bound: string;
  ha_sql_log_max_count: string;
  ha_sql_log_max_size_in_mbytes: string;
  ha_sql_log_path: string;
  ha_tcp_ping_hosts: string;
  ha_unacceptable_proc_restart_timediff: string;
  index_scan_in_oid_order: string;
  index_scan_key_buffer_pages: string;
  index_scan_key_buffer_size: string;
  index_scan_oid_buffer_pages: string;
  index_scan_oid_buffer_size: string;
  index_unfill_factor: string;
  intl_check_input_string: string;
  intl_collation: string;
  intl_date_lang: string;
  intl_mbs_support: string;
  intl_number_lang: string;
  isolation_level: string;
  json_max_array_idx: string;
  loaddb_worker_count: string;
  lock_escalation: string;
  lock_timeout: string;
  lock_timeout_in_secs: string;
  log_buffer_pages: string;
  log_buffer_size: string;
  log_compress: string;
  log_max_archives: string;
  log_trace_flush_time: string;
  log_volume_size: string;
  lru_buffer_ratio: string;
  lru_hot_ratio: string;
  max_agg_hash_size: string;
  max_clients: string;
  max_filter_pred_cache_entries: string;
  max_flush_pages_per_second: string;
  max_flush_size_per_second: string;
  max_hash_list_scan_size: string;
  max_plan_cache_clones: string;
  max_plan_cache_entries: string;
  max_query_cache_entries: string;
  max_query_per_tran: string;
  max_subquery_cache_size: string;
  monitor_waiting_thread: string;
  multi_range_optimization_limit: string;
  mysql_trigger_correlation_names: string;
  no_backslash_escapes: string;
  num_private_chains: string;
  only_full_group_by: string;
  optimization_level: string;
  oracle_compat_number_behavior: string;
  oracle_style_empty_string: string;
  page_flush_interval: string;
  page_flush_interval_in_msecs: string;
  pipes_as_concat: string;
  pl_transaction_control: string;
  plan_cache_logging: string;
  plan_cache_timeout: string;
  plus_as_concat: string;
  print_index_detail: string;
  pthread_scope_process: string;
  query_cache_size_in_pages: string;
  query_trace: string;
  query_trace_format: string;
  recovery_progress_logging_interval: string;
  regexp_engine: string;
  require_like_escape_character: string;
  return_null_on_function_errors: string;
  rollback_on_lock_escalation: string;
  server_timezone: string;
  'service::server': string;
  'service::service': string;
  session_state_timeout: string;
  sort_buffer_pages: string;
  sort_buffer_size: string;
  sort_limit_max_count: string;
  sql_trace_execution_plan: string;
  sql_trace_ioread_pages: string;
  sql_trace_slow: string;
  sql_trace_slow_msecs: string;
  stored_procedure: string;
  stored_procedure_dump_icode: string;
  stored_procedure_port: string;
  stored_procedure_return_numeric_size: string;
  stored_procedure_uds: string;
  stored_procedure_vm_options: string;
  string_max_size_bytes: string;
  supplemental_log: string;
  sync_on_flush_size: string;
  sync_on_nflush: string;
  tcp_keepalive: string;
  tde_default_algorithm: string;
  tde_keys_file_path: string;
  temp_file_max_size_in_pages: string;
  temp_file_memory_size_in_pages: string;
  temp_volume_path: string;
  thread_connection_pooling: string;
  thread_connection_timeout_seconds: string;
  thread_core_count: string;
  thread_stacksize: string;
  thread_worker_pooling: string;
  thread_worker_timeout_seconds: string;
  timezone: string;
  tz_leap_second_support: string;
  unfill_factor: string;
  unicode_input_normalization: string;
  unicode_output_normalization: string;
  update_use_attribute_references: string;
  use_orderby_sort_limit: string;
  use_stat_estimation: string;
  use_user_hosts: string;
  vacuum_log_block_pages: string;
  vacuum_master_interval_in_msecs: string;
  vacuum_ovfp_check_duration: string;
  vacuum_ovfp_check_threshold: string;
  vacuum_worker_count: string;
  volume_extension_path: string;
  xasl_cache_time_threshold_in_minutes: string;
};

/**
 * Response type for paramdump request.
 * Contains database server parameters configuration.
 *
 * @category CMS Responses
 * @since 1.0.0
 */
export type ParamdumpCmsResponse = BaseCmsResponse & {
  /**
   * Database name
   */
  dbname: string;

  /**
   * Server parameters array
   *
   * Note: Typically contains a single ServerParameter object,
   * but defined as array for compatibility with CMS API response format.
   */
  server: ServerParameter[];
};
