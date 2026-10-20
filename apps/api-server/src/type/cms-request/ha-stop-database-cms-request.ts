import { BaseCmsRequest } from './base-cms-request';

/**
 * CMS `ha_stop` request body (`token` is merged in by `BaseService.executeCmsRequest`).
 */
export type HaStopDatabaseCmsRequest = BaseCmsRequest & {
  task: 'ha_stop';
  /**
   * Omitted entirely to stop every HA-configured database on the host in one
   * call — note this is asymmetric with `dbname` given: CUBRID's
   * `us_hb_deactivate()` also clears cub_master's HA node-info in this mode
   * (confirmed empirically), not just the per-db HB processes.
   */
  dbname?: string;
};
