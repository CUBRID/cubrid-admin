/**
 * Lock holder information.
 *
 * @category Client Responses
 * @since 1.0.0
 */
export type LockHolder = {
  /**
   * Count
   */
  count: string;

  /**
   * Granted mode (e.g., "IS_LOCK", "IX_LOCK")
   */
  granted_mode: string;

  /**
   * Number of sub-granules
   */
  nsubgranules: string;

  /**
   * Transaction index
   */
  tran_index: string;
};

/**
 * Lock entry information.
 *
 * @category Client Responses
 * @since 1.0.0
 */
export type LockEntry = {
  /**
   * Lock holders (optional, only present when lock is held)
   */
  lock_holders?: LockHolder[];

  /**
   * Number of B holders (may be "missing" or numeric string)
   */
  num_b_holders: string;

  /**
   * Number of holders (may be "inser" or numeric string)
   */
  num_holders: string;

  /**
   * Number of waiters (may be "=" or numeric string)
   */
  num_waiters: string;

  /**
   * Object type
   */
  ob_type: string;

  /**
   * Object ID
   */
  oid: string;
};

/**
 * Lock object table information.
 *
 * @category Client Responses
 * @since 1.0.0
 */
export type LockObjectTable = {
  /**
   * Array of lock entries
   */
  entry: LockEntry[];

  /**
   * Maximum number of locks
   */
  maxnumlock: string;

  /**
   * Number of allocated locks (optional, may not be present)
   */
  numallocated?: string;

  /**
   * Number of locked objects
   */
  numlocked: string;

  /**
   * Size of lock (optional, may not be present)
   */
  sizelock?: string;
};

/**
 * Transaction information.
 *
 * @category Client Responses
 * @since 1.0.0
 */
export type TransactionInfo = {
  /**
   * User ID
   */
  '@uid': string;

  /**
   * Host name
   */
  host: string;

  /**
   * Transaction index
   */
  index: string;

  /**
   * Isolation level
   */
  isolevel: string;

  /**
   * Process ID
   */
  pid: string;

  /**
   * Process name
   */
  pname: string;

  /**
   * Timeout
   */
  timeout: string;
};

/**
 * Lock information.
 *
 * @category Client Responses
 * @since 1.0.0
 */
export type LockInfo = {
  /**
   * Deadlock interval
   */
  dinterval: string;

  /**
   * ESC (Escalation) value
   */
  esc: string;

  /**
   * Lock object table
   */
  lot: LockObjectTable[];

  /**
   * Transaction information
   */
  transaction: TransactionInfo[];
};

/**
 * Client response type for getting lock information of a database.
 * Returns domain-only data (CMS envelope removed).
 *
 * @category Client Responses
 * @since 1.0.0
 */
export type LockDatabaseResponse = {
  /**
   * Array of lock information. Omitted when the request asked for `summary`.
   */
  lockinfo?: LockInfo[];
  /**
   * Locks grouped per transaction, table and mode, when the request asked for `summary`.
   */
  summary?: LockSummary;
};

/** One group of locks: one transaction's locks of one mode on one table. */
export type LockSummaryRow = {
  /** Transaction index */
  index: string;
  user: string;
  host: string;
  pid: string;
  program: string;
  /** Lock object without its OID, e.g. "Instance of class = dba.t1" or "Class = dba.t1" */
  obj: string;
  mode: string;
  /** Number of lock objects in the group */
  count: number;
};

export type LockSummary = {
  rows: LockSummaryRow[];
  /** Lock objects with at least one holder, before grouping */
  totalLocks: number;
};
