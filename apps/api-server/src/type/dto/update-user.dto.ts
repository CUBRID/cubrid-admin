import { IsOptional, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UserPreferenceDto {
  @IsOptional()
  @IsNumber()
  dashboardInterval?: number;

  @IsOptional()
  @IsNumber()
  brokerStatusInterval?: number;
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
