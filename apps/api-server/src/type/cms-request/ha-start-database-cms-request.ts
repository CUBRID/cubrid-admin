import { BaseCmsRequest } from './base-cms-request';

/**
 * CMS `ha_start` request body (`token` is merged in by `BaseService.executeCmsRequest`).
 */
export type HaStartDatabaseCmsRequest = BaseCmsRequest & {
  task: 'ha_start';
  /** Required, like `ha_stop`'s: one database per call. */
  dbname: string;
};
