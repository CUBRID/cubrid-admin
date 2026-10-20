import { LogContentContainer } from '../models/cms-response/view-log-cms-response';

/**
 * Client-facing response for log file content.
 * Strips CMS envelope fields from ViewLogCmsResponse.
 *
 * @category Responses
 * @since 1.0.0
 */
export type ViewLogClientResponse = {
  end: string;
  log: LogContentContainer[];
  path: string;
  start: string;
  total: string;
};
