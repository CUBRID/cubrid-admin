/**
 * One volume's source path -> destination path. `volume` holds one per
 * permanent volume, in volid order: CMS writes each element as the next
 * copydb control-file line. Used when advanced is "on".
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
  /** Volume path mappings. Only when advanced is "on". */
  volume?: CopyDbVolumeItem[];
};
