import { AuthErrorCode } from '@error/auth/auth-error-code';
import { BrokerErrorCode } from '@error/broker/broker-error-code';
import { CmsErrorCode } from '@error/cms/cms-error-code';
import { ConfigErrorCode } from '@error/config/config-error-code';
import { DatabaseErrorCode } from '@error/database/database-error-code';
import type { ErrorKind } from '@error/error-kind';
import { HostErrorCode } from '@error/host/host-error-code';
import { LockErrorCode } from '@error/lock/lock-error-code';
import { ResourceMonitoringErrorCode } from '@error/monitoring/resource-monitoring-error-code';
import { StorageErrorCode } from '@error/storage/storage-error-code';
import { UserErrorCode } from '@error/user/user-error-code';
import { ValidationErrorCode } from '@error/validation/validation-error-code';

export type PublicErrorPayload = {
  kind: ErrorKind;
  code: string;
  additionalData?: Record<string, any>;
};

const GENERIC_INTERNAL = 'An internal server error occurred.';
const GENERIC_CMS_FAILURE = 'The CMS request failed.';

function isMeaningfulCmsNote(note: unknown): boolean {
  if (note === undefined || note === null) return false;
  const s = String(note).trim();
  if (!s) return false;
  if (s.toLowerCase() === 'none') return false;
  return true;
}

function stripCmsArtifacts(s: string): string {
  return s.replace(/<end>\s*$/i, '').trim();
}

/**
 * Collect candidate user-facing strings for CMS failures in priority order.
 * - `checkCmsStatusError` path: full `response` object + `response.note`
 * - Axios HTTP error path (`HandleCmsErrors`): CMS JSON body in `data` (`data.note`)
 * - Service-thrown errors: only `message` may exist
 */
function cmsNoteFromPayload(additionalData?: Record<string, any>): string | undefined {
  if (!additionalData) {
    return undefined;
  }

  const candidates: unknown[] = [
    additionalData.response?.note,
    additionalData.cmsResponse?.note,
    typeof additionalData.data === 'object' && additionalData.data !== null
      ? (additionalData.data as { note?: unknown }).note
      : undefined,
    additionalData.note,
  ];

  for (const c of candidates) {
    if (isMeaningfulCmsNote(c)) {
      return stripCmsArtifacts(String(c));
    }
  }

  const rawMsg = additionalData.message;
  if (typeof rawMsg === 'string' && rawMsg.trim() !== '') {
    return stripCmsArtifacts(rawMsg);
  }

  return undefined;
}

/**
 * Safe user-facing API error strings.
 * - CMS: prefer CMS response `note` when meaningful
 * - Otherwise: fixed copy per kind/code (no raw OS/lock messages)
 */
