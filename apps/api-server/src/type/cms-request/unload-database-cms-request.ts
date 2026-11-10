import { BaseCmsRequest } from './base-cms-request';

/**
 * Request type for unloading a database.
 *
 * @category CMS Requests
 * @since 1.0.0
 */
export type UnloadDatabaseCmsRequest = BaseCmsRequest & {
  /**
   * Database name to unload
   */
  dbname: string;

  /**
   * PATH of output directory
   */
  targetdir: string;

  /**
   * Whether to use hash file
   *
   * Values: "yes" | "no"
   * If "yes", hashdir is valid
   */
  usehash?: 'yes' | 'no';

  /**
   * FILE for hash
   * Default: generate by tmpnam()
   * Valid only when usehash is "yes"
   */
  hashdir?: string;

  /**
   * Unload schema/object or both
   */
  target?: string;

  /**
   * Unload class list, if field doesn't exist, all class is target
   * Format: Array of objects with classname property
   * Example: [{"classname": "dba.test"}]
   */
  class?: Array<{ classname: string }>;

  /**
   * Unload class name
   */
  classname?: string;

  /**
   * Include referenced tables
   * Values: "yes" | "no"
   */
  ref?: 'yes' | 'no';

  /**
   * Include specified class only
   * Values: "yes" | "no"
   */
  classonly?: 'yes' | 'no';

  /**
   * Extract the same schema file as the DBA
   */
  'as-dba'?: string;

  /**
   * Skip with option of indexes
   */
  'skip-index-detail'?: string;

  /**
   * Split schema information by object
   */
  'split-schema-files'?: 'yes' | 'no';

  /**
   * Use '"' where an identifier begins and ends
   * Default: don't use
   * Values: "yes" | "no"
   */
  delimit?: 'yes' | 'no';

  /**
   * Estimated NUMBER of instances
   * Default: auto computed
   */
  estimate?: string;

  /**
   * PREFIX for output files
   * Default: the database name
   */
  prefix?: string;

  /**
   * NUMBER of cached pages
   * Default: 100
   */
  cach?: string;

  /**
   * ID for dbuser
   */
  dbuser?: string;

  /**
   * Password for dbuser
   */
  dbpasswd?: string;
};
