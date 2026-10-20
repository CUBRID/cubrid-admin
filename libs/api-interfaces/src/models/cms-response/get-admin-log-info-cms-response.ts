import { BaseCmsResponse } from './base-cms-response';

/**
 * Admin log info entry in getadminloginfo response.
 */
export type AdminLogInfoEntry = {
  /**
   * Last update date of the log file
   */
  lastupdate: string;

  /**
   * Owner of the log file
   */
  owner: string;

  /**
   * Full path to the log file
   */
  path: string;

  /**
   * Size of the log file in bytes (as string)
   */
  size: string;
};

/**
 * CMS response for getadminloginfo request.
 * Contains admin log information.
 *
 * @category CMS Responses
 * @since 1.0.0
 */
export type GetAdminLogInfoCmsResponse = BaseCmsResponse & {
  /**
   * Array of admin log information entries
   */
  adminloginfo: AdminLogInfoEntry[];
};
