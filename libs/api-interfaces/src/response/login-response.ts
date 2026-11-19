/**
 * Response body for login and session refresh. The tokens themselves are
 * set as httpOnly cookies and never appear in the body.
 *
 * @category Responses
 * @since 1.0.0
 */
export type LoginResponse = {
  /** Access token lifetime in seconds. */
  expiresIn: number;
};
