import { SetMetadata } from '@nestjs/common';

export const ADMIN_ONLY = 'adminOnly';

/**
 * Marks a route only Web Manager administrators may call. JwtAuthGuard
 * refuses everyone else with PERMISSION_DENIED (reason ADMIN_REQUIRED).
 */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);
