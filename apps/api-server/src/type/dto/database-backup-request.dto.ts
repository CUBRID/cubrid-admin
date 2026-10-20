import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
  period_date: string;

  @IsString()
  @IsNotEmpty()
  time: string;

  @IsString()
  @IsNotEmpty()
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

  @IsString()
  @IsNotEmpty()
  mt: string;

  @IsString()
  @IsNotEmpty()
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

  @IsOptional()
  @IsString()
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
  @IsNotEmpty()
  date: string;

  // '0'|'1'|'2'|string in the shared type — the `| string` fallback means
  // it isn't a genuine exhaustive enum, so @IsString() only (not @IsIn()).
  @IsString()
  @IsNotEmpty()
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
