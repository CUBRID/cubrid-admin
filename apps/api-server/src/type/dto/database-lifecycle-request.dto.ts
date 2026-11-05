import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { SetAutoAddVolDto } from './database-config-request.dto';
import {
  DB_PASSWORD_MAX_BYTES,
  DB_PAGE_SIZES,
  ExvolInfo,
  LOG_VOLUME_SIZE_MIB,
  ParamValueIssue,
  checkNumberInRange,
} from '@api-interfaces';
import { MaxUtf8Bytes } from './max-utf8-bytes.decorator';
import { PassesCheck } from './passes-check.decorator';

// createdb takes 4K-16K pages and silently turns any other size into one
// of them (util_sa.c make_valid_page_size).
const checkPageSize = (v: unknown): ParamValueIssue | null =>
  (DB_PAGE_SIZES as readonly number[]).includes(Number(v))
    ? null
    : { code: 'NOT_ONE_OF', message: `Must be one of: ${DB_PAGE_SIZES.join(', ')}`, params: { options: [...DB_PAGE_SIZES] } };

// Each extra volume is at least one page (boot_sr.c more-volume-file NPAGES).
const checkExtraVolumes = (v: unknown, o: Record<string, unknown>): ParamValueIssue | null => {
  if (v === undefined) return null;
  if (!Array.isArray(v)) return { code: 'NOT_LIST', message: 'Must be a list' };
  const minMb = Number(o.pagesize) / (1024 * 1024);
  for (const entry of v) {
    for (const info of Object.values((entry ?? {}) as Record<string, ExvolInfo>)) {
      const problem = checkNumberInRange(info?.size, Number.isFinite(minMb) && minMb > 0 ? minMb : 0);
      if (problem) return problem;
    }
  }
  return null;
};

/**
 * Validated request bodies for DatabaseLifecycleController. Kept as
 * backend-only classes (mirroring the shared @api-interfaces types) so
 * class-validator decorators don't end up bundled into the frontend's
 * copy of those types.
 *
 * @category DTOs
 * @since 1.0.0
 */
export class SaveDatabaseProfileDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  // Optional; omitted -> "" — and a DB profile's password can legitimately
  // be an empty string (see database-user-request.dto.ts).
  @IsOptional()
  @IsString()
  password?: string;
}

export class StartStopAllDatabasesDto {
  @IsArray()
  @IsString({ each: true })
  dbnames: string[];
}

export class SelectedDatabasesActionDto {
  @IsIn(['start', 'stop', 'restart'])
  action: 'start' | 'stop' | 'restart';

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  dbnames: string[];
}

export class DeleteDatabaseDto {
  @IsIn(['y', 'n'])
  delbackup: 'y' | 'n';
}

class UpdateUserOnCreateDto {
  @IsString()
  @MaxUtf8Bytes(DB_PASSWORD_MAX_BYTES)
  userpass: string;
}

export class CreateDatabaseWithConfigDto {
  @IsString()
  @IsNotEmpty()
  dbname: string;

  // string | number per CMS — @IsDefined() matches the original
  // validateRequiredFields presence-only check without picking one type.
  @IsDefined()
  numpage: string | number;

  @IsDefined()
  @PassesCheck('dbPageSize', checkPageSize)
  pagesize: string | number;

  // MiB; createdb --log-volume-size takes 20M-4G (PRM_ID_LOG_VOLUME_SIZE).
  @IsDefined()
  @PassesCheck('logVolumeSize', (v) => checkNumberInRange(v, LOG_VOLUME_SIZE_MIB.min, LOG_VOLUME_SIZE_MIB.max))
  logsize: string | number;

  @IsDefined()
  @PassesCheck('dbPageSize', checkPageSize)
  logpagesize: string | number;

  @IsString()
  @IsNotEmpty()
  genvolpath: string;

  @IsString()
  @IsNotEmpty()
  logvolpath: string;

  @IsOptional()
  @IsArray()
  @PassesCheck('extraVolumeSize', checkExtraVolumes)
  exvol?: Record<string, ExvolInfo>[];

  @IsString()
  @IsNotEmpty()
  charset: string;

  @IsIn(['YES', 'NO'])
  overwrite_config_file: 'YES' | 'NO';

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateUserOnCreateDto)
  updateUser?: UpdateUserOnCreateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SetAutoAddVolDto)
  setAutoAddVol?: SetAutoAddVolDto;

  @IsOptional()
  @IsBoolean()
  setAutoStart?: boolean;
}
