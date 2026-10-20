/**
 * Client request type for getting lock information of a database.
 * No request body required - dbname is in path parameter.
 *
 * @category Client Requests
 * @since 1.0.0
 */
export type LockDatabaseRequest = Record<string, never>;
