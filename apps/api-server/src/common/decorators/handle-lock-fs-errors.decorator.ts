import { LockError } from '@error/lock/lock-error';
import { AppError } from '@error';

/**
 * A method decorator that wraps lock service methods in a try...catch block.
 *
 * It provides centralized handling for file system errors related to lock operations,
 * translating them into appropriate LockError instances.
 *
 * This decorator handles various lock-related file system errors including:
 * - ENOENT: Lock file not found
 * - EACCES/EPERM: Permission denied
 * - EEXIST/ELOCKED: Lock already held
 * - ENOTACQUIRED: Lock not acquired
 * - ECOMPROMISED: Lock compromised
 * - ERELEASED: Lock already released
 *
 * @category Decorators
 * @since 1.0.0
 * @example
 * ```typescript
 * class LockService {
 *   @HandleLockFsErrors()
 *   async acquireLock(filePath: string): Promise<void> {
 *     // Lock acquisition logic
 *   }
 * }
 * ```
 */
export function HandleLockFsErrors() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (err) {
        if (err instanceof AppError) {
          throw err;
        }
        switch (err?.code) {
          case 'ENOENT':
            throw LockError.LockNotFound({ filePath: err.path }, err);
          case 'EACCES':
          case 'EPERM':
            throw LockError.PermissionDenied({ filePath: err.path }, err);
          case 'EEXIST':
          case 'ELOCKED': // proper-lockfile code
            throw LockError.LockAlreadyHeld({ filePath: err.file || err.path }, err);
          case 'ENOTACQUIRED': // proper-lockfile code
            throw LockError.LockNotFound({ filePath: err.file }, err);
          case 'ECOMPROMISED': // proper-lockfile code: the lock is no longer ours
            throw LockError.StaleLock({ reason: 'Lock compromised', filePath: err.file || err.path }, err);
          case 'ERELEASED': // proper-lockfile code
            throw LockError.LockNotFound(
              {
                reason: 'Lock already released',
                filePath: err.file,
              },
              err
            );
          default:
            throw LockError.Unknown({ originalCode: err?.code }, err);
        }
      }
    };
    return descriptor;
  };
}
