import { HostGroupInfo } from './host-group-info';
import { HashMap } from './collections';
import { UserPreference } from './user-preferencs';

/**
 * User interface representing a user in the system.
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
}
