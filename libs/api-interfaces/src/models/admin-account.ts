import { AccountStatus, UserRole } from './user';

/**
 * One Web Manager account as the admin user list shows it. Never carries the
 * password hash, hosts, or saved CMS credentials.
 */
export interface AdminAccountSummary {
  id: string;
  role: UserRole;
  /** Admin by the ADMIN_USERS setting in cwm.conf, which the UI cannot change. */
  adminByConfig: boolean;
  status: AccountStatus;
  mustChangePassword: boolean;
  /** How many hosts the account has saved (never the hosts themselves). */
  hostCount: number;
  createdAt?: string;
  lastLoginAt?: string;
  approvedBy?: string;
  approvedAt?: string;
}

/** POST /admin/users/:id/approve body. The role defaults to `user`. */
export interface AdminApproveAccountRequest {
  role?: UserRole;
}

/** GET /admin/users/pending-count: sign-ups waiting for approval. */
export interface AdminPendingCount {
  count: number;
}

export interface AdminCreateAccountRequest {
  id: string;
  password: string;
  role?: UserRole;
}

export interface AdminResetPasswordRequest {
  password: string;
}

export interface AdminSetRoleRequest {
  role: UserRole;
}

export interface AdminSetStatusRequest {
  status: AccountStatus;
}

/** Why self-registration is open or closed. */
export type RegistrationSource =
  /** An administrator set the switch. */
  | 'admin'
  /** AUTH_REGISTRATION_ENABLED in cwm.conf. */
  | 'config'
  /** Neither: open until an active administrator exists. */
  | 'auto';

export interface AdminSettings {
  registrationEnabled: boolean;
  registrationSource: RegistrationSource;
  /** New sign-ups wait for an administrator to approve them. */
  registrationApproval: boolean;
  /** `auto` here means the default: approval required. */
  registrationApprovalSource: RegistrationSource;
  /** ADMIN_USERS in cwm.conf: always administrators, read-only here. */
  configuredAdmins: string[];
}

/** PUT /admin/settings body. */
export interface AdminSettingsUpdate {
  registrationEnabled?: boolean;
  registrationApproval?: boolean;
}

/** POST /auth/register result: whether the new account can sign in yet. */
export interface RegisterResponse {
  status: 'active' | 'pending';
}

export type AdminAuditAction =
  | 'create'
  | 'delete'
  | 'disable'
  | 'enable'
  | 'reset_password'
  | 'grant_admin'
  | 'revoke_admin'
  | 'sign_out'
  | 'set_registration'
  | 'set_registration_approval'
  | 'approve'
  | 'reject';

export interface AdminAuditEntry {
  at: string;
  actor: string;
  action: AdminAuditAction;
  target?: string;
  detail?: Record<string, unknown>;
}

/** GET /admin/audit filters. Every field is optional; dates are ISO strings. */
export interface AdminAuditQuery {
  actor?: string;
  target?: string;
  action?: AdminAuditAction;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** One page of the audit log, newest first, with the count of all matches. */
export interface AdminAuditPage {
  entries: AdminAuditEntry[];
  total: number;
}
