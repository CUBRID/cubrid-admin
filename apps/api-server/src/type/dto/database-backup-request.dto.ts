import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import {
  BACKUP_LEVELS,
  BACKUP_THREAD_COUNT_MIN,
  BACKUPS_TO_KEEP_MIN,
  ParamValueIssue,
  RESTORE_YEAR_MIN,
  checkHhmm,
  checkIntInRange,
  checkMonthDays,
} from '@api-interfaces';
import { PassesCheck } from './passes-check.decorator';

// restoredb --up-to-date as the dialog sends it: "dd-mm-yyyy:HH:MM:SS", or
// "backuptime" for the backup's own time. The engine takes years from 1900
// (util_sa.c).
const checkRestoreDate = (v: unknown): ParamValueIssue | null => {
  if (v === 'backuptime') return null;
  const m = typeof v === 'string' ? /^(\d{2})-(\d{2})-(\d{4}):\d{2}:\d{2}(:\d{2}){1,2}$/.exec(v) : null;
  if (!m) return { code: 'NOT_RESTORE_DATE', message: 'Must be dd-mm-yyyy:HH:MM:SS or backuptime' };
  return checkIntInRange(m[3], RESTORE_YEAR_MIN, 9999);
};

/**
 * Validated request bodies for DatabaseBackupController. Kept as
 * backend-only classes (mirroring the shared @api-interfaces types) so
 * class-validator decorators don't end up bundled into the frontend's
 * copy of those types.
 *
 * Only backupid/path/period_type/period_date/time/level were ever checked
 * by the original validateRequiredFields call, but the other fields here
 * (archivedel/updatestatus/storeold/onoff/zip/check/mt/bknum) are always
 * populated by both AddBackupPlanModal.jsx and EditBackupPlanModal.jsx (a
 * fixed ON/OFF/y/n computed from form state) — confirmed required in
 * practice, so making them required here matches real usage rather than
 * loosening validation out of undue caution. One of them (`onoff`) was
 * being sent as the typo "OF" instead of "OFF" in both modals; fixed
 * alongside adding @IsIn() here, since the strict check would otherwise
 * have broken the "offline" backup schedule option.
 *
 * @category DTOs
 * @since 1.0.0
 */
export class BackupScheduleDto {
  @IsOptional()
  @IsString()
  dbname?: string;

  @IsString()
  @IsNotEmpty()
  backupid: string;

  @IsString()
  @IsNotEmpty()
  path: string;

  @IsString()
  @IsNotEmpty()
  period_type: string;

  // Empty on purpose for period_type 'Daily' — CMS itself does no validation
  // on period_date for that type (cm_job_task.cpp's "period_date: Daily"
  // branch is a no-op), so it must stay allowed to be empty here too.
  @IsString()
  @PassesCheck('monthDays', (v, o) => (o.period_type === 'Monthly' ? checkMonthDays(v) : null))
  period_date: string;

  // "HHMM" (cm_job_task.cpp _check_backup_info).
  @IsString()
  @PassesCheck('backupTime', checkHhmm)
  time: string;

  @IsIn([...BACKUP_LEVELS])
  level: string;

  @IsIn(['ON', 'OFF'])
  archivedel: 'ON' | 'OFF';

  @IsIn(['ON', 'OFF'])
  updatestatus: 'ON' | 'OFF';

  @IsIn(['ON', 'OFF'])
  storeold: 'ON' | 'OFF';

  @IsIn(['ON', 'OFF'])
  onoff: 'ON' | 'OFF';

  @IsIn(['y', 'n'])
  zip: 'y' | 'n';

  @IsIn(['y', 'n'])
  check: 'y' | 'n';

  // 0 = as many threads as the CPUs (backupdb --thread-count).
  @IsString()
  @PassesCheck('backupThreadCount', (v) => checkIntInRange(v, BACKUP_THREAD_COUNT_MIN))
  mt: string;

  // Older backups of the level kept before each run; 0 would delete them all.
  @IsString()
  @PassesCheck('backupsToKeep', (v) => checkIntInRange(v, BACKUPS_TO_KEEP_MIN))
  bknum: string;
}

export class DeleteBackupScheduleDto {
  @IsString()
  @IsNotEmpty()
  backupid: string;
}

export class BackupDbDto {
  @IsIn(['0', '1', '2'])
  level: '0' | '1' | '2';

  @IsString()
  @IsNotEmpty()
  backupdir: string;

  @IsOptional()
  @IsIn(['y', 'n'])
  removelog?: 'y' | 'n';

  @IsOptional()
  @IsIn(['y', 'n'])
  check?: 'y' | 'n';

  // '' leaves --thread-count off (CMS reads an empty value as absent).
  @ValidateIf((o) => o.mt !== undefined && o.mt !== '')
  @PassesCheck('backupThreadCount', (v) => checkIntInRange(v, BACKUP_THREAD_COUNT_MIN))
  mt?: string;

  @IsOptional()
  @IsIn(['y', 'n'])
  zip?: 'y' | 'n';

  @IsOptional()
  @IsIn(['y', 'n'])
  safereplication?: 'y' | 'n';
}

export class RestoreDbDto {
  @IsString()
  @PassesCheck('restoreDate', checkRestoreDate)
  date: string;

  // restoredb --level, 0-2 (util_cs.c backupdb levels).
  @IsIn([...BACKUP_LEVELS])
  level: string;

  @IsString()
  @IsNotEmpty()
  partial: string;

  @IsString()
  @IsNotEmpty()
  pathname: string;

  @IsString()
  @IsNotEmpty()
  recoverypath: string;
}
