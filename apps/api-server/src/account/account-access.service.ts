import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@config/config.service';
import { UserError, UserErrorCode } from '@error/user/user-error';
import { UserRepositoryService } from '@repository';
import { User } from '@type/index';

/** What the server needs on every request about the signed-in account. */
export type AccountAccess = {
  exists: boolean;
  /**
   * The account record's own id, new for every account created. Tokens carry
   * it, so a deleted account's tokens don't work for a new account that
   * reuses the same name.
   */
  uuid?: string;
  isAdmin: boolean;
  /** Can't be used: disabled by an admin, or a sign-up not approved yet. */
  disabled: boolean;
  mustChangePassword: boolean;
  sessionVersion: number;
};

const MISSING: AccountAccess = Object.freeze({
  exists: false,
  isAdmin: false,
  disabled: true,
  mustChangePassword: false,
  sessionVersion: 0,
});

/** A missing status is `active`; `disabled` and `pending` can't sign in. */
export function isActiveStatus(status: User['status']): boolean {
  return (status ?? 'active') === 'active';
}

/**
 * Whether a token issued for `tokenUuid` belongs to the account as it is now.
 * Tokens from before account ids were in them carry none and are taken as
 * the current account's.
 */
export function sameAccount(tokenUuid: string | undefined, access: AccountAccess): boolean {
  return tokenUuid === undefined || tokenUuid === access.uuid;
}

/**
 * Reads an account's role, status and session version for the per-request
 * checks, with a short cache so polling screens don't decrypt the account
 * file on every call. Every write to those fields calls invalidate(), so a
 * change takes effect on the very next request; the TTL only bounds a write
 * this process didn't make.
 */
@Injectable()
export class AccountAccessService implements OnApplicationBootstrap {
  static readonly CACHE_TTL_MS = 5_000;

  private readonly logger = new Logger(AccountAccessService.name);
  // Static: one cache for the process even if a module provides its own instance.
  private static readonly cache = new Map<string, { at: number; access: AccountAccess }>();

  constructor(
    private readonly repository: UserRepositoryService,
    private readonly config: ConfigService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.isDesktopMode()) return;
    try {
      const users = await this.repository.listUsers();
      if (users.length > 0 && !users.some((u) => this.isActiveAdmin(u))) {
        this.logger.warn(
          'No active administrator account. Set ADMIN_USERS in cwm.conf to an existing account id to manage accounts.'
        );
      }
      const ids = new Set(users.map((u) => u.id));
      const missing = [...this.config.getConfiguredAdmins()].filter((id) => !ids.has(id));
      if (missing.length > 0) {
        this.logger.warn(
          `ADMIN_USERS names account(s) that don't exist: ${missing.join(', ')}. ` +
            'They cannot be signed up for; name existing accounts, or have an administrator create them.'
        );
      }
    } catch (err: unknown) {
      this.logger.warn(`Could not check for an administrator account: ${String(err)}`);
    }
  }

  isAdminByConfig(id: string): boolean {
    return this.config.getConfiguredAdmins().has(id);
  }

  isAdmin(user: Pick<User, 'id' | 'role'>): boolean {
    return user.role === 'admin' || this.isAdminByConfig(user.id);
  }

  isActiveAdmin(user: Pick<User, 'id' | 'role' | 'status'>): boolean {
    return this.isAdmin(user) && isActiveStatus(user.status);
  }

  accessOf(user: User): AccountAccess {
    return {
      exists: true,
      uuid: user.uuid,
      isAdmin: this.isAdmin(user),
      // A pending account never gets a token; refusing it here too means a
      // token can't outlive a slip elsewhere.
      disabled: !isActiveStatus(user.status),
      mustChangePassword: user.mustChangePassword === true,
      sessionVersion: user.sessionVersion ?? 0,
    };
  }

  async get(userId: string): Promise<AccountAccess> {
    const cached = AccountAccessService.cache.get(userId);
    if (cached && Date.now() - cached.at < AccountAccessService.CACHE_TTL_MS) {
      return cached.access;
    }

    let access: AccountAccess;
    try {
      access = this.accessOf(await this.repository.loadUserById(userId));
    } catch (err: unknown) {
      if (!(err instanceof UserError) || err.code !== UserErrorCode.USER_NOT_FOUND) throw err;
      access = MISSING;
    }
    AccountAccessService.cache.set(userId, { at: Date.now(), access });
    return access;
  }

  invalidate(userId: string): void {
    AccountAccessService.cache.delete(userId);
  }

  // Every change that can remove an active admin (admin actions in User
  // Accounts, a user deleting their own account) runs here one at a time,
  // so the last-admin check and the change it guards can't interleave.
  private static queue: Promise<unknown> = Promise.resolve();

  static exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = AccountAccessService.queue.then(fn);
    AccountAccessService.queue = run.catch(() => undefined);
    return run;
  }

  /** For tests. */
  static clearCache(): void {
    AccountAccessService.cache.clear();
  }
}
