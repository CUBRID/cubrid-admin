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

/**
 * The app session the access cookie holds (GET /auth/session): for a page
 * that keeps no session of its own yet, or an older one.
 *
 * @category Responses
 * @since 0.2.0
 */
export type SessionResponse = LoginResponse & {
  /** Seconds left before the access token expires. */
  expiresLeft: number;
  /** The ID the session logged in with. */
  user: string;
};
