import { BaseCmsResponse } from './base-cms-response';

/**
 * CMS response type for database statistics dump (statdump).
 *
 * @category CMS Responses
 * @since 1.0.0
 */
export type StatdumpCmsResponse = BaseCmsResponse & {
  /**
   * Database name
   */
  dbname: string;

  /**
   * Execution timestamp
   */
  time: string;

  /**
   * NOTE: statdump response returns many statistics fields as strings.
   * Major fields are explicitly defined, and additional fields are accepted via index signature.
   */
  data_page_buffer_hit_ratio: string;
  num_adaptive_flush_log_pages: string;
  num_adaptive_flush_max_pages: string;
  num_adaptive_flush_pages: string;
  num_btree_covered: string;
  num_btree_deletes: string;
  num_btree_get_stats: string;
  num_btree_inserts: string;
  num_btree_merges: string;
  num_btree_multirange_optimization: string;
  num_btree_noncovered: string;
  num_btree_resumes: string;
  num_btree_splits: string;
  num_btree_updates: string;
  num_data_page_dirties: string;
  num_data_page_fetches: string;
  num_data_page_ioreads: string;
  num_data_page_iowrites: string;
  num_file_creates: string;
  num_file_ioreads: string;
  num_file_iosynches: string;
  num_file_iowrites: string;
  num_file_page_allocs: string;
  num_file_page_deallocs: string;
  num_file_removes: string;
  num_heap_stats_bestspace_entries: string;
  num_heap_stats_bestspace_maxed: string;
  num_log_append_records: string;
  num_log_archives: string;
  num_log_page_ioreads: string;
  num_log_page_iowrites: string;
  num_log_wals: string;
  num_network_requests: string;
  num_object_locks_acquired: string;
  num_object_locks_converted: string;
  num_object_locks_re_requested: string;
  num_object_locks_waits: string;
  num_page_locks_acquired: string;
  num_page_locks_converted: string;
  num_page_locks_re_requested: string;
  num_page_locks_waits: string;
  num_plan_cache_add: string;
  num_plan_cache_class_oid_hash_entries: string;
  num_plan_cache_delete: string;
  num_plan_cache_full: string;
  num_plan_cache_hit: string;
  num_plan_cache_invalid_xasl_id: string;
  num_plan_cache_lookup: string;
  num_plan_cache_miss: string;
  num_plan_cache_query_string_hash_entries: string;
  num_plan_cache_xasl_id_hash_entries: string;
  num_prior_lsa_list_maxed: string;
  num_prior_lsa_list_removed: string;
  num_prior_lsa_list_size: string;
  num_query_deletes: string;
  num_query_holdable_cursors: string;
  num_query_inserts: string;
  num_query_iscans: string;
  num_query_lscans: string;
  num_query_methscans: string;
  num_query_mjoins: string;
  num_query_nljoins: string;
  num_query_objfetches: string;
  num_query_selects: string;
  num_query_setscans: string;
  num_query_sscans: string;
  num_query_updates: string;
  num_sort_data_pages: string;
  num_sort_io_pages: string;
  num_tran_commits: string;
  num_tran_end_topops: string;
  num_tran_interrupts: string;
  num_tran_rollbacks: string;
  num_tran_savepoints: string;
  num_tran_start_topops: string;
  time_ha_replication_delay: string;

  /**
   * Extension for additional statistics fields
   */
  [key: string]: string;
};
