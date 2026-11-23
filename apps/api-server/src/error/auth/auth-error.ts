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
   * Creates an error for a refresh whose token another request is still
   * rotating (503 with Retry-After; the session is kept).
   */
  static RefreshInProgress(additionalData?: Record<string, any>) {
    return new AuthError('AUTH', AuthErrorCode.REFRESH_IN_PROGRESS, additionalData);
  }

  /**
   * Creates an error for an unknown authentication issue.
   */
  static Unknown(additionalData?: Record<string, any>, originalError?: Error) {
    return new AuthError('AUTH', AuthErrorCode.UNKNOWN, additionalData, originalError);
  }
}

/**
 * A request turned away for its login or request header (a wrong password,
 * an invalid or missing JWT, a spent refresh token, no CSRF header, a
 * refresh racing another for the same token): expected traffic,
 * logged as a warning without a stack, not as a server fault.
 */
export function isExpectedAuthRejection(error: unknown): boolean {
  if (!(error instanceof AuthError) || error.kind !== 'AUTH') return false;
  if (
    error.code === AuthErrorCode.INVALID_TOKEN ||
    error.code === AuthErrorCode.INVALID_CREDENTIALS ||
    error.code === AuthErrorCode.REFRESH_IN_PROGRESS
  ) {
    return true;
  }
  return error.code === AuthErrorCode.PERMISSION_DENIED && error.additionalData?.reason === 'CSRF_HEADER_MISSING';
}
