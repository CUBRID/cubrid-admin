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
}
