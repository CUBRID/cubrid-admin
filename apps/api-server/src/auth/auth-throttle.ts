import { Inject, Injectable, Logger } from '@nestjs/common';
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
  private static warnedNoAddress = false;

  // The desktop app has no app login, and its socket is its own.
  protected async shouldSkip(): Promise<boolean> {
    return this.config.isDesktopMode();
  }

  // A request with no client address (a reverse proxy in front of
  // LISTEN_UNIX_SOCKET, with TRUST_PROXY not set to 1) counts with every
  // other such request: one limit for all users. Said once in the log.
  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (!req.ip) {
      if (!AuthThrottlerGuard.warnedNoAddress) {
        AuthThrottlerGuard.warnedNoAddress = true;
        new Logger(AuthThrottlerGuard.name).warn(
          'A sign-in request came with no client address, so all such requests share one rate limit. ' +
            'Behind a reverse proxy on LISTEN_UNIX_SOCKET, set TRUST_PROXY=1 and have the proxy send X-Forwarded-For.'
        );
      }
      return 'no-client-address';
    }
    return super.getTracker(req);
  }
}
