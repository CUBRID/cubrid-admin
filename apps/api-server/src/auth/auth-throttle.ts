import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModuleOptions } from '@nestjs/throttler';
import { ConfigService } from '@config/config.service';

/**
 * Requests a client address may make to each guarded route (login,
 * register, and the routes that check the account password) in
 * AUTH_THROTTLE_TTL_MS, counted per route; past that, 429 with Retry-After
 * until the minute ends.
 *
 * Why 10 a minute: a person signing in and mistyping a few times stays well
 * under it, while password guessing drops to 600 tries an hour per address
 * and route. The session refresh is not limited: it needs the signed refresh
 * cookie, so it guesses nothing, and users who signed in at the same time
 * refresh at the same time. Screen polling and the reconnects after a
 * dropped connection do not go through these routes either.
 *
 * Counted per client address (req.ip) and per route: behind a reverse proxy
 * that is not on this machine, set TRUST_PROXY to its address so this is the
 * browser's address and not the proxy's.
 * Kept in memory: it starts empty when the server restarts.
 */
export const AUTH_THROTTLE_LIMIT = 10;
export const AUTH_THROTTLE_TTL_MS = 60 * 1000;

/** The 429 answer's message (the web shows its own words for it). */
export const AUTH_THROTTLE_MESSAGE = 'Too many attempts. Try again shortly.';

// 'default' keeps the header name plain Retry-After (others get a suffix).
export const AUTH_THROTTLE_OPTIONS: ThrottlerModuleOptions = {
  throttlers: [{ name: 'default', ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT }],
  errorMessage: AUTH_THROTTLE_MESSAGE,
};

/** The login rate limit, used with @UseGuards on the guarded routes only (not globally). */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  @Inject(ConfigService) private readonly config!: ConfigService;

  // The desktop app has no app login, and its socket is its own.
  protected async shouldSkip(): Promise<boolean> {
    return this.config.isDesktopMode();
  }
}
