import { HostError } from '@error/index';

/**
 * The CMS account that may manage CMS users: `admin`, as CUBRID Admin decides
 * it (ServerUserInfo.isAdmin: the user name equals "admin", case-sensitive).
 * CMS itself asks only for the DB-create authority on adddbmtuser,
 * updatedbmtuser and deletedbmtuser (cm_server_util.cpp task table, AU_DBC)
 * and nothing on setdbmtpasswd beyond a login, so without this check a host
 * connected as any other account could manage users through the API alone.
 */
export const CMS_ADMIN_ID = 'admin';

export const isCmsAdminHost = (host: { id: string }): boolean => host.id === CMS_ADMIN_ID;

/**
 * Throws CMS_ADMIN_REQUIRED unless the host is connected as the CMS admin
 * account. A request on the connection account itself (`targetid` equal to
 * it: a user changing their own password) is allowed for every account.
 */
export function assertCmsAdminHost(host: { uid: string; id: string }, options: { targetid?: string } = {}): void {
  if (isCmsAdminHost(host)) return;
  if (options.targetid !== undefined && options.targetid === host.id) return;
  throw HostError.CmsAdminRequired({ hostUid: host.uid, username: host.id });
}
