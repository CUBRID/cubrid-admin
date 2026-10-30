import { BaseCmsRequest } from './base-cms-request';

/**
 * CMS `ha_stop` request body (`token` is merged in by `BaseService.executeCmsRequest`).
 */
export type HaStopDatabaseCmsRequest = BaseCmsRequest & {
  task: 'ha_stop';
  /**
   * Required: CMS would run a dbname-less `cubrid heartbeat stop`, whose
   * `us_hb_deactivate()` deactivates heartbeat on the whole node and leaves
   * its HA state unknown, not just the per-db HB processes.
   */
  dbname: string;
};
