import { BaseCmsResponse } from './base-cms-response';

/**
 * Database log file information in getloginfo response.
 */
export type DatabaseLogFileInfo = {
  '@owner': string;
  lastupdate: string;
  path: string;
  size: string;
};

/**
 * Database log info container in getloginfo response.
 */
export type DatabaseLogInfoContainer = {
  log: DatabaseLogFileInfo[];
};

/**
 * CMS response for getloginfo request (database log).
 * Contains database log file information.
 *
 * @category CMS Responses
 * @since 1.0.0
 */
export type GetDatabaseLogInfoCmsResponse = BaseCmsResponse & {
  dbname: string;
  loginfo: DatabaseLogInfoContainer[];
};
