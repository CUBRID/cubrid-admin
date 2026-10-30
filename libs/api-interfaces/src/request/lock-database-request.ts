/**
 * Client request type for getting lock information of a database.
 * dbname is in the path parameter.
 *
 * @category Client Requests
 * @since 1.0.0
 */
export type LockDatabaseRequest = {
  /**
   * Return locks grouped per transaction, table and mode (with a count)
   * instead of the raw lock table, which can hold tens of thousands of
   * entries when a transaction locks many rows.
   */
  summary?: boolean;

  /**
   * Return one row per locked object (OID, holders, waiter counts) instead
   * of the raw lock table, in which CMS splits each object over two entries.
   */
  objects?: boolean;
};
