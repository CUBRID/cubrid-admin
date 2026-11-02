import { BaseCmsRequest } from './base-cms-request';

/**
 * CMS `ha_start` request body (`token` is merged in by `BaseService.executeCmsRequest`).
 */
export type HaStartDatabaseCmsRequest = BaseCmsRequest & {
  task: 'ha_start';
  /** Required, like `ha_stop`'s: one database per call. */
  dbname: string;
};

/**
 * CMS `ha_start` for the whole node (`cubrid heartbeat start`): the engine
 * decides which HA databases come up. Only a whole-service start sends it.
 */
export type HaStartNodeCmsRequest = BaseCmsRequest & {
  task: 'ha_start';
};
