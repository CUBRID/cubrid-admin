import type { GetAllSysParamClientResponse } from '@api-interfaces';
import type { HostInfo } from '@type/index';

/** CMS's own fallback when cm.conf has no valid token_active_time. */
export const CMS_DEFAULT_TOKEN_ACTIVE_TIME_SEC = 7200;

const REJECTED = 0;

/**
 * When CMS last accepted each token, keyed by the token itself. CMS expires
 * a token once it goes unused for token_active_time seconds and renews it on
 * every request it accepts, so this, not the login time, says how long a
 * host's session lasts. 0 marks a token CMS has rejected.
 *
 * In memory only. After an api-server restart a host falls back to its login
 * time, which can only make a live session look expired (the user
 * reconnects), never an expired one look live.
 */
const lastAcceptedAt = new Map<string, number>();

/** Records CMS's answer to a request made with `token`. */
export function noteCmsTokenUse(token: string | undefined, rejected: boolean, at = Date.now()): void {
  if (!token) return;
  if (rejected) {
    lastAcceptedAt.set(token, REJECTED);
  } else if (lastAcceptedAt.get(token) !== REJECTED) {
    lastAcceptedAt.set(token, at);
  }
}

/** Drops a token NCA no longer uses (replaced by a new login, or disconnected). */
export function forgetCmsToken(token: string | undefined): void {
  if (token) lastAcceptedAt.delete(token);
}

/**
 * When the host's CMS session is expected to expire (epoch ms), or null when
 * it has no token, was never logged in with this server's tracking, or CMS
 * has already rejected the token. The token may still be replaced earlier by
 * a login of the same CMS user elsewhere; the client's 401 path covers that.
 */
export function cmsSessionExpiresAt(
  host: Pick<HostInfo, 'token' | 'cmsTokenIssuedAt' | 'cmsTokenActiveTimeSec'>
): number | null {
  if (!host.token) return null;
  const accepted = lastAcceptedAt.get(host.token);
  if (accepted === REJECTED) return null;
  const since = Math.max(accepted ?? 0, host.cmsTokenIssuedAt ?? 0);
  if (!since) return null;
  return since + (host.cmsTokenActiveTimeSec ?? CMS_DEFAULT_TOKEN_ACTIVE_TIME_SEC) * 1000;
}

const TOKEN_ACTIVE_TIME_NAMES = new Set(['token_active_time', 'tokenactivetime']);

/**
 * token_active_time from cm.conf lines, read the way CMS reads it
 * (cm_config.cpp, cm_server_extend_interface.cpp): '#' lines skipped, the
 * name ends at ' ', '\t' or '=', case-insensitive, the last entry wins, and
 * anything but 1-10 digits with a non-zero value means 7200.
 */
export function parseTokenActiveTime(conf: Pick<GetAllSysParamClientResponse, 'conflist'>): number {
  let raw: string | undefined;
  for (const line of conf.conflist?.flatMap((list) => list.confdata ?? []) ?? []) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const match = /^([^ \t=]+)[ \t]*=?[ \t]*(.*)$/.exec(text);
    if (match && TOKEN_ACTIVE_TIME_NAMES.has(match[1].toLowerCase())) {
      raw = match[2].trim();
    }
  }
  if (raw === undefined || !/^\d{1,10}$/.test(raw)) return CMS_DEFAULT_TOKEN_ACTIVE_TIME_SEC;
  const seconds = Number(raw);
  return seconds > 0 ? seconds : CMS_DEFAULT_TOKEN_ACTIVE_TIME_SEC;
}
