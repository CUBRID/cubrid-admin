/**
 * Only the CMS account named "admin" manages CMS users, as in CA: its User
 * Management action is enabled only when the account the host was logged in
 * with is "admin" (UserManagementAction.isSupported, ServerUserInfo.isAdmin:
 * userName.equals("admin")).
 */
export const CMS_ADMIN_ID = 'admin';

/** Whether the host `hostUid` is logged in to with the CMS admin account. */
export const isCmsAdminHost = (hosts, hostUid) =>
  (hosts || []).find((host) => host.uid === hostUid)?.id === CMS_ADMIN_ID;
