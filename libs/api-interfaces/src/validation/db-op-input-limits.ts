import type { ParamValueIssue } from '../param-schema/validate-param-value';

// Ranges of the numbers the database operation dialogs send, as the engine
// or CMS accepts them (sources by line below; engine: CUBRID develop, CMS:
// cubridmanager feature/webmanager). The dialogs and the server DTOs both
// check with these, so a request that skips the dialog is refused too. A
// value with no upper limit in the engine gets the int32 limit of its parser
// (util_support.c parse_int).

export const INT32_MAX = 2_147_483_647;

/** unloaddb --cached-pages: 0 or less is refused (unload_object.c:761-766). */
export const UNLOAD_CACHED_PAGES_MIN = 1;
/** unloaddb --estimated-size: 0 means computed by the engine (unload_object.c:1134-1136). */
export const UNLOAD_ESTIMATED_SIZE_MIN = 0;
/** createdb --db-page-size / --log-page-size: 4K to 16K (storage_common.h:91-93). */
export const DB_PAGE_SIZES = [4096, 8192, 16384] as const;
/** createdb --log-volume-size: 20M to 4G (system_parameter.c, PRM_ID_LOG_VOLUME_SIZE). */
export const LOG_VOLUME_SIZE_MIB = { min: 20, max: 4096 } as const;
/** createdb more-volume-file NPAGES: 0 or less is refused (boot_sr.c:847-855). */
export const EXTRA_VOLUME_PAGES_MIN = 1;
/** Auto add volume warn ratio: CMS turns above 0.5 into 0.5 (cm_autojob.cpp:605-611). */
export const AUTO_ADD_WARN_RATIO = { min: 0, max: 0.5 } as const;
/**
 * Auto add volume pages: CMS adds nothing for 0 or less and rounds 1-999 up
 * to 1000 (cm_cmd_exec.cpp:1491-1508, cm_autojob.h:32).
 */
export const AUTO_ADD_PAGES_MIN = 1000;
/** backupdb --thread-count: 0 means as many as the CPUs, negative is refused (util_cs.c:208-211). */
export const BACKUP_THREAD_COUNT_MIN = 0;
/**
 * Backup plan's backups to keep (bknum): before each run CMS deletes the
 * plan's older backups of that level down to this many, so 0 deletes all of
 * them (cm_server_util.cpp remove_extra_subdir, cm_autojob.cpp:1594). CMS's
 * own default is 1 (cm_autojob.cpp:969).
 */
export const BACKUPS_TO_KEEP_MIN = 1;
/** backupdb / restoredb --level (util_cs.c:197-200). */
export const BACKUP_LEVELS = ['0', '1', '2'] as const;
/** restoredb --up-to-date: years from 1900 (util_sa.c:852-905). */
export const RESTORE_YEAR_MIN = 1900;

const issue = (code: string, message: string, params?: Record<string, unknown>): ParamValueIssue =>
  params ? { code, message, params } : { code, message };

/** A whole number from `min` to `max`, as a decimal string or a number. */
export function checkIntInRange(value: unknown, min: number, max: number = INT32_MAX): ParamValueIssue | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^-?[0-9]+$/.test(text)) return issue('NOT_INTEGER', 'Must be an integer');
  const n = Number(text);
  if (n < min) return issue('MIN', `Must be ≥ ${min}`, { min });
  if (n > max) return issue('MAX', `Must be ≤ ${max}`, { max });
  return null;
}

/** A number (decimals allowed) from `min` to `max`. */
export function checkNumberInRange(value: unknown, min: number, max: number = INT32_MAX): ParamValueIssue | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)$/.test(text)) return issue('NOT_NUMBER', 'Must be a number');
  const n = Number(text);
  if (n < min) return issue('MIN', `Must be ≥ ${min}`, { min });
  if (n > max) return issue('MAX', `Must be ≤ ${max}`, { max });
  return null;
}

/** A number greater than 0 (decimals allowed), up to `max`. */
export function checkPositiveNumber(value: unknown, max: number = INT32_MAX): ParamValueIssue | null {
  const problem = checkNumberInRange(value, 0, max);
  if (problem) return problem;
  return Number(String(value).trim()) > 0 ? null : issue('POSITIVE', 'Must be greater than 0');
}

/** "HHMM", 00-23 and 00-59, as CMS stores a backup plan's time (cm_job_task.cpp:6766-6810). */
export function checkHhmm(value: unknown): ParamValueIssue | null {
  const m = typeof value === 'string' ? /^([0-9]{2})([0-9]{2})$/.exec(value) : null;
  return m && Number(m[1]) <= 23 && Number(m[2]) <= 59 ? null : issue('NOT_HHMM', 'Must be a time as HHMM (0000-2359)');
}

/** Days of the month, comma-separated, each 1-31, at least one (cm_job_task.cpp:6686-6698). */
export function checkMonthDays(value: unknown): ParamValueIssue | null {
  const parts = typeof value === 'string' && value !== '' ? value.split(',') : [];
  if (parts.length === 0) return issue('NO_DAY', 'Choose at least one day');
  return parts.every((p) => checkIntInRange(p, 1, 31) === null)
    ? null
    : issue('NOT_MONTH_DAY', 'Days must be 1-31');
}

/**
 * A new database's name (createdb, and the new name of copydb and renamedb):
 * a letter, then letters, digits, '_' or '-', at most 17 characters, the
 * rule the rename dialog already had (#122, as the CA desktop app).
 * The engine's own limits are within it: createdb aborts with a FATAL error
 * from 18 characters on, since the log prefix must be shorter than
 * MAXLOGNAME 18 (log_storage.hpp, log_page_buffer.c logpb_verify_length),
 * and it refuses a name starting with '#' or with a space, '/', '\', '@' or
 * a non-printable character (util_common.c check_database_name_local).
 */
export const DB_NAME_MAX_LENGTH = 17;

export function checkNewDbName(value: unknown): ParamValueIssue | null {
  const name = typeof value === 'string' ? value : '';
  if (name === '') return issue('DB_NAME_EMPTY', 'Enter a database name');
  if (name.length > DB_NAME_MAX_LENGTH) {
    return issue('DB_NAME_TOO_LONG', `At most ${DB_NAME_MAX_LENGTH} characters`, { max: DB_NAME_MAX_LENGTH });
  }
  if (!/^[A-Za-z]/.test(name)) return issue('DB_NAME_START', 'Must start with a letter');
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return issue('DB_NAME_CHARS', 'Use only letters, digits, _ and -');
  return null;
}
