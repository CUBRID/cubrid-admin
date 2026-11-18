import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type {
  AccountStatus,
  AdminApproveAccountRequest,
  AdminCreateAccountRequest,
  AdminResetPasswordRequest,
  AdminSetRoleRequest,
  AdminSetStatusRequest,
  AdminSettingsUpdate,
  UserRole,
} from '@api-interfaces';

// Validated request bodies for /admin/*. Mirror the shared interfaces in
// libs/api-interfaces, kept backend-only so class-validator stays out of the
// frontend bundle (as change-password.dto.ts does).

const ROLES: UserRole[] = ['admin', 'user'];
// Not `pending`: a sign-up becomes active only through approve.
const STATUSES: AccountStatus[] = ['active', 'disabled'];

export class AdminCreateAccountDto implements AdminCreateAccountRequest {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: UserRole;
}

export class AdminResetPasswordDto implements AdminResetPasswordRequest {
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class AdminSetRoleDto implements AdminSetRoleRequest {
  @IsIn(ROLES)
  role: UserRole;
}

export class AdminSetStatusDto implements AdminSetStatusRequest {
  @IsIn(STATUSES)
  status: AccountStatus;
}

export class AdminApproveAccountDto implements AdminApproveAccountRequest {
  @IsOptional()
  @IsIn(ROLES)
  role?: UserRole;
}

export class AdminSettingsDto implements AdminSettingsUpdate {
  @IsOptional()
  @IsBoolean()
  registrationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  registrationApproval?: boolean;
}
