import { DBInfo } from '../models/db-info';

/**
 * Response interface for single database connection information.
 *
 * Contains database information without password for security.
 * Used when returning individual database data to client.
 *
 * @category Responses
 * @since 1.0.0
 */
export type DbResponse = Omit<DBInfo, 'password'>;
