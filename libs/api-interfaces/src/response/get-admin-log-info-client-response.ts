import { AdminLogInfoEntry } from '../models/cms-response/get-admin-log-info-cms-response';

/**
 * Client-facing response for admin log information.
 * Strips CMS envelope fields from GetAdminLogInfoCmsResponse.
 *
 * @category Responses
 * @since 1.0.0
 */
export type GetAdminLogInfoClientResponse = {
  /**
   * Array of admin log information entries
   */
  adminloginfo: AdminLogInfoEntry[];
};
