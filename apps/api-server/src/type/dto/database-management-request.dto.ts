import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateBy,
} from 'class-validator';
import {
  RenameInfo,
  isValidLoadCountOption,
  LOAD_COUNT_MIN,
  LOAD_COUNT_MAX,
  checkIntInRange,
  checkPositiveNumber,
  UNLOAD_CACHED_PAGES_MIN,
  UNLOAD_ESTIMATED_SIZE_MIN,
  checkNewDbName,
} from '@api-interfaces';
import { PassesCheck } from './passes-check.decorator';

function IsLoadCountOption() {
  return ValidateBy({
    name: 'isLoadCountOption',
    validator: {
      validate: isValidLoadCountOption,
      defaultMessage: ({ property }) => `${property} must be "none" or a decimal whole number between ${LOAD_COUNT_MIN} and ${LOAD_COUNT_MAX}.`,
    },
  });
}

/**
 * Validated request bodies for DatabaseManagementController. Kept as
 * backend-only classes (mirroring the shared @api-interfaces types) so
 * class-validator decorators don't end up bundled into the frontend's
 * copy of those types.
 *
 * Password-like fields (dbpasswd, _DBPASSWD) and volname are validated as
 * @IsString() only, never @IsNotEmpty() — all three are explicitly
 * documented in their source interfaces as allowed to be empty.
 *
 * @category DTOs
 * @since 1.0.0
 */
export class CopyDbDto {
  @IsString()
  @IsNotEmpty()
  srcdbname: string;

  @IsString()
  @IsNotEmpty()
  @PassesCheck('newDbName', checkNewDbName)
  destdbname: string;

  @IsString()
  @IsNotEmpty()
  destdbpath: string;

  @IsString()
  @IsNotEmpty()
  exvolpath: string;

  @IsString()
  @IsNotEmpty()
  logpath: string;

  @IsString()
  @IsNotEmpty()
  overwrite: string;

  @IsString()
  @IsNotEmpty()
  move: string;

  @IsString()
  @IsNotEmpty()
  advanced: string;

  // Contents and conditional requirement are checked by the management
  // service, including calls through the asynchronous job executor.
  @IsOptional()
  @IsArray()
  volume?: Record<string, string>[];
}

export class UnloadDatabaseDto {
  @IsString()
  @IsNotEmpty()
  targetdir: string;

  @IsBoolean()
  isSchemaIncluded: boolean;

  @IsBoolean()
  isDataIncluded: boolean;

  @IsString()
  @IsNotEmpty()
  dbuser: string;

  @IsString()
  dbpasswd: string;

  @IsOptional()
  @IsIn(['yes', 'no'])
  usehash?: 'yes' | 'no';

  @IsOptional()
  @IsString()
  hashdir?: string;

  @IsOptional()
  @IsArray()
  class?: Array<{ classname: string }>;

  @IsOptional()
  @IsIn(['yes', 'no'])
  ref?: 'yes' | 'no';

  @IsOptional()
  @IsIn(['yes', 'no'])
  classonly?: 'yes' | 'no';

  @IsOptional()
  @IsIn(['yes', 'no'])
  'as-dba'?: 'yes' | 'no';

  @IsOptional()
  @IsIn(['yes', 'no'])
  'skip-index-detail'?: 'yes' | 'no';

  @IsOptional()
  @IsIn(['yes', 'no'])
  'split-schema-files'?: 'yes' | 'no';

  @IsOptional()
  @IsIn(['yes', 'no'])
  delimit?: 'yes' | 'no';

  // '' leaves the option off (CMS reads an empty value as absent).
  @ValidateIf((o) => o.estimate !== undefined && o.estimate !== '')
  @PassesCheck('unloadEstimatedSize', (v) => checkIntInRange(v, UNLOAD_ESTIMATED_SIZE_MIN))
  estimate?: string;

  @IsOptional()
  @IsString()
  prefix?: string;

