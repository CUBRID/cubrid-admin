import { BaseCmsRequest } from './base-cms-request';

/**
 * One volume's source path -> destination path. `volume` holds one per
 * permanent volume, in volid order: CMS writes each element as the next
 * copydb control-file line. Used when advanced is "on".
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
