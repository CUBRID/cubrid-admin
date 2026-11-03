import { BaseCmsRequest } from './base-cms-request';

/**
 * Request type for dumping database parameters.
 *
 * @category CMS Requests
 * @since 1.0.0
 */
export type ParamdumpCmsRequest = BaseCmsRequest & {
  /**
   * Host unique identifier
   */
  hostUid: string;

  /**
   * Task type - must be 'paramdump'
   */
  task: 'paramdump';

  /**
   * Database name to dump parameters for
   */
  dbname: string;

  /**
   * Whether to dump client parameters as well as server parameters
   *
   * Values: 'y' (yes) | 'n' (no)
   */
  both: 'n' | 'y';
};
