import { AppError } from '@error/app-error';
import { ConfigErrorCode } from './config-error-code';

/**
 * Error class for configuration-related operations.
 *
 * @category Errors
 * @since 1.0.0
 */
export class ConfigError extends AppError {
  constructor(
    kind: 'CONFIG',
    code: ConfigErrorCode,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    super(kind, code, additionalData, originalError);
  }

  /**
   * Creates an error indicating that configuration file has no conflist data.
   */
  static NoConflistData(
    confname: string,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    return new ConfigError(
      'CONFIG',
      ConfigErrorCode.NO_CONFLIST_DATA,
      { confname, ...additionalData },
      originalError
    );
  }

  /**
   * Creates an error indicating that configuration file has no confdata.
   */
  static NoConfdata(confname: string, additionalData?: Record<string, any>, originalError?: Error) {
    return new ConfigError(
      'CONFIG',
      ConfigErrorCode.NO_CONFDATA,
      { confname, ...additionalData },
      originalError
    );
  }

  /**
   * Creates an error indicating that server parameter was not found in configuration file.
   * If additionalData.message is provided, it will be used as the error message.
   */
  static ServerParamNotFound(
    confname: string,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    const defaultMessage = `server parameter not found in configuration file: ${confname}`;
    return new ConfigError(
      'CONFIG',
      ConfigErrorCode.SERVER_PARAM_NOT_FOUND,
      {
        confname,
        message: additionalData?.message || defaultMessage,
        ...additionalData,
      },
      originalError
    );
  }

  /**
   * Creates an error indicating that database name already exists in server parameter.
   */
  static DbnameAlreadyExists(
    confname: string,
    dbname: string,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    return new ConfigError(
      'CONFIG',
      ConfigErrorCode.DBNAME_ALREADY_EXISTS,
      { confname, dbname, ...additionalData },
      originalError
    );
  }

  /**
   * Creates an error indicating that database name does not exist in server parameter.
   */
  static DbnameNotFound(
    confname: string,
    dbname: string,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    return new ConfigError(
      'CONFIG',
      ConfigErrorCode.DBNAME_NOT_FOUND,
      { confname, dbname, ...additionalData },
      originalError
    );
  }

  /**
   * Creates an error indicating that getting all system parameters failed.
   */
  static GetAllSysParamFailed(
    confname: string,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    return new ConfigError(
      'CONFIG',
      ConfigErrorCode.GET_ALL_SYS_PARAM_FAILED,
      { confname, ...additionalData },
      originalError
    );
  }

  /**
   * Creates an error indicating that setting system parameters failed.
   */
  static SetSysParamFailed(
    confname: string,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    return new ConfigError(
      'CONFIG',
      ConfigErrorCode.SET_SYS_PARAM_FAILED,
      { confname, ...additionalData },
      originalError
    );
  }

  /**
   * Creates an error indicating that a query plan with the given query_id was not found.
   */
  static QueryPlanNotFound(
    dbname: string,
    queryId: string,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    return new ConfigError(
      'CONFIG',
      ConfigErrorCode.QUERY_PLAN_NOT_FOUND,
      { dbname, queryId, ...additionalData },
      originalError
    );
  }

  /**
   * Creates an error indicating that a query plan with the given query_id already exists.
   */
  static DuplicateQueryId(
    dbname: string,
    queryId: string,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    return new ConfigError(
      'CONFIG',
      ConfigErrorCode.DUPLICATE_QUERY_ID,
      { dbname, queryId, ...additionalData },
      originalError
    );
  }

  /**
   * Creates an error indicating that a configuration file changed on the host
   * after the editor saving it had loaded it.
   */
  static ChangedSinceLoaded(confname: string, additionalData?: Record<string, any>) {
    return new ConfigError('CONFIG', ConfigErrorCode.CHANGED_SINCE_LOADED, { confname, ...additionalData });
  }

  /**
   * Creates an error for an unknown configuration-related issue.
   */
  static Unknown(additionalData?: Record<string, any>, originalError?: Error) {
    return new ConfigError('CONFIG', ConfigErrorCode.UNKNOWN, additionalData, originalError);
  }
}
