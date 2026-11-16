import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModuleOptions } from '@nestjs/throttler';
import { ConfigService } from '@config/config.service';

/**
 * Requests a client address may make to one of the guarded routes (login,
 * refresh, register, and the routes that check the account password) in
 * AUTH_THROTTLE_TTL_MS; past that, 429 with Retry-After until the minute ends.
 *
 * Why 10 a minute: a person signing in, mistyping a few times, and the
 * session refreshes of all their tabs (one a day each, taken in turn) stay
 * well under it, while password guessing drops to 600 tries an hour per
 * address. Screen polling and the reconnects after a dropped connection do
 * not go through these routes, so they are never limited.
 *
 * Counted per client address (req.ip): behind a reverse proxy, set
 * TRUST_PROXY so that is the browser's address and not the proxy's.
 * Kept in memory: it starts empty when the server restarts.
 */
export const AUTH_THROTTLE_LIMIT = 10;
export const AUTH_THROTTLE_TTL_MS = 60 * 1000;

// 'default' keeps the header name plain Retry-After (others get a suffix).
export const AUTH_THROTTLE_OPTIONS: ThrottlerModuleOptions = [
  { name: 'default', ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT },
];

/** The login rate limit, used with @UseGuards on the guarded routes only (not globally). */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  @Inject(ConfigService) private readonly config!: ConfigService;

  // The desktop app has no app login, and its socket is its own.
  protected async shouldSkip(): Promise<boolean> {
    return this.config.isDesktopMode();
  }
}
