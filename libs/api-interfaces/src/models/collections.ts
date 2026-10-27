import { HostInfo, SafeHostInfo } from './host-info';
import { HostGroupInfo } from './host-group-info';
import { DBInfo } from './db-info';

/**
 * Generic hashmap/dictionary type
 *
 * @category Types
 * @since 1.0.0
 */
export type HashMap<T> = Record<string, T>;

/**
 * Host list as a hashmap (internal use with passwords)
 *
 * @category Types
 */
export type HostList = HashMap<HostInfo>;

/**
 * Safe host list without password fields (for API responses)
 *
 * @category Types
 */
export type SafeHostList = HashMap<SafeHostInfo>;

export type SafeHostGroupInfo = Omit<HostGroupInfo, 'hosts'> & { hosts: SafeHostList };
export type SafeHostGroupsMap = HashMap<SafeHostGroupInfo>;

/**
 * Database list as a hashmap (internal use with passwords)
 *
 * @category Types
 */
export type DbList = HashMap<DBInfo>;

/**
 * Safe database list without password fields (for API responses)
 *
 * @category Types
 */
export type SafeDbList = HashMap<Omit<DBInfo, 'password'>>;
// Re-export commonly used types
export type { HostInfo, SafeHostInfo } from './host-info';
export type { DBInfo } from './db-info';
export type { User } from './user';
