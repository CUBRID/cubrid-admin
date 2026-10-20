import { HashMap } from './collections';
import { HostInfo } from './host-info';

/**
 * Host group — top-level unit; contains one or more CMS host connections.
 */
export type HostGroupInfo = {
  name: string;
  defaultHostUid?: string;
  createdAt?: string;
  hosts: HashMap<HostInfo>;
};
