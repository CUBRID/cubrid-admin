import { AppError } from '@error/app-error';
import { AuthErrorCode } from '@error/auth/auth-error-code';

export { AuthErrorCode };

/**
 * Represents an authentication-specific error.
 * Extends AppError and provides static factory methods for common authentication error scenarios.
 *
 * @category Errors
 * @since 1.0.0
 */
export class AuthError extends AppError {
  constructor(
    kind: 'AUTH' | 'INTERNAL',
    code: AuthErrorCode,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    super(kind, code, additionalData, originalError);
  }

  /**
   * Creates an error indicating invalid authentication credentials.
   */
  static InvalidCredentials(additionalData?: Record<string, any>, originalError?: Error) {
    return new AuthError('AUTH', AuthErrorCode.INVALID_CREDENTIALS, additionalData, originalError);
  }

  /**
   * Creates an error indicating an internal authentication server error.
   */
  static InternalError(additionalData?: Record<string, any>, originalError?: Error) {
    return new AuthError('INTERNAL', AuthErrorCode.INTERNAL_ERROR, additionalData, originalError);
  }

  /**
   * Creates an error indicating that the user does not have permission to access a resource.
   */
  static PermissionDenied(additionalData?: Record<string, any>, originalError?: Error) {
    return new AuthError('AUTH', AuthErrorCode.PERMISSION_DENIED, additionalData, originalError);
  }

  /**
   * Creates an error indicating an invalid or expired authentication token.
   */
  static InvalidToken(additionalData?: Record<string, any>, originalError?: Error) {
    return new AuthError('AUTH', AuthErrorCode.INVALID_TOKEN, additionalData, originalError);
  }

  /**
   * Creates an error indicating that an admin disabled the account.
   */
  static AccountDisabled(additionalData?: Record<string, any>, originalError?: Error) {
    return new AuthError('AUTH', AuthErrorCode.ACCOUNT_DISABLED, additionalData, originalError);
  }

  /**
   * Creates an error indicating that the account signed up and waits for an
   * administrator to approve it.
   */
  static AccountPendingApproval(additionalData?: Record<string, any>, originalError?: Error) {
    return new AuthError('AUTH', AuthErrorCode.ACCOUNT_PENDING_APPROVAL, additionalData, originalError);
  }

  /**
   * Creates an error indicating that the account must set a new password first.
   */
  static PasswordChangeRequired(additionalData?: Record<string, any>, originalError?: Error) {
    return new AuthError('AUTH', AuthErrorCode.PASSWORD_CHANGE_REQUIRED, additionalData, originalError);
  }

  /**
   * Creates an error for an unknown authentication issue.
   */
  static Unknown(additionalData?: Record<string, any>, originalError?: Error) {
    return new AuthError('AUTH', AuthErrorCode.UNKNOWN, additionalData, originalError);
  }
}
