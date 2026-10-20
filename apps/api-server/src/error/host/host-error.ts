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
   * Creates an error indicating an internal host-related server error.
   */
  static InternalError(additionalData?: Record<string, any>, originalError?: Error) {
    return new HostError('RESOURCE', HostErrorCode.INTERNAL_ERROR, additionalData, originalError);
  }
}
