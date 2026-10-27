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
  /** When NCA last logged in to this host's CMS (epoch ms). Server-side only. */
  cmsTokenIssuedAt?: number;
  /** The host's cm.conf token_active_time read at that login, in seconds. Server-side only. */
  cmsTokenActiveTimeSec?: number;
};

/**
 * Host as sent to the client: no credentials or CMS token, plus when the
 * CMS session is expected to expire (epoch ms; null when there is none or it
 * is known to be gone). CMS expires a token left unused for its
 * token_active_time, so a reload shows the host as connected only before then.
 */
export type SafeHostInfo = Omit<
  HostInfo,
  'password' | 'token' | 'dbProfiles' | 'cmsTokenIssuedAt' | 'cmsTokenActiveTimeSec'
> & {
  cmsSessionExpiresAt: number | null;
};
