import { HostInfo } from '../models/host-info';

/**
 * Response interface for single host information.
 *
 * Contains host information without password, token, and dbProfiles for security.
 * Used when returning individual host data to client.
 *
 * @category Responses
 * @since 1.0.0
 */
export type HostResponse = Omit<HostInfo, 'password' | 'token' | 'dbProfiles'>;
