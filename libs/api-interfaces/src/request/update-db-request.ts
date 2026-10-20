import { DBInfo } from '../models/db-info';

/**
 * Request interface for updating an existing database connection.
 *
 * Contains database information without UID (UID is provided in URL parameter).
 * Includes password as it may need to be updated.
 *
 * @category Requests
 * @since 1.0.0
 */
export type UpdateDbRequest = Omit<DBInfo, 'uid'>;
