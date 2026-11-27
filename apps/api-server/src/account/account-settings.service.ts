import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '@config/config.service';
import { UserRepositoryService } from '@repository';
import { getStoragePath } from '@util';
import { AdminSettings, RegistrationSource } from '@api-interfaces';
import { AccountAccessService } from './account-access.service';

type StoredSettings = { registrationEnabled?: boolean; registrationApproval?: boolean };

/**
 * Whether self-registration is open, decided in this order:
 * 1. the switch an administrator set in User Accounts;
 * 2. AUTH_REGISTRATION_ENABLED when cwm.conf sets it;
 * 3. otherwise open. Sign-ups never make an administrator: every install
 *    starts with the built-in `admin` account (InitialAdminService).
 *
 * Whether a sign-up needs approval follows the same order: the admin switch,
 * then AUTH_REGISTRATION_APPROVAL, then yes. It only applies while an active
 * administrator exists to approve it (see needsApproval).
 *
 * The admin switch is plain JSON in storage/admin/, not in the storage
 * root: the master-key migration script decrypts every file there.
 */
@Injectable()
export class AccountSettingsService {
  /** How long "an active admin exists" is reused; the sign-up page asks it unauthenticated. */
  static readonly ADMIN_PRESENCE_TTL_MS = 10_000;

  // Static: one copy for the process even if a module provides its own instance.
  private static stored: StoredSettings | null = null;
  private static saving: Promise<void> = Promise.resolve();
  private static adminPresence: { at: number; exists: boolean } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly repository: UserRepositoryService,
    private readonly accountAccess: AccountAccessService
  ) {}

  static settingsPath(): string {
    return path.join(getStoragePath(), 'admin', 'settings.json');
  }

  async isRegistrationEnabled(): Promise<boolean> {
    // The desktop app has one built-in user and no accounts to sign up for.
    if (this.config.isDesktopMode()) return false;
    const stored = await this.load();
    if (stored.registrationEnabled !== undefined) return stored.registrationEnabled;
    const configured = this.config.getAuthRegistrationSetting();
    if (configured !== undefined) return configured;
    return true;
  }

  /** The approval switch alone, whether or not an admin exists to approve. */
  async isApprovalRequired(): Promise<boolean> {
    const stored = await this.load();
    if (stored.registrationApproval !== undefined) return stored.registrationApproval;
    return this.config.getAuthRegistrationApprovalSetting() ?? true;
  }

  /**
   * Whether a sign-up made now waits for approval. Not while no active
   * administrator exists (an older install upgraded without one): nobody
   * could approve it, so it is active at once.
   */
  async needsApproval(): Promise<boolean> {
    return (await this.isApprovalRequired()) && (await this.activeAdminExists(true));
  }

  async getSettings(): Promise<AdminSettings> {
    const stored = await this.load();
    const source = (storedValue: boolean | undefined, configValue: boolean | undefined): RegistrationSource =>
      storedValue !== undefined ? 'admin' : configValue !== undefined ? 'config' : 'auto';
    return {
      registrationEnabled: await this.isRegistrationEnabled(),
      registrationSource: source(stored.registrationEnabled, this.config.getAuthRegistrationSetting()),
      registrationApproval: await this.isApprovalRequired(),
      registrationApprovalSource: source(
        stored.registrationApproval,
        this.config.getAuthRegistrationApprovalSetting()
      ),
      configuredAdmins: [...this.config.getConfiguredAdmins()].sort(),
    };
  }

  async setRegistrationEnabled(enabled: boolean): Promise<void> {
    await this.save({ registrationEnabled: enabled });
  }

  async setRegistrationApproval(required: boolean): Promise<void> {
    await this.save({ registrationApproval: required });
  }

  /**
   * One save at a time, from reading the current settings to updating the
   * cache: two admins changing different settings at once must not have the
   * second write put back what the first changed.
   */
  private save(change: StoredSettings): Promise<void> {
    const run = AccountSettingsService.saving.then(async () => {
      const next = { ...(await this.load()), ...change };
      const file = AccountSettingsService.settingsPath();
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp-${process.pid}-${randomUUID()}`;
      try {
        await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
        await fs.rename(tmp, file);
      } catch (err) {
        await fs.rm(tmp, { force: true }).catch(() => undefined);
        throw err;
      }
      AccountSettingsService.stored = next;
    });
    // A failed save must not stop the ones after it.
    AccountSettingsService.saving = run.catch(() => undefined);
    return run;
  }

  /** Call after any change to who is an active admin (register, role, status, delete). */
  static adminsChanged(): void {
    AccountSettingsService.adminPresence = null;
  }

  /** `fresh` skips the cache: a sign-up's approval must not rest on a stale answer. */
  private async activeAdminExists(fresh = false): Promise<boolean> {
    const cached = AccountSettingsService.adminPresence;
    if (!fresh && cached && Date.now() - cached.at < AccountSettingsService.ADMIN_PRESENCE_TTL_MS) {
      return cached.exists;
    }
    const exists = (await this.repository.listUsers()).some((u) => this.accountAccess.isActiveAdmin(u));
    AccountSettingsService.adminPresence = { at: Date.now(), exists };
    return exists;
  }

  private async load(): Promise<StoredSettings> {
    if (AccountSettingsService.stored) return AccountSettingsService.stored;
    try {
      const raw = JSON.parse(await fs.readFile(AccountSettingsService.settingsPath(), 'utf8'));
      const stored: StoredSettings = {};
      if (typeof raw?.registrationEnabled === 'boolean') stored.registrationEnabled = raw.registrationEnabled;
      if (typeof raw?.registrationApproval === 'boolean') stored.registrationApproval = raw.registrationApproval;
      AccountSettingsService.stored = stored;
    } catch (err: any) {
      if (err?.code !== 'ENOENT' && !(err instanceof SyntaxError)) throw err;
      AccountSettingsService.stored = {};
    }
    return AccountSettingsService.stored;
  }

  /** For tests. */
  static reset(): void {
    AccountSettingsService.saving = Promise.resolve();
    AccountSettingsService.stored = null;
    AccountSettingsService.adminPresence = null;
  }
}
