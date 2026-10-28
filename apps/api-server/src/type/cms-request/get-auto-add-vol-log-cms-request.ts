import { BaseCmsRequest } from './base-cms-request';

/**
 * CMS request for getautoaddvollog task.
 */
export type GetAutoAddVolLogCmsRequest = BaseCmsRequest & {
  task: 'getautoaddvollog';
  /** CMS compares these with strcmp against unpadded timestamps; NCA filters the range itself. */
  start_time?: string;
  end_time?: string;
};
