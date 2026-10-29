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
   * Array of lock information. Omitted when the request asked for `summary` or `objects`.
   */
  lockinfo?: LockInfo[];
  /**
   * Locks grouped per transaction, table and mode, when the request asked for `summary`.
   */
  summary?: LockSummary;
  /**
   * Settings, lock table counters and transactions, sent with `summary`.
   */
  overview?: LockOverview;
  /**
   * One row per locked object, when the request asked for `objects`.
   */
  objects?: LockObjectRow[];
};

/** A transaction as lockdb lists it. */
export type LockTransaction = {
  index: string;
  user: string;
  host: string;
  pid: string;
  program: string;
  isolation: string;
  /**
   * As CMS reports it. The engine prints "Timeout_period : <value>" and CMS
   * keeps the second word, so this is ":" on current CMS builds.
   */
  timeout: string;
};

/** lockdb output without the per-object lock table. Empty strings where CMS sent nothing. */
export type LockOverview = {
  /** Lock escalation threshold (lock_escalation): locks on one table's rows before a table lock */
  esc: string;
  /** Deadlock detection interval in seconds (deadlock_detection_interval_in_secs) */
  dinterval: string;
  /** Objects currently locked */
  numlocked: string;
  /** Lock objects allocated (CUBRID 11.4 and later) */
  numallocated: string;
  /** Memory for allocated lock objects, as the engine prints it: bytes, or with a K or M suffix (1024-based) */
  sizelock: string;
  /** Most objects that can be locked (before CUBRID 11.4) */
  maxnumlock: string;
  transactions: LockTransaction[];
};

/** One holder of a locked object. */
export type LockObjectHolder = {
  /** Transaction index */
  index: string;
  mode: string;
  count: string;
};

/** One locked object. */
export type LockObjectRow = {
  /** volid|pageid|slotid, without the engine's padding */
  oid: string;
  /** Object type as the engine names it, e.g. "Instance of class ( 0| 553| 1) = dba.t1" */
  obj: string;
  holders: LockObjectHolder[];
  /** Counts as CMS reports them, or "-" when CMS sent something else */
  numHolders: string;
  numBlockedHolders: string;
  numWaiters: string;
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
