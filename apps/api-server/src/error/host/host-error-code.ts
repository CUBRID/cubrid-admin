/**
 * Enumeration of host-related error codes.
 *
 * @category Errors
 * @since 1.0.0
 */
export enum HostErrorCode {
  EXCEED_MAX_HOSTS = 'EXCEED_MAX_HOSTS',
  INVALID_FORMAT = 'INVALID_FORMAT',
  DUPLICATED_HOST = 'DUPLICATED_HOST',
  DUPLICATED_ALIAS = 'DUPLICATED_ALIAS',
  NO_SUCH_HOST = 'NO_SUCH_HOST',
  HOST_CONNECTED = 'HOST_CONNECTED',
  /** CMS user management asked on a host not connected as the CMS admin account. */
  CMS_ADMIN_REQUIRED = 'CMS_ADMIN_REQUIRED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN = 'UNKNOWN',
}
