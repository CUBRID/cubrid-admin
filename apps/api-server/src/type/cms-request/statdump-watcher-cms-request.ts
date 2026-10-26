import { BaseCmsRequest } from './base-cms-request';

/**
 * CMS `start_statdump`: spawns a persistent `cubrid statdump -i <interval> <dbname>`
 * (one per dbname) so the server keeps accumulating performance counters.
 */
export type StartStatdumpCmsRequest = BaseCmsRequest & {
  task: 'start_statdump';
  dbname: string;
  /** Seconds between the watcher's own (discarded) dumps. */
  interval: string;
};

/** CMS `stop_statdump`: kills the watcher started for `dbname`. */
export type StopStatdumpCmsRequest = BaseCmsRequest & {
  task: 'stop_statdump';
  dbname: string;
};
