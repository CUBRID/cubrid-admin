import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_CHANGE = 'allowPendingPasswordChange';

/**
 * Marks a route an account that must set a new password (created or reset by
 * an admin) may still call: reading its own profile, changing the password,
 * logging out. JwtAuthGuard refuses every other route with
 * PASSWORD_CHANGE_REQUIRED until the password is changed.
 */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);
