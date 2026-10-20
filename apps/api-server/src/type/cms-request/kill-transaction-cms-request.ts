import { BaseCmsRequest } from './base-cms-request';

/**
 * Request type for killtransaction task.
 *
 * @category CMS Requests
 * @since 1.0.0
 */
export type KillTransactionCmsRequest = BaseCmsRequest & {
  /**
   * Task type - must be 'killtransaction'
   */
  task: 'killtransaction';

  /**
   * Database name
   */
  dbname: string;

  /**
   * Type of operation:
   * - 'd': Display active transaction (parameter not required)
   * - 'i': Kill transaction by transaction index (parameter required - transaction index)
   * - 'p': Kill all transactions with the specified process name (parameter required - process name)
   * - 'h': Kill all transactions from the specified host (parameter required - host name)
   */
  type: 'd' | 'i' | 'p' | 'h';

  /**
   * Parameter value (required for type 'i', 'p', 'h', not required for type 'd'):
   * - For type 'd': not required
   * - For type 'i': transaction index (string, e.g., "1", "2")
   * - For type 'p': process name (string, e.g., "query_editor_cub_cas_1")
   * - For type 'h': host name (string, e.g., "lgj1089-3-60")
   */
  parameter?: string;

  /**
   * DBA password used to authorize the kill. Optional — if omitted, CMS
   * falls back to the dbmtuserlogin-populated conlist cache on the server.
   */
  _DBPASSWD?: string;
};
