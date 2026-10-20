import { SafeHostGroupsMap } from '../models/collections';

/**
 * Response for host/group listing — groups contain nested hosts.
 */
export type GetHostsResponse = {
  host_groups: SafeHostGroupsMap;
};
