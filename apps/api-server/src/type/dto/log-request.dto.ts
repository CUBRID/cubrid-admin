import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Validated request body for LogController's view endpoint. Mirrors
 * ViewLogClientRequest (libs/api-interfaces) — start/end are string
 * representations of numbers per CMS convention (e.g. "1", "100").
 *
 * @category DTOs
 * @since 1.0.0
 */
export class ViewLogDto {
  @IsString()
  @IsNotEmpty()
  path: string;

  @IsString()
  @IsNotEmpty()
  start: string;

  @IsString()
  @IsNotEmpty()
  end: string;
}

/** Body for a complete, size-limited Top SQL capture. */
export class LogSnapshotDto {
  @IsString()
  @IsNotEmpty()
  path: string;
}
