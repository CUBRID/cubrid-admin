import { BaseCmsRequest } from './base-cms-request';

/**
 * Request type for loading a database.
 *
 * @category CMS Requests
 * @since 1.0.0
 */
export type LoadDatabaseCmsRequest = BaseCmsRequest & {
  /**
   * Task type - must be 'loaddb'
   */
  task: 'loaddb';

  /**
   * Database name to load
   */
  dbname: string;

  /**
   * Check option
   * Values: "both" | "none" | other values
   */
  checkoption: string;

  /**
   * Period
   * Values: "none" | other values
   */
  period: string;

  /**
   * CMS loaddb database user id. Always sent as-is — see LoadDatabaseRequest._DBID.
   */
  _DBID: string;

  /**
   * CMS loaddb database password. Always sent as-is — see LoadDatabaseRequest._DBPASSWD.
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
   * Trigger
   * Values : "none" / other values 
   */
  // trigger : string;
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
