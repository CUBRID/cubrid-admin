import { AppError } from '@error/app-error';
import { HostErrorCode } from '@error/host/host-error-code';

export { HostErrorCode };

/**
 * Error class for host-related operations.
 *
 * @category Errors
 * @since 1.0.0
 */
export class HostError extends AppError {
  constructor(
    kind: 'RESOURCE',
    code: HostErrorCode,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    super(kind, code, additionalData, originalError);
  }

  /**
   * Creates an error indicating that the maximum number of hosts has been exceeded.
   */
  static ExceedMaxHosts(additionalData?: Record<string, any>, originalError?: Error) {
    return new HostError('RESOURCE', HostErrorCode.EXCEED_MAX_HOSTS, additionalData, originalError);
  }

  /**
   * Creates an error indicating an invalid format for host information.
   */
  static InvalidFormat(additionalData?: Record<string, any>, originalError?: Error) {
    return new HostError('RESOURCE', HostErrorCode.INVALID_FORMAT, additionalData, originalError);
  }

  /**
   * Creates an error indicating a duplicate host entry.
   */
  static DuplicatedHost(additionalData?: Record<string, any>, originalError?: Error) {
    return new HostError('RESOURCE', HostErrorCode.DUPLICATED_HOST, additionalData, originalError);
  }

  /**
   * Creates an error indicating the alias (friendly name) is already used by another host.
   */
  static DuplicatedAlias(additionalData?: Record<string, any>, originalError?: Error) {
    return new HostError('RESOURCE', HostErrorCode.DUPLICATED_ALIAS, additionalData, originalError);
  }

  /**
   * Creates an error indicating that no such host was found.
   */
  static NoSuchHost(additionalData?: Record<string, any>, originalError?: Error) {
    return new HostError('RESOURCE', HostErrorCode.NO_SUCH_HOST, additionalData, originalError);
  }

  /**
   * Creates an error indicating that a connection test was refused: a host
   * with the same address, port and CMS account is connected, and the test
   * login could end its CMS session.
   */
  static HostConnected(additionalData?: Record<string, any>, originalError?: Error) {
    return new HostError('RESOURCE', HostErrorCode.HOST_CONNECTED, additionalData, originalError);
  }

  /**
   * CMS user management (add, update, delete, another user's password) was
   * asked on a host whose CMS connection account is not `admin`.
   * `username` is that account.
   */
  static CmsAdminRequired(additionalData?: Record<string, any>, originalError?: Error) {
    return new HostError('RESOURCE', HostErrorCode.CMS_ADMIN_REQUIRED, additionalData, originalError);
  }

  /**
   * Creates an error indicating an internal host-related server error.
   */
  static InternalError(additionalData?: Record<string, any>, originalError?: Error) {
    return new HostError('RESOURCE', HostErrorCode.INTERNAL_ERROR, additionalData, originalError);
  }
}
