import { Type } from 'class-transformer';
import {
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
import { ExvolInfo } from '@api-interfaces';

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

export class DeleteDatabaseDto {
  @IsIn(['y', 'n'])
  delbackup: 'y' | 'n';
}

class UpdateUserOnCreateDto {
  @IsString()
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
  pagesize: string | number;

  @IsDefined()
  logsize: string | number;

  @IsDefined()
  logpagesize: string | number;

  @IsString()
  @IsNotEmpty()
  genvolpath: string;

  @IsString()
  @IsNotEmpty()
  logvolpath: string;

  @IsOptional()
  @IsArray()
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
