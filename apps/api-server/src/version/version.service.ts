import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { checkForUpdate, UpdateCheckResult } from '@update-check';

const PERIODIC_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface VersionCheckState {
  currentVersion: string;
  lastCheckedAt: string | null;
  result: UpdateCheckResult;
}

/**
 * Checks GitHub Releases for a newer server version on two triggers: a
 * periodic background timer (so the cached result stays bounded-fresh even
 * if nobody opens the admin UI for a while) and on-demand via runCheck(),
 * called from VersionController on every GET /api/version/check. Both
 * triggers share one in-flight guard, so concurrent callers never cause a
 * burst of outbound requests.
 *
 * This server often runs on a closed network with no route to GitHub at
 * all — every failure path here resolves to a cached error result instead
 * of throwing, so a blocked outbound connection never surfaces as a server
 * error or blocks startup.
 */
@Injectable()
export class VersionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VersionService.name);
  private cachedResult: UpdateCheckResult = { status: 'error', reason: 'network' };
  private lastCheckedAt: Date | null = null;
  private inFlight: Promise<UpdateCheckResult> | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  getCurrentVersion(): string {
    return process.env.APP_VERSION || '0.0.0';
  }

  getState(): VersionCheckState {
    return {
      currentVersion: this.getCurrentVersion(),
      lastCheckedAt: this.lastCheckedAt?.toISOString() ?? null,
      result: this.cachedResult,
    };
  }

  onModuleInit(): void {
    // Fire-and-forget: a closed network (or GitHub just being briefly
    // unreachable) must never delay or fail server startup.
    void this.runCheck();

    this.intervalHandle = setInterval(() => {
      void this.runCheck();
    }, PERIODIC_CHECK_INTERVAL_MS);
    this.intervalHandle.unref?.();
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
  }

  async runCheck(): Promise<UpdateCheckResult> {
    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = checkForUpdate({
      currentVersion: this.getCurrentVersion(),
      packageType: 'server',
    })
      .catch((error: unknown): UpdateCheckResult => {
        // checkForUpdate itself never rejects, but guard defensively
        // anyway — this must stay a debug-level log, not an error: a
        // closed-network deployment hitting this constantly is expected,
        // not a server fault.
        const message = error instanceof Error ? error.message : String(error);
        this.logger.debug(`Update check failed: ${message}`);
        return { status: 'error', reason: 'network' };
      })
      .then((result) => {
        this.cachedResult = result;
        this.lastCheckedAt = new Date();
        return result;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }
}
