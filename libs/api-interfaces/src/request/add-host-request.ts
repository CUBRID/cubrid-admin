import { HostInfo } from '../models/host-info';

export type AddHostRequest = Omit<HostInfo, 'uid' | 'dbProfiles' | 'token' | 'initialLogin'> & {
  /** Add to an existing group; omit to create a new group with this host. */
  groupId?: string;
};
