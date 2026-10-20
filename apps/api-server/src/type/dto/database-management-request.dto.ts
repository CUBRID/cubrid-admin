import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { RenameInfo } from '@api-interfaces';

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

  // Unlike RenameDatabaseDto, copyDb never enforced "volume required when
  // advanced is on" — matching that as-is rather than introducing a new
  // rule that wasn't there before.
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

  @IsOptional()
  @IsString()
  estimate?: string;

  @IsOptional()
  @IsString()
  prefix?: string;

  @IsOptional()
  @IsString()
  cach?: string;

  @IsOptional()
  @IsString()
  lofile?: string;
}

export class LoadDatabaseDto {
  @IsString()
  @IsNotEmpty()
  checkoption: string;

  @IsString()
  @IsNotEmpty()
  period: string;

  @IsString()
  @IsNotEmpty()
  _DBID: string;

  @IsString()
  _DBPASSWD: string;

  @IsString()
  @IsNotEmpty()
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

  @IsString()
  @IsNotEmpty()
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
