import { IsIn, IsOptional, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SERVICE_VOLUME_INTERVAL_OPTIONS } from '@api-interfaces';

export class UserPreferenceDto {
  @IsOptional()
  @IsNumber()
  dashboardInterval?: number;

  @IsOptional()
  @IsNumber()
  brokerStatusInterval?: number;

  @IsOptional()
  @IsIn([...SERVICE_VOLUME_INTERVAL_OPTIONS])
  serviceVolumeInterval?: number;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UserPreferenceDto)
  user_preference?: UserPreferenceDto;
}
