/**
 * Enumeration of authentication error codes.
 *
 * @category Errors
 * @since 1.0.0
 */
export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  /** The same refresh token is still being rotated by another request: retry shortly. */
  REFRESH_IN_PROGRESS = 'REFRESH_IN_PROGRESS',
  UNKNOWN = 'UNKNOWN',
}
