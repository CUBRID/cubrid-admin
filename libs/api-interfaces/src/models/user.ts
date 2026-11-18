import { HostGroupInfo } from './host-group-info';
import { HashMap } from './collections';
import { UserPreference } from './user-preferencs';

/** Web Manager account role. A missing role is `user`. */
export type UserRole = 'admin' | 'user';

/**
 * Web Manager account status. A missing status is `active`. A `pending`
 * account signed itself up and waits for an administrator to approve it.
 */
export type AccountStatus = 'active' | 'disabled' | 'pending';

/**
 * User interface representing a user in the system.
 *
 * The account-control fields are optional: accounts created before them read
 * as an active, non-admin user at session version 0.
 */
export interface User {
  uuid: string;
  id: string;
  password: string;
  department: string;
  host_groups: HashMap<HostGroupInfo>;
  ha_mon_list: HashMap<any>;
  resource_mon_list: HashMap<any>;
  user_preference: UserPreference;
  role?: UserRole;
  status?: AccountStatus;
  /** Set when an admin creates the account or resets its password. */
  mustChangePassword?: boolean;
  /** Raised to end every session issued before it (disable, password reset). */
  sessionVersion?: number;
  createdAt?: string;
  lastLoginAt?: string;
  /** Who approved the sign-up, and when. Only on self-registered accounts. */
  approvedBy?: string;
  approvedAt?: string;
}
