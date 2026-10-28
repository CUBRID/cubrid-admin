import { AuthErrorCode } from '@error/auth/auth-error-code';
import { StorageErrorCode } from '@error/storage/storage-error-code';
import { LockErrorCode } from '@error/lock/lock-error-code';
import { HostErrorCode } from '@error/host/host-error-code';
import { UserErrorCode } from '@error/user/user-error-code';
import { DatabaseErrorCode } from '@error/database/database-error-code';
import { ConfigErrorCode } from '@error/config/config-error-code';
import { BrokerErrorCode } from '@error/broker/broker-error-code';
import { CmsErrorCode } from '@error/cms/cms-error-code';
import type { ErrorKind } from '@error/error-kind';
import { getPublicClientErrorMessage } from '@error/client-error-messages';

export type { ErrorKind };

/**
 * Base error class for all application errors.
 *
 * @category Errors
 * @since 1.0.0
 */
export class AppError extends Error {
  constructor(
    public readonly kind: ErrorKind,
    public readonly code: string,
    public readonly additionalData?: Record<string, any>,
    public readonly originalError?: Error
  ) {
    super(code);
    this.name = new.target.name;
  }

  toProblemDetails(_requestUrl?: string) {
    const detailMessage = this.getClientFacingDetailMessage();

    const baseResponse = {
      type: `/errors/${this.kind.toLowerCase()}/${this.code.toLowerCase()}`,
      title: this.code
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' '),
      status: this.getHttpStatus(),
      detail: detailMessage,
      code: this.code,
    };

    if (this.additionalData) {
      const safeFields = this.getSafeFieldsForClient(this.additionalData);
      // Exclude 'message' from safeFields since it's already used in detail
      const { message, ...fieldsWithoutMessage } = safeFields;
      if (Object.keys(fieldsWithoutMessage).length > 0) {
        return { ...baseResponse, ...fieldsWithoutMessage };
      }
    }

