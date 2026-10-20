import { BaseCmsResponse } from './base-cms-response';

/**
 * Log content container in viewlog response.
 */
export type LogContentContainer = {
  line: string[];
};

/**
 * CMS response for viewlog request.
 * Contains log file content lines.
 *
 * @category CMS Responses
 * @since 1.0.0
 */
export type ViewLogCmsResponse = BaseCmsResponse & {
  end: string;
  log: LogContentContainer[];
  path: string;
  start: string;
  total: string;
};
