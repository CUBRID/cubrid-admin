import { LogFileInfoContainer } from '../models/cms-response/get-log-file-info-cms-response';

/**
 * Client-facing response for broker log file list.
 * Strips CMS envelope fields from GetLogFileInfoCmsResponse.
 *
 * @category Responses
 * @since 1.0.0
 */
export type GetBrokerLogListClientResponse = {
  broker: string;
  logfileinfo: LogFileInfoContainer[];
};
