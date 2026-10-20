import { HashMap } from '../models/collections';
import { DBInfo } from '../models/db-info';

/**
 * Response interface for getting database connections list.
 *
 * Contains a hashmap of database information returned from the server.
 * Passwords are omitted for security.
 *
 * @category Responses
 * @since 1.0.0
 */
export type GetDbsResponse = {
  db_list: HashMap<Omit<DBInfo, 'password'>>;
};
