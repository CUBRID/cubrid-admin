/**
 * Volume mapping: one source file path -> destination file path per object.
 * Array entries must follow physical volume order (numeric volid).
 * Only included when advanced is "on".
 */
export type CopyDbVolumeItem = Record<string, string>;

/**
 * Client request for copydb task.
 */
export type CopyDbRequest = {
  srcdbname: string;
  destdbname: string;
  destdbpath: string;
  exvolpath: string;
  logpath: string;
  overwrite: string;
  move: string;
  advanced: string;
  /** Ordered volume path mappings. Required when advanced is "on" (or "y"). */
  volume?: CopyDbVolumeItem[];
};
