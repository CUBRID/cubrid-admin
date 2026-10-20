import { BaseCmsRequest } from './base-cms-request';

/**
 * CMS `ha_start` request body (`token` is merged in by `BaseService.executeCmsRequest`).
 */
export type HaStartDatabaseCmsRequest = BaseCmsRequest & {
  task: 'ha_start';
  /** Omitted entirely to start every HA-configured database on the host in one call. */
  dbname?: string;
};
