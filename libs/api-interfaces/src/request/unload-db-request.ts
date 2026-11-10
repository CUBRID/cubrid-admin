/**
 * Request type for unloading a database.
 *
 * @category Requests
 * @since 1.0.0
 */
export type UnloadDatabaseRequest = {
  /**
   * Task name - must be "unloaddb"
   */

  /**
   * Output directory path (required)
   */
  targetdir: string;

  /**
   * Unload target: "schema", "object", or "both" (required)
   */

  /**
   * Is unloaddb request includes unloading schema
   */
  isSchemaIncluded: boolean;

  /**
   * IS unloaddb request includes unloading data
   */
  isDataIncluded: boolean;

  /**
   * Database user ID
   */
  dbuser: string;

  /**
   * Database user password
   */
  dbpasswd: string;

  /**
   * Whether to use hash file: "yes" or "no" (optional)
   */
  usehash?: 'yes' | 'no';

  /**
   * Hash file path (optional, required if usehash is "yes")
   */
  hashdir?: string;

  /**
   * Class list to unload (optional)
   */
  class?: Array<{
    /**
     * Class name to unload
     */
    classname: string;
  }>;

  /**
   * Include referenced tables: "yes" or "no" (optional)
   */
  ref?: 'yes' | 'no';

  /**
   * Include specified class only: "yes" or "no" (optional)
   */
  classonly?: 'yes' | 'no';

  /**
   * Extract the same schema file as the DBA: "yes" or "no" (optional)
   */
  'as-dba'?: 'yes' | 'no';

  /**
   * Skip with option of indexes: "yes" or "no" (optional)
   */
  'skip-index-detail'?: 'yes' | 'no';

  /**
   * Split schema information by object: "yes" or "no" (optional)
   */
  'split-schema-files'?: 'yes' | 'no';

  /**
   * Use '"' where an identifier begins and ends: "yes" or "no" (optional, default: "no")
   */
  delimit?: 'yes' | 'no';

  /**
   * Estimated number of instances (optional, default: auto computed)
   */
  estimate?: string | 'none';

  /**
   * Prefix for output files (optional, default: database name)
   */
  prefix?: string | 'none';

  /**
   * Number of cached pages (optional, default: 100)
   */
  cach?: string | 'none';
};