    return baseResponse;
  }

  /**
   * Message shown to API clients (StandardResponse.note / Problem Details detail).
   * CMS: CMS `note` when meaningful; otherwise safe CMS copy.
   * Other kinds: fixed copy per domain/code (internal exception text is not exposed).
   */
  private getClientFacingDetailMessage(): string {
    return getPublicClientErrorMessage({
      kind: this.kind,
      code: this.code,
      additionalData: this.additionalData,
    });
  }

  /**
   * Filters only fields that can be safely exposed to the client.
   * Excludes sensitive information for security purposes.
   *
   * @private
   */
  private getSafeFieldsForClient(additionalData: Record<string, any>): Record<string, any> {
    const safeFields: Record<string, any> = {};

    const allowedFields = [
      'missingFields',
      'dbname',
      'bname',
      'confname',
      'type',
      'parameter',
      'requestedSizeBytes',
      'maximumSizeBytes',
      // Per-line reasons from the conf text check (validateConfText) —
      // { lineNo, key, message }, no host data.
      'problems',
    ];

    const sensitiveFields = [
      'response',
      'stack',
      'originalError',
      'hostUid',
      'userId',
      'password',
      'token',
      'address',
      'port',
    ];

    for (const [key, value] of Object.entries(additionalData)) {
      if (allowedFields.includes(key) && !sensitiveFields.includes(key)) {
        safeFields[key] = value;
      }
    }

    return safeFields;
  }

  toLogDetails(requestUrl?: string) {
    return {
      type: `/errors/${this.kind.toLowerCase()}/${this.code.toLowerCase()}`,
      title: this.code
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' '),
      status: this.getHttpStatus(),
      detail: this.message,
      instance: requestUrl || '',
      kind: this.kind,
      code: this.code,
      timestamp: new Date().toISOString(),
      ...(this.additionalData || {}),
      ...(this.originalError
        ? {
            originalError: {
              name: this.originalError.name,
              message: this.originalError.message,
              stack: this.originalError.stack,
            },
          }
        : {}),
    };
  }

  private getHttpStatus(): number {
    switch (this.kind) {
      case 'AUTH':
        switch (this.code) {
          case AuthErrorCode.INVALID_CREDENTIALS:
          case AuthErrorCode.INVALID_TOKEN:
            return 401;
          case AuthErrorCode.PERMISSION_DENIED:
            return 403;
          case AuthErrorCode.INTERNAL_ERROR:
            return 500;
          case AuthErrorCode.UNKNOWN:
            return 500;
          default:
            return 401;
        }
      case 'RESOURCE':
        // Subdivide RESOURCE errors
        switch (this.code) {
          case HostErrorCode.NO_SUCH_HOST:
            return 404; // Not Found
          case HostErrorCode.EXCEED_MAX_HOSTS:
          case HostErrorCode.INVALID_FORMAT:
            return 400;
          case HostErrorCode.DUPLICATED_HOST:
            return 409; // Conflict - resource collision
          case HostErrorCode.INTERNAL_ERROR:
          case HostErrorCode.UNKNOWN:
            return 500; // Internal Server Error
          default:
            return 400;
        }
      case 'USER':
        switch (this.code) {
          case UserErrorCode.USER_NOT_FOUND:
            return 404; // Not Found
          case UserErrorCode.USER_ALREADY_EXISTS:
            return 409; // Conflict - resource already exists
          case UserErrorCode.DATA_SAVE_FAILED:
          case UserErrorCode.DATA_LOAD_FAILED:
          case UserErrorCode.DATA_DELETE_FAILED:
          case UserErrorCode.DATA_UPDATE_FAILED:
            return 500; // Internal server error
          case UserErrorCode.RESOURCE_LOCKED:
            return 423; // Locked - resource is locked
          case UserErrorCode.LOCK_OPERATION_FAILED:
            return 500; // Internal server error
          case UserErrorCode.OLD_PASSWORD_MISMATCH:
          case UserErrorCode.BAD_NEW_PASSWORD:
            return 400; // Bad request
          case UserErrorCode.UNKNOWN:
            return 500; // Internal server error

          default:
            return 500;
        }
      case 'STORAGE':
        switch (this.code) {
          case StorageErrorCode.NO_SUCH_FILE:
          case StorageErrorCode.FILE_NOT_FOUND: // Deprecated
          case StorageErrorCode.FILE_ALREADY_EXISTS:
            return 400;
          case StorageErrorCode.PERMISSION_DENIED:
            return 403;
          case StorageErrorCode.UNKNOWN:
            return 500;
          default:
            return 500;
        }
      case 'LOCK':
        switch (this.code) {
          case LockErrorCode.LOCK_NOT_FOUND:
            return 404; // Not Found
          case LockErrorCode.PERMISSION_DENIED:
            return 403;
          case LockErrorCode.LOCK_ALREADY_HELD:
            return 409;
          case LockErrorCode.STALE_LOCK:
            return 410; // Gone - expired lock
          case LockErrorCode.UNKNOWN:
            return 500;
          default:
            return 500;
        }
      case 'INTERNAL':
        return 500;
      case 'DATABASE':
        switch (this.code) {
          case DatabaseErrorCode.NO_SUCH_DATABASE:
            return 404;
          case DatabaseErrorCode.DUPLICATED_DATABASE_PROFILE:
          case DatabaseErrorCode.OPERATION_IN_PROGRESS:
            return 409;
          case DatabaseErrorCode.INVALID_PARAMETER:
            return 400;
          case DatabaseErrorCode.INTERNAL_ERROR:
          case DatabaseErrorCode.GET_START_INFO_FAILED:
          case DatabaseErrorCode.START_DATABASE_FAILED:
          case DatabaseErrorCode.STOP_DATABASE_FAILED:
          case DatabaseErrorCode.RESTART_DATABASE_FAILED:
          case DatabaseErrorCode.LOGIN_DATABASE_FAILED:
          case DatabaseErrorCode.GET_DB_SPACE_INFO_FAILED:
            return 500;
          default:
            return 500;
        }
      case 'CONFIG':
        switch (this.code) {
          case ConfigErrorCode.SERVER_PARAM_NOT_FOUND:
          case ConfigErrorCode.NO_CONFLIST_DATA:
          case ConfigErrorCode.NO_CONFDATA:
            return 404;
          case ConfigErrorCode.DBNAME_ALREADY_EXISTS:
            return 409;
          case ConfigErrorCode.DBNAME_NOT_FOUND:
            return 404;
          case ConfigErrorCode.GET_ALL_SYS_PARAM_FAILED:
          case ConfigErrorCode.SET_SYS_PARAM_FAILED:
          case ConfigErrorCode.UNKNOWN:
            return 500;
          default:
            return 500;
        }
      case 'CMS':
        switch (this.code) {
          case CmsErrorCode.INVALID_TOKEN:
            return 401; // Unauthorized
          case CmsErrorCode.TLS_ERROR:
            return 502; // Bad Gateway — CMS itself is unreachable/untrusted
          case CmsErrorCode.REQUEST_FAILED:
          case CmsErrorCode.NO_RESPONSE:
          case CmsErrorCode.UNKNOWN:
            return 500; // Internal Server Error
          default:
            return 500;
        }
      case 'VALIDATION':
        return 400; // All validation errors are bad requests
      case 'BROKER':
        switch (this.code) {
          case BrokerErrorCode.GET_BROKER_FAILED:
          case BrokerErrorCode.BROKER_STOP_FAILED:
          case BrokerErrorCode.BROKER_START_FAILED:
          case BrokerErrorCode.INTERNAL_ERROR:
          case BrokerErrorCode.UNKNOWN:
            return 500; // Internal Server Error
          default:
            return 500;
        }
      default:
        return 500;
    }
  }
}
