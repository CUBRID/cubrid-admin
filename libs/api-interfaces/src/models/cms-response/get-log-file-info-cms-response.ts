import { BaseCmsResponse } from './base-cms-response';

/**
 * Log file information in getlogfileinfo response.
 */
export type LogFileInfo = {
  lastupdate: string;
  owner: string;
  path: string;
  size: string;
  type: string;
};

/**
 * Log file info container in getlogfileinfo response.
 */
export type LogFileInfoContainer = {
  logfile: LogFileInfo[];
};

/**
 * CMS response for getlogfileinfo request.
 * Contains broker log file information.
 *
 * @category CMS Responses
 * @since 1.0.0
 */
export type GetLogFileInfoCmsResponse = BaseCmsResponse & {
  broker: string;
  from: string;
  logfileinfo: LogFileInfoContainer[];
};