export function getPublicClientErrorMessage(payload: PublicErrorPayload): string {
  const { kind, code, additionalData } = payload;

  if (kind === 'CMS') {
    const resolved = cmsNoteFromPayload(additionalData);
    if (resolved) {
      return resolved;
    }
    switch (code as CmsErrorCode) {
      case CmsErrorCode.INVALID_TOKEN:
        return 'Request is rejected due to invalid token. Please reconnect.';
      case CmsErrorCode.NO_RESPONSE:
        return 'No response was received from CMS.';
      case CmsErrorCode.TLS_ERROR: {
        const detail = typeof additionalData?.message === 'string' ? additionalData.message : undefined;
        return detail
          ? `Could not establish a trusted connection to CMS: ${detail}. Check the CMS server's TLS certificate, or set CMS_REJECT_UNAUTHORIZED=false in cwm.conf to bypass verification.`
          : "Could not establish a trusted connection to CMS. Check the CMS server's TLS certificate.";
      }
      case CmsErrorCode.REQUEST_FAILED:
      case CmsErrorCode.UNKNOWN:
      default:
        return GENERIC_CMS_FAILURE;
    }
  }

  if (kind === 'VALIDATION') {
    const msg = additionalData?.message;
    if (typeof msg === 'string' && msg.trim() !== '') {
      return msg.trim();
    }
    switch (code as ValidationErrorCode) {
      case ValidationErrorCode.INVALID_REQUEST_BODY:
        return 'The request body is invalid.';
      case ValidationErrorCode.MISSING_REQUIRED_FIELD:
        return 'Required field(s) are missing.';
      case ValidationErrorCode.MISSING_DB_CREDENTIALS:
        return 'Database credentials are required.';
      case ValidationErrorCode.INVALID_FIELD_FORMAT:
        return 'The field format is invalid.';
      case ValidationErrorCode.UNKNOWN:
      default:
        return 'Please check your input.';
    }
  }

  if (kind === 'AUTH') {
    switch (code as AuthErrorCode) {
      case AuthErrorCode.INVALID_CREDENTIALS:
        return 'Invalid credentials.';
      case AuthErrorCode.INVALID_TOKEN:
        return 'The authentication token is invalid.';
      case AuthErrorCode.PERMISSION_DENIED:
        return 'You do not have permission to perform this action.';
      case AuthErrorCode.INTERNAL_ERROR:
      case AuthErrorCode.UNKNOWN:
      default:
        return GENERIC_INTERNAL;
    }
  }

  if (kind === 'INTERNAL') {
    return GENERIC_INTERNAL;
  }

  if (kind === 'USER') {
    switch (code as UserErrorCode) {
      case UserErrorCode.USER_NOT_FOUND:
        return 'User not found.';
      case UserErrorCode.USER_ALREADY_EXISTS:
        return 'User already exists.';
      case UserErrorCode.DATA_SAVE_FAILED:
      case UserErrorCode.DATA_LOAD_FAILED:
      case UserErrorCode.DATA_DELETE_FAILED:
      case UserErrorCode.DATA_UPDATE_FAILED:
        return 'Failed to process user data.';
      case UserErrorCode.RESOURCE_LOCKED:
        return 'The resource is locked and cannot be modified.';
      case UserErrorCode.LOCK_OPERATION_FAILED:
        return 'A lock operation failed.';
      case UserErrorCode.OLD_PASSWORD_MISMATCH:
        return 'The current password does not match.';
      case UserErrorCode.BAD_NEW_PASSWORD:
        return 'The new password does not meet the policy.';
      case UserErrorCode.UNKNOWN:
      default:
        return GENERIC_INTERNAL;
    }
  }

  if (kind === 'RESOURCE') {
    switch (code) {
      case HostErrorCode.NO_SUCH_HOST:
        return 'Host not found.';
      case HostErrorCode.EXCEED_MAX_HOSTS:
        return 'The maximum number of hosts has been reached.';
      case HostErrorCode.INVALID_FORMAT:
        return 'Invalid host information format.';
      case HostErrorCode.DUPLICATED_HOST:
        return 'This host is already registered.';
      case HostErrorCode.DUPLICATED_ALIAS:
        return 'This name is already used by another host. Choose a different name.';
      case HostErrorCode.INTERNAL_ERROR:
      case HostErrorCode.UNKNOWN:
        return 'A host operation failed.';
      case 'USER_NOT_FOUND':
        return 'User not found in storage.';
      case 'USER_ALREADY_EXISTS':
        return 'User already exists.';
      case ResourceMonitoringErrorCode.CMS_API_FAILURE:
        return 'Failed to call CMS for resource monitoring.';
      case ResourceMonitoringErrorCode.HOST_NOT_FOUND:
        return 'Monitoring target host not found.';
      case ResourceMonitoringErrorCode.UNKNOWN:
        return 'Resource monitoring failed.';
      default:
        return 'A resource operation failed.';
    }
  }

  if (kind === 'DATABASE') {
    if (code === (DatabaseErrorCode.INVALID_PARAMETER as string) && additionalData?.message) {
      return String(additionalData.message);
    }
    switch (code as DatabaseErrorCode) {
      case DatabaseErrorCode.NO_SUCH_DATABASE:
        return 'Database not found.';
      case DatabaseErrorCode.DUPLICATED_DATABASE_PROFILE:
        return 'A database profile for this entry already exists.';
      case DatabaseErrorCode.GET_START_INFO_FAILED:
        return 'Failed to retrieve database list information.';
      case DatabaseErrorCode.START_DATABASE_FAILED:
        return 'Failed to start the database.';
      case DatabaseErrorCode.STOP_DATABASE_FAILED:
        return 'Failed to stop the database.';
      case DatabaseErrorCode.RESTART_DATABASE_FAILED:
        return 'Failed to restart the database.';
      case DatabaseErrorCode.LOGIN_DATABASE_FAILED:
        return 'Database login failed.';
      case DatabaseErrorCode.GET_USER_INFO_FAILED:
        return 'Failed to retrieve database user information.';
      case DatabaseErrorCode.CREATE_USER_FAILED:
        return 'Failed to create the database user.';
      case DatabaseErrorCode.DELETE_USER_FAILED:
        return 'Failed to delete the database user.';
      case DatabaseErrorCode.USER_VERIFY_FAILED:
        return 'Database user verification failed.';
      case DatabaseErrorCode.GET_DB_SPACE_INFO_FAILED:
        return 'Failed to retrieve database space information.';
      case DatabaseErrorCode.GET_DBSIZE_FAILED:
        return 'Failed to retrieve database size.';
      case DatabaseErrorCode.COPY_DB_FAILED:
        return 'Failed to copy the database.';
      case DatabaseErrorCode.INVALID_VOLUME_STRING:
      case DatabaseErrorCode.INVALID_VOLUME_FORMAT:
      case DatabaseErrorCode.INVALID_VOLUME_INFO:
      case DatabaseErrorCode.INVALID_VOLUME_SIZE:
      case DatabaseErrorCode.PARSE_VOLUME_FAILED:
      case DatabaseErrorCode.CONVERT_VOLUME_FAILED:
        return 'Invalid volume information.';
      case DatabaseErrorCode.DUPLICATED_FILE:
        return 'File already exists.';
      case DatabaseErrorCode.OPERATION_IN_PROGRESS: {
        const dbname = additionalData?.dbname;
        return dbname
          ? `A background job is already running on "${dbname}". Try again once it finishes.`
          : 'A background job is already running on this host. Try again once it finishes.';
      }
      case DatabaseErrorCode.LOAD_NOT_SUPPORTED_FOR_HA_DATABASE: {
        const dbname = additionalData?.dbname;
        return dbname
          ? `"${dbname}" is an HA database — Load Database always runs offline and its changes will not replicate to the HA peer, so it is not supported here.`
          : 'Load Database is not supported for HA databases — its changes would not replicate to the HA peer.';
      }
      case DatabaseErrorCode.RENAME_NOT_SUPPORTED_FOR_HA_DATABASE: {
        const dbname = additionalData?.dbname;
        return dbname
          ? `"${dbname}" is an HA database — renaming it would break HA pairing with its peer, so it is not supported here.`
          : 'Rename Database is not supported for HA databases — it would break HA pairing with the peer.';
      }
      case DatabaseErrorCode.RESTORE_NOT_SUPPORTED_FOR_HA_DATABASE: {
        const dbname = additionalData?.dbname;
        return dbname
          ? `"${dbname}" is an HA database — Restore Database would desync its replication apply position from the HA peer, so it is not supported here.`
          : 'Restore Database is not supported for HA databases — it would desync replication with the HA peer.';
      }
      case DatabaseErrorCode.INTERNAL_ERROR:
      case DatabaseErrorCode.UNKNOWN:
      default:
        return 'A database operation failed.';
    }
  }

  if (kind === 'CONFIG') {
    switch (code as ConfigErrorCode) {
      case ConfigErrorCode.SERVER_PARAM_NOT_FOUND:
        return 'Server parameter not found.';
      case ConfigErrorCode.NO_CONFLIST_DATA:
      case ConfigErrorCode.NO_CONFDATA:
        return 'Configuration data not found.';
      case ConfigErrorCode.DBNAME_ALREADY_EXISTS:
        return 'Database name already exists.';
      case ConfigErrorCode.DBNAME_NOT_FOUND:
        return 'Database name not found.';
      case ConfigErrorCode.GET_ALL_SYS_PARAM_FAILED:
        return 'Failed to retrieve system parameters.';
      case ConfigErrorCode.SET_SYS_PARAM_FAILED:
        return 'Failed to set system parameters.';
      case ConfigErrorCode.UNKNOWN:
      default:
        return 'A configuration operation failed.';
    }
  }

  if (kind === 'BROKER') {
    switch (code as BrokerErrorCode) {
      case BrokerErrorCode.GET_BROKER_FAILED:
        return 'Failed to retrieve broker information.';
      case BrokerErrorCode.BROKER_STOP_FAILED:
        return 'Failed to stop the broker.';
      case BrokerErrorCode.BROKER_START_FAILED:
        return 'Failed to start the broker.';
      case BrokerErrorCode.ADD_DBMT_USER_FAILED:
        return 'Failed to add the broker (DBMT) user.';
      case BrokerErrorCode.UPDATE_DBMT_USER_FAILED:
        return 'Failed to update the broker (DBMT) user.';
      case BrokerErrorCode.INTERNAL_ERROR:
      case BrokerErrorCode.UNKNOWN:
      default:
        return 'A broker operation failed.';
    }
  }

  if (kind === 'LOCK') {
    switch (code as LockErrorCode) {
      case LockErrorCode.LOCK_NOT_FOUND:
        return 'Lock not found.';
      case LockErrorCode.PERMISSION_DENIED:
        return 'Permission denied for the lock operation.';
      case LockErrorCode.LOCK_ALREADY_HELD:
        return 'The resource is already locked by another operation.';
      case LockErrorCode.STALE_LOCK:
        return 'The lock has expired. Please try again.';
      case LockErrorCode.UNKNOWN:
      default:
        return 'A file lock operation failed.';
    }
  }

  if (kind === 'STORAGE') {
    switch (code as StorageErrorCode) {
      case StorageErrorCode.NO_SUCH_FILE:
      case StorageErrorCode.FILE_NOT_FOUND:
        return 'File not found.';
      case StorageErrorCode.FILE_ALREADY_EXISTS:
        return 'File already exists.';
      case StorageErrorCode.PERMISSION_DENIED:
        return 'File access denied.';
      case StorageErrorCode.UNKNOWN:
      default:
        return 'A storage operation failed.';
    }
  }

  return GENERIC_INTERNAL;
}
