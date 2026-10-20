import { StartInfoClientResponse } from './database-client-response';

/**
 * Result type for individual operation in create database with config workflow.
 *
 * @category Client Responses
 * @since 1.0.0
 */
export type OperationResult<T = unknown> = {
  /**
   * Whether the operation succeeded
   */
  success: boolean;

  /**
   * Operation result data (only present if success is true)
   */
  data?: T;

  /**
   * Error information (only present if success is false)
   */
  error?: {
    /**
     * Error message
     */
    message: string;

    /**
     * Error code (optional)
     */
    code?: string;

    /**
     * Additional error details (optional)
     */
    details?: any;
  };
};

/**
 * Client response type for creating a database with configuration.
 * Contains results from all executed operations with success/error status.
 *
 * @category Client Responses
 * @since 1.0.0
 */
export type CreateDatabaseWithConfigResponse = {
  /**
   * Result from database creation
   */
  createDatabase: OperationResult;

  /**
   * Result from starting database after creation
   * Contains start info with database list and active list
   */
  startDatabase?: OperationResult<StartInfoClientResponse>;

  /**
   * Result from user update (if requested)
   */
  updateUser?: OperationResult;

  /**
   * Result from auto-add volume configuration (if requested)
   */
  setAutoAddVol?: OperationResult;

  /**
   * Result from auto-start configuration (if requested)
   */
  setAutoStart?: OperationResult;
};
