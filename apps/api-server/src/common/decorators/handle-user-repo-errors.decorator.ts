import { UserError } from '@error/user/user-error';
import { LockError, LockErrorCode } from '@error/lock/lock-error';
import { StorageError, StorageErrorCode } from '@error/storage/storage-error';

/**
 * A method decorator that wraps a repository method in a try...catch block.
 *
 * It provides centralized handling for LockError and StorageError, translating
 * them into the appropriate domain-specific UserError.
 *
 * @assumption This decorator assumes that the first argument of the decorated
 * method is a string (e.g., userId) that can be used for logging context.
 *
 * @category Decorators
 * @since 1.0.0
 */
export function HandleUserRepoErrors() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (err) {
        const contextId = args[0] || 'unknown';

        if (err instanceof StorageError) {
          switch (err.code) {
            case StorageErrorCode.NO_SUCH_FILE:
            case StorageErrorCode.FILE_NOT_FOUND: // Deprecated
              throw UserError.UserNotFound({ userId: contextId }, err);
            case StorageErrorCode.FILE_ALREADY_EXISTS:
              throw UserError.UserAlreadyExists({ userId: contextId }, err);
            default:
              throw UserError.Unknown(
                {
                  resourceId: contextId,
                  storageError: err.code,
                },
                err
              );
          }
        }

        if (err instanceof LockError) {
          switch (err.code) {
            case LockErrorCode.LOCK_NOT_FOUND:
              if (err.message?.includes('ENOENT')) {
                throw UserError.UserNotFound({ userId: contextId }, err);
              }
              throw UserError.LockOperationFailed({ resourceId: contextId, reason: err.code }, err);
            case LockErrorCode.LOCK_ALREADY_HELD:
              throw UserError.ResourceLocked({ resourceId: contextId }, err);
            case LockErrorCode.STALE_LOCK:
              // The lock was lost while the request ran: the client gets the
              // lock's own answer (410, "try again"), not a user error (500).
              throw err;
            case LockErrorCode.PERMISSION_DENIED:
            case LockErrorCode.UNKNOWN:
            default:
              throw UserError.LockOperationFailed({ resourceId: contextId, reason: err.code }, err);
          }
        }

        throw err;
      }
    };

    return descriptor;
  };
}
