import { HostInfo } from '../models/host-info';

/**
 * Request interface for updating an existing host.
 *
 * Contains host information without UID (UID is provided in URL parameter).
 * Includes password as it may need to be updated. Fields are partial so clients may send only changed values.
 *
 * @category Requests
 * @since 1.0.0
 */

export type UpdateHostRequest = Partial<Omit<HostInfo, 'uid' | 'initialLogin'>>;
