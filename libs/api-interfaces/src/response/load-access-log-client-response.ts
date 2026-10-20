import { AccessLogEntry, ErrorLogEntry } from '../models/cms-response/load-access-log-cms-response';

/**
 * Client-facing response for access log.
 * Strips CMS envelope fields from LoadAccessLogCmsResponse.
 *
 * @category Responses
 * @since 1.0.0
 */
export type LoadAccessLogClientResponse = {
  accesslog: AccessLogEntry[];
  errorlog: ErrorLogEntry[];
};
