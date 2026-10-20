import { BaseCmsResponse } from './base-cms-response';

/**
 * Access log entry in loadaccesslog response.
 */
export type AccessLogEntry = {
  '@user': string;
  taskname: string;
  time: string;
};

/**
 * Error log entry in loadaccesslog response.
 */
export type ErrorLogEntry = {
  '@user': string;
  errornote: string;
  taskname: string;
  time: string;
};

/**
 * CMS response for loadaccesslog request.
 * Contains access log and error log entries.
 *
 * @category CMS Responses
 * @since 1.0.0
 */
export type LoadAccessLogCmsResponse = BaseCmsResponse & {
  accesslog: AccessLogEntry[];
  errorlog: ErrorLogEntry[];
};
