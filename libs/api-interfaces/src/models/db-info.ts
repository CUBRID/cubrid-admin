/**
 * Interface representing database connection information.
 *
 * Contains database connection details including host, port,
 * database name, and authentication credentials.
 *
 * @category Types
 * @since 1.0.0
 */
export interface DBInfo {
  dbname: string;
  id: string;
  password: string;
  /**
   * Set when the user logs out of this database. The profile is kept, but
   * ensureDbLogin won't log in with it again until the user logs in.
   */
  loggedOut?: boolean;
}
