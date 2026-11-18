import { AppError } from '@error/app-error';
import { UserErrorCode } from '@error/user/user-error-code';

export { UserErrorCode };

/**
 * Error class for user-related operations.
 *
 * @category Errors
 * @since 1.0.0
 */
export class UserError extends AppError {
  constructor(
    kind: 'USER',
    code: UserErrorCode,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    super(kind, code, additionalData, originalError);
  }

  /**
   * Creates an error indicating that a user was not found.
   */
  static UserNotFound(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.USER_NOT_FOUND, additionalData, originalError);
  }

  /**
   * Creates an error indicating that a user with the given ID already exists.
   */
  static UserAlreadyExists(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.USER_ALREADY_EXISTS, additionalData, originalError);
  }

  /**
   * Creates an error indicating that user data failed to save.
   */
  static DataSaveFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.DATA_SAVE_FAILED, additionalData, originalError);
  }

  /**
   * Creates an error indicating that user data failed to load.
   */
  static DataLoadFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.DATA_LOAD_FAILED, additionalData, originalError);
  }

  /**
   * Creates an error indicating that user data failed to delete.
   */
  static DataDeleteFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.DATA_DELETE_FAILED, additionalData, originalError);
  }

  /**
   * Creates an error indicating that user data failed to update.
   */
  static DataUpdateFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.DATA_UPDATE_FAILED, additionalData, originalError);
  }

  /**
   * Creates an error indicating that a user resource is locked.
   */
  static ResourceLocked(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.RESOURCE_LOCKED, additionalData, originalError);
  }

  /**
   * Creates an error indicating that a lock operation on a user resource failed.
   */
  static LockOperationFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError(
      'USER',
      UserErrorCode.LOCK_OPERATION_FAILED,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating that the old password provided does not match.
   */
  static OldPasswordMismatch(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError(
      'USER',
      UserErrorCode.OLD_PASSWORD_MISMATCH,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating that the new password provided is invalid.
   */
  static BadNewPassword(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.BAD_NEW_PASSWORD, additionalData, originalError);
  }

  /**
   * An admin tried to disable, demote, delete or reset their own account
   * from user management (their profile covers their own password).
   */
  static AdminSelfChange(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.ADMIN_SELF_CHANGE, additionalData, originalError);
  }

  /**
   * The change would leave no active admin account.
   */
  static LastAdmin(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.LAST_ADMIN, additionalData, originalError);
  }

  /**
   * The account is admin by ADMIN_USERS in cwm.conf, which the UI can't override.
   */
  static AdminByConfig(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.ADMIN_BY_CONFIG, additionalData, originalError);
  }

  /**
   * A new account's id is too short or starts or ends with spaces.
   */
  static InvalidAccountId(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.INVALID_ACCOUNT_ID, additionalData, originalError);
  }

  /**
   * The account signed up and waits for approval; approve or reject it first.
   */
  static AccountPending(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.ACCOUNT_PENDING, additionalData, originalError);
  }

  /**
   * The sign-up was already approved or rejected (by another admin, say).
   */
  static NotPending(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.NOT_PENDING, additionalData, originalError);
  }

  /**
   * The new password is the temporary one an admin set.
   */
  static PasswordUnchanged(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.PASSWORD_UNCHANGED, additionalData, originalError);
  }

  /**
   * Creates an error for an unknown user-related issue.
   */
  static Unknown(additionalData?: Record<string, any>, originalError?: Error) {
    return new UserError('USER', UserErrorCode.UNKNOWN, additionalData, originalError);
  }
}
