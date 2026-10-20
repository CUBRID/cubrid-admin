/**
 * Client request type for loading a database.
 *
 * @category Client Requests
 * @since 1.0.0
 */
export type LoadDatabaseRequest = {
  /**
   * Check option
   * - "syntax": CMS maps to --check-only
   * - "load": CMS maps to --load-only
   * - others (e.g. "both", "none"): default loaddb behavior
   */
  checkoption: string;

  /**
   * Period
   * Values: "none" | other values
   */
  period: string;

  /**
   * CMS loaddb database user id (the -u/--user flag). Always sent, always
   * from the form — CUBRID's loaddb defaults to PUBLIC (not DBA) if --user
   * is omitted entirely, which typically can't create classes.
   */
  _DBID: string;

  /**
   * CMS loaddb database password (the --password flag). Always sent as-is
   * from the form (may be an empty string — that's a legitimate password,
   * not "unset").
   */
  _DBPASSWD: string;

  /**
   * Estimated
   * Values: "none" | other values
   */
  estimated: string;

  /**
   * OID use
   * Values: "yes" | "no"
   */
  oiduse: 'yes' | 'no';

  /**
   * Statistics use
   * Values: "yes" | "no"
   */
  statisticsuse: 'yes' | 'no';

  /**
   * No log
   * Values: "yes" | "no"
   */
  nolog: 'yes' | 'no';

  /**
   * Schema file path
   */
  schema: string;

  /**
   * Object file path
   */
  object: string;

  /**
   * Index
   * Values: "none" | other values
   */
  index: string;

  /**
   * Error control file
   * Values: "none" | file path
   */
  errorcontrolfile: string;

  /**
   * Ignore class file
   * Values: "none" | file path
   */
  ignoreclassfile: string;
};
