import { DBInfo } from './db-info';
import { HashMap } from './collections';

/**
 * Interface representing host information.
 *
 * Contains host identification and connection details including
 * unique ID, address, port, password, and display alias.
 *
 * @category Types
 * @since 1.0.0
 */
export type HostInfo = {
  uid: string;
  id: string;
  token?: string;
  address: string;
  port: number;
  password: string;
  initialLogin: boolean;
  alias: string;
  dbProfiles: HashMap<DBInfo>;
};
