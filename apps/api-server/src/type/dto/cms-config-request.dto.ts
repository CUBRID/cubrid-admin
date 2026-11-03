import { IsArray, IsString } from 'class-validator';

/**
 * Validated request body for CmsConfigController's broker-set-param
 * endpoint. Mirrors BrokerSetParamClientRequest (libs/api-interfaces).
 *
 * @category DTOs
 * @since 1.0.0
 */
export class BrokerSetParamDto {
  @IsArray()
  @IsString({ each: true })
  confdata: string[];

  /** broker.conf as the editor loaded it; the save fails if it changed since. */
  @IsArray()
  @IsString({ each: true })
  loaded: string[];
}

/**
 * Validated request body for CmsConfigController's set-sys-param endpoint.
 * Mirrors SetSysParamClientRequest (libs/api-interfaces).
 */
export class SetSysParamDto {
  @IsString()
  confname: string;

  @IsArray()
  @IsString({ each: true })
  confdata: string[];

  /** The file as the editor loaded it; the save fails if it changed since. */
  @IsArray()
  @IsString({ each: true })
  loaded: string[];
}
