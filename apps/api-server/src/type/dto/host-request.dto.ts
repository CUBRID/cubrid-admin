import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Validated request bodies for HostController. Kept as backend-only
 * classes (mirroring the shared @api-interfaces types) so class-validator
 * decorators don't end up bundled into the frontend's copy of those types.
 *
 * @category DTOs
 * @since 1.0.0
 */
export class AddHostDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @IsString()
  @IsNotEmpty()
  id: string;

  // Not @IsNotEmpty() — importing hosts from a file always sends '' here by
  // design (credentials are never exported/imported for security), relying
  // on the later "add host without password, prompt to fill it in" UX.
  @IsString()
  password: string;

  @IsString()
  @IsNotEmpty()
  alias: string;

  @IsOptional()
  @IsString()
  groupId?: string;
}

export class CreateHostGroupDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateHostGroupDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  defaultHostUid?: string | null;
}

export class MoveHostDto {
  @IsString()
  @IsNotEmpty()
  targetGroupId: string;
}

export class UpdateHostClientDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  id?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  address?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  alias?: string;
}

export class MarkHaDto {
  @IsOptional()
  @IsString()
  groupName?: string;
}