  @ValidateIf((o) => o.cach !== undefined && o.cach !== '')
  @PassesCheck('unloadCachedPages', (v) => checkIntInRange(v, UNLOAD_CACHED_PAGES_MIN))
  cach?: string;
}

export class LoadDatabaseDto {
  @IsString()
  @IsNotEmpty()
  checkoption: string;

  @IsString()
  @IsNotEmpty()
  @IsLoadCountOption()
  period: string;

  @IsString()
  @IsNotEmpty()
  _DBID: string;

  @IsString()
  _DBPASSWD: string;

  @IsString()
  @IsNotEmpty()
  @IsLoadCountOption()
  estimated: string;

  @IsIn(['yes', 'no'])
  oiduse: 'yes' | 'no';

  @IsIn(['yes', 'no'])
  statisticsuse: 'yes' | 'no';

  @IsIn(['yes', 'no'])
  nolog: 'yes' | 'no';

  @IsString()
  @IsNotEmpty()
  schema: string;

  @IsString()
  @IsNotEmpty()
  object: string;

  @IsString()
  @IsNotEmpty()
  index: string;

  @IsString()
  @IsNotEmpty()
  errorcontrolfile: string;

  @IsString()
  @IsNotEmpty()
  ignoreclassfile: string;
}

export class OptimizeDatabaseDto {
  @IsOptional()
  @IsString()
  classname?: string;

  @IsOptional()
  @IsString()
  dbuser?: string;

  @IsOptional()
  @IsString()
  dbpasswd?: string;
}

export class CheckDatabaseDto {
  @IsIn(['y', 'n'])
  repairdb: 'y' | 'n';

  @IsOptional()
  @IsString()
  dbuser?: string;

  @IsOptional()
  @IsString()
  dbpasswd?: string;
}

export class CompactDatabaseDto {
  @IsIn(['y', 'n'])
  verbose: 'y' | 'n';

  @IsOptional()
  @IsString()
  dbuser?: string;

  @IsOptional()
  @IsString()
  dbpasswd?: string;
}

export class RenameDatabaseDto {
  @IsString()
  @IsNotEmpty()
  @PassesCheck('newDbName', checkNewDbName)
  rename: string;

  @IsString()
  @IsNotEmpty()
  exvolpath: string;

  @IsIn(['on', 'off'])
  advanced: 'on' | 'off';

  // Required (and non-empty) only when advanced is 'on' — matches the
  // controller's pre-existing manual check exactly.
  @ValidateIf((o) => o.advanced === 'on')
  @IsArray()
  @ArrayNotEmpty()
  volume?: RenameInfo[];

  @IsIn(['y', 'n'])
  forcedel: 'y' | 'n';
}

export class AddVolDbDto {
  @IsString()
  volname: string;

  @IsString()
  @IsNotEmpty()
  purpose: string;

  @IsString()
  @IsNotEmpty()
  path: string;

  @IsString()
  @IsNotEmpty()
  numberofpages: string;

  // "<MiB>(MB)"; addvoldb refuses 0 or less (util_cs.c addvoldb).
  @IsString()
  @IsNotEmpty()
  @PassesCheck('addVolumeSize', (v) => checkPositiveNumber(typeof v === 'string' ? v.replace(/\(MB\)$/, '') : v))
  size_need_mb: string;
}

export class GetTransactionInfoDto {
  @IsString()
  @IsNotEmpty()
  dbuser: string;

  @IsString()
  dbpasswd: string;
}

export class KillTransactionDto {
  @IsIn(['d', 'i', 'p', 'h'])
  type: 'd' | 'i' | 'p' | 'h';

  // Required only when type !== 'd' — matches the controller's pre-existing
  // manual check exactly.
  @ValidateIf((o) => o.type !== 'd')
  @IsString()
  @IsNotEmpty()
  parameter?: string;

  @IsOptional()
  @IsString()
  dbpasswd?: string;
}
