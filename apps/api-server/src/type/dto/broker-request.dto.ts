import { ArrayNotEmpty, IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CMS_PASSWORD_MAX_BYTES } from '@api-interfaces';
import { MaxUtf8Bytes } from './max-utf8-bytes.decorator';

/**
 * Validated request bodies for BrokerController's DBMT (CMS) user endpoints.
 * Kept as backend-only classes (mirroring the shared @api-interfaces types)
 * so class-validator decorators don't end up bundled into the frontend's
 * copy of those types.
 *
 * casauth/dbcreate/statusmonitorauth are documented as CMS enum-like
 * strings ('none' | 'admin' | 'monitor'), but that list isn't confirmed
 * exhaustive against the real CMS API — validating presence/type only
 * rather than @IsIn() to avoid rejecting a legitimate value CMS accepts
 * that isn't in our comment.
 *
 * @category DTOs
 * @since 1.0.0
 */
export class AddDbmtUserDto {
  @IsString()
  @IsNotEmpty()
  targetid: string;

  @IsString()
  @IsNotEmpty()
  @MaxUtf8Bytes(CMS_PASSWORD_MAX_BYTES)
  password: string;

  @IsString()
  @IsNotEmpty()
  casauth: string;

  @IsString()
  @IsNotEmpty()
  dbcreate: string;

  @IsString()
  @IsNotEmpty()
  statusmonitorauth: string;
}

export class UpdateDbmtUserDto {
  @IsString()
  @IsNotEmpty()
  targetid: string;

  @IsOptional()
  @IsArray()
  dbauth?: unknown[];

  @IsString()
  @IsNotEmpty()
  casauth: string;

  @IsString()
  @IsNotEmpty()
  dbcreate: string;

  @IsString()
  @IsNotEmpty()
  statusmonitorauth: string;
}

export class SetDbmtPasswdDto {
  @IsString()
  @IsNotEmpty()
  targetid: string;

  @IsString()
  @IsNotEmpty()
  @MaxUtf8Bytes(CMS_PASSWORD_MAX_BYTES)
  newpassword: string;
}

export class GetBrokerStatusBulkDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  bnames: string[];
}
