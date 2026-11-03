import { BaseCmsRequest } from './base-cms-request';

/**
 * Volume mapping: one source path -> destination path per object.
 * Array entries follow physical volume order so CMS cannot reorder object keys.
 * Used when advanced is "on".
 */
export type CopyDbVolumeItem = Record<string, string>;

/**
 * CMS request for copydb task.
 * volume is only present when advanced is "on" (or "y").
 */
export type CopyDbCmsRequest = BaseCmsRequest & {
  task: 'copydb';
  srcdbname: string;
  destdbname: string;
  destdbpath: string;
  exvolpath: string;
  logpath: string;
  overwrite: string;
  move: string;
  advanced: string;
  /** Volume path mappings. Only sent when advanced is "on". */
  volume?: CopyDbVolumeItem[];
};
