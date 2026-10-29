import type { GetAllSysParamClientResponse } from '@api-interfaces';
import type { HostInfo } from '@type/index';

/** CMS's own fallback when cm.conf has no valid token_active_time. */
export const CMS_DEFAULT_TOKEN_ACTIVE_TIME_SEC = 7200;

/**
 * Accepted or closed records idle this long are dropped. Losing one only makes
 * a host fall back to its login time, which can make a live session look
 * expired, never the reverse. Rejected records are kept, since without them a
 * long token_active_time would count from the login again; they go when the
 * host logs in again or is removed.
 */
export const CMS_TOKEN_ACTIVITY_RETENTION_MS = 24 * 60 * 60 * 1000;
const SWEEP_EVERY_NOTES = 256;

type TokenActivity = {
  /** When CMS last accepted a request with the token (epoch ms), 0 if never. */
  acceptedAt: number;
  rejected: boolean;
  /** When the user disconnected; requests started before it don't count. */
  closedAt?: number;
  touchedAt: number;
};

/**
 * What CMS did with each token, keyed by the token itself. CMS expires a
 * token once it goes unused for token_active_time seconds and renews it on
 * every request it accepts, so the last accepted request, not the login,
 * says how long a host's session lasts.
 *
 * In memory only. After an api-server restart a host falls back to its login
 * time, which can only make a live session look expired (the user
 * reconnects), never an expired one look live.
 */
const activity = new Map<string, TokenActivity>();
let notesSinceSweep = 0;

function sweep(now: number): void {
  for (const [token, entry] of activity) {
    if (!entry.rejected && now - entry.touchedAt > CMS_TOKEN_ACTIVITY_RETENTION_MS) activity.delete(token);
  }
}

/**
 * Records CMS's answer to a request made with `token` that NCA issued at
 * `startedAt` (before any per-host queueing). A request issued before the user
 * disconnected does not reopen the session, even if it was sent or answered
 * afterwards.
 */
export function noteCmsTokenUse(
  token: string | undefined,
  rejected: boolean,
  startedAt: number,
  at = Date.now()
): void {
  if (!token) return;
  const entry = activity.get(token) ?? { acceptedAt: 0, rejected: false, touchedAt: at };
  entry.touchedAt = at;
  if (rejected) {
    entry.rejected = true;
  } else if (!entry.rejected && (entry.closedAt === undefined || startedAt > entry.closedAt)) {
    entry.acceptedAt = at;
  }
  activity.set(token, entry);
  if (++notesSinceSweep >= SWEEP_EVERY_NOTES) {
    notesSinceSweep = 0;
    sweep(at);
  }
}

/** The user disconnected the host: earlier activity no longer counts. */
export function closeCmsToken(token: string | undefined, at = Date.now()): void {
  if (!token) return;
  const entry = activity.get(token) ?? { acceptedAt: 0, rejected: false, touchedAt: at };
  entry.acceptedAt = 0;
  entry.closedAt = at;
  entry.touchedAt = at;
  activity.set(token, entry);
}

/** Drops a token NCA no longer uses (replaced by a new login, host removed or changed). */
export function forgetCmsToken(token: string | undefined): void {
  if (token) activity.delete(token);
}

/**
 * When the host's CMS session is expected to expire (epoch ms), or null when
 * it has no token, has no login time or accepted request to count from, or
 * CMS has already rejected the token. The token may still be replaced earlier
 * by a login of the same CMS user elsewhere; the client's 401 path covers that.
 */
export function cmsSessionExpiresAt(
  host: Pick<HostInfo, 'token' | 'cmsTokenIssuedAt' | 'cmsTokenActiveTimeSec'>
): number | null {
  if (!host.token) return null;
  const entry = activity.get(host.token);
  if (entry?.rejected) return null;
  const since = Math.max(entry?.acceptedAt ?? 0, host.cmsTokenIssuedAt ?? 0);
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
