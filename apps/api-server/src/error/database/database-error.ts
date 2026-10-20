import { AppError } from '@error/app-error';
import { DatabaseErrorCode } from './database-error-code';

/**
 * Error class for database-related operations.
 *
 * @category Errors
 * @since 1.0.0
 */
export class DatabaseError extends AppError {
  constructor(
    kind: 'DATABASE',
    code: DatabaseErrorCode,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    super(kind, code, additionalData, originalError);
  }

  /**
   * Creates an error indicating that the specified database does not exist.
   */
  static NoSuchDatabase(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.NO_SUCH_DATABASE,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating that getting start info failed.
   */
  static GetStartInfoFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.GET_START_INFO_FAILED,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating that starting database failed.
   */
  static StartDatabaseFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.START_DATABASE_FAILED,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating that stopping database failed.
   */
  static StopDatabaseFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.STOP_DATABASE_FAILED,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating that restarting database failed.
   */
  static RestartDatabaseFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.RESTART_DATABASE_FAILED,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating that database login failed.
   */
  static LoginDatabaseFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.LOGIN_DATABASE_FAILED,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating that getting user info failed.
   */
  static GetUserInfoFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.GET_USER_INFO_FAILED,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating that creating database user failed.
   */
  static CreateUserFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.CREATE_USER_FAILED,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating that deleting database user failed.
   */
  static DeleteUserFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.DELETE_USER_FAILED,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating that user verify failed.
   */
  static UserVerifyFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.USER_VERIFY_FAILED,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating that getting database space info failed.
   */
  static GetDBSpaceInfoFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.GET_DB_SPACE_INFO_FAILED,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating an internal database-related server error.
   */
  static InternalError(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.INTERNAL_ERROR,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating a duplicated database profile.
   */
  static DuplicatedDatabaseProfile(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.DUPLICATED_DATABASE_PROFILE,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating an invalid volume string.
   */
  static InvalidVolumeString(
    message: string,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.INVALID_VOLUME_STRING,
      { message, ...additionalData },
      originalError
    );
  }

  /**
   * Creates an error indicating an invalid volume format.
   */
  static InvalidVolumeFormat(
    expectedFormat: string,
    receivedValue: any,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.INVALID_VOLUME_FORMAT,
      { expectedFormat, receivedValue, ...additionalData },
      originalError
    );
  }

  /**
   * Creates an error indicating invalid volume information.
   */
  static InvalidVolumeInfo(
    message: string,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.INVALID_VOLUME_INFO,
      { message, ...additionalData },
      originalError
    );
  }

  /**
   * Creates an error indicating invalid volume size.
   */
  static InvalidVolumeSize(
    message: string,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.INVALID_VOLUME_SIZE,
      { message, ...additionalData },
      originalError
    );
  }

  /**
   * Creates an error indicating that parsing a volume failed.
   */
  static ParseVolumeFailed(
    volumeName: string,
    originalError?: Error,
    additionalData?: Record<string, any>
  ) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.PARSE_VOLUME_FAILED,
      { volumeName, ...additionalData },
      originalError
    );
  }

  /**
   * Creates an error indicating that converting a volume failed.
   */
  static ConvertVolumeFailed(
    volumeName: string,
    originalError?: Error,
    additionalData?: Record<string, any>
  ) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.CONVERT_VOLUME_FAILED,
      { volumeName, ...additionalData },
      originalError
    );
  }

  static DuplicatedFile(
    volumeName: string,
    originalError?: Error,
    additionalData?: Record<string, any>
  ) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.DUPLICATED_FILE,
      {
        volumeName,
        ...additionalData,
      },
      originalError
    );
  }

  /**
   * Creates an error indicating that getdbsize failed.
   */
  static GetDbSizeFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.GET_DBSIZE_FAILED,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error indicating that copydb failed.
   */
  static CopyDbFailed(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.COPY_DB_FAILED,
      additionalData,
      originalError
    );
  }

  /**
   * Creates an error for an unknown database-related issue.
   */
  static Unknown(additionalData?: Record<string, any>, originalError?: Error) {
    return new DatabaseError('DATABASE', DatabaseErrorCode.UNKNOWN, additionalData, originalError);
  }

  /**
   * Creates an error indicating invalid parameter.
   */
  static InvalidParameter(
    message: string,
    additionalData?: Record<string, any>,
    originalError?: Error
  ) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.INVALID_PARAMETER,
      { message, ...additionalData },
      originalError
    );
  }

  /** Another long-running CMS job is already active for this host/database. */
  static OperationInProgress(additionalData?: Record<string, any>) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.OPERATION_IN_PROGRESS,
      additionalData
    );
  }

  /**
   * loaddb always runs through CMS in SA mode, which internally resets
   * ha_mode to off for the process — so nothing it writes ever replicates to
   * an HA peer, even against a database that's genuinely HA-enabled. Block
   * it outright rather than silently desyncing master/slave.
   */
  static LoadNotSupportedForHaDatabase(additionalData?: Record<string, any>) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.LOAD_NOT_SUPPORTED_FOR_HA_DATABASE,
      additionalData
    );
  }

  /**
   * renamedb has no HA awareness at all — it only renames the local
   * databases.txt entry + volume files. Afterward cubrid_ha.conf's
   * ha_db_list (and the peer, whose database keeps the old name) no longer
   * match the renamed local name, breaking HA pairing rather than any
   * single operation failing cleanly.
   */
  static RenameNotSupportedForHaDatabase(additionalData?: Record<string, any>) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.RENAME_NOT_SUPPORTED_FOR_HA_DATABASE,
      additionalData
    );
  }

  /**
   * restoredb never updates ha_apply_info (the slave's replication
   * apply-position bookmark) — CUBRID's dedicated `restoreslave` utility
   * resets it to the restored LSA specifically because plain restoredb
   * leaves it stale, desyncing the HA peer.
   */
  static RestoreNotSupportedForHaDatabase(additionalData?: Record<string, any>) {
    return new DatabaseError(
      'DATABASE',
      DatabaseErrorCode.RESTORE_NOT_SUPPORTED_FOR_HA_DATABASE,
      additionalData
    );
  }
}
