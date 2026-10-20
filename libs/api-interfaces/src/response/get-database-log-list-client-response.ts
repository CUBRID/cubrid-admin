import { DatabaseLogInfoContainer } from '../models/cms-response/get-database-log-info-cms-response';

/**
 * Client-facing response for database log file list.
 * Strips CMS envelope fields from GetDatabaseLogInfoCmsResponse.
 *
 * @category Responses
 * @since 1.0.0
 */
export type GetDatabaseLogListClientResponse = {
  dbname: string;
  loginfo: DatabaseLogInfoContainer[];
};
