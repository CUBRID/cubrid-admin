import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  AdminAccountSummary,
  AdminAuditPage,
  AdminAuditQuery,
  AdminCreateAccountRequest,
  AdminPendingCount,
  AdminSettings,
  AdminSettingsUpdate,
  UserRole,
} from '@api-interfaces';
import { AccountAccessService } from '@account/account-access.service';
import { AccountSettingsService } from '@account/account-settings.service';
import { isValidAccountId } from '@account/account-id';
import { HandleUserErrors } from '@common';
import { UserError, UserErrorCode } from '@error/user/user-error';
import { UserRepositoryService } from '@repository';
import { PasswordService } from '@security';
import { User } from '@type/index';
import { passwordValidityChecker } from '@util';
import { readGroupHosts, readHostGroups } from '@host/host-group.util';
import { AdminAuditService } from './admin-audit.service';

/**
 * Web Manager account control for administrators: list, create, approve or
 * reject sign-ups, disable or enable, reset password, grant or remove admin,
 * delete, and the self-registration switches. Never reads or returns other users' hosts or
 * saved CMS credentials.
 *
 * Safety rules, checked by the server rather than trusted to the UI:
 * - an admin can't disable, demote, delete or reset their own account here;
 * - an ADMIN_USERS (cwm.conf) admin can't be demoted, disabled or deleted;
 * - no change may leave zero active admins;
 * - a sign-up waiting for approval is only approved, rejected or deleted,
 *   so it can't become active any other way.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly repository: UserRepositoryService,
    private readonly password: PasswordService,
    private readonly accountAccess: AccountAccessService,
    private readonly accountSettings: AccountSettingsService,
    private readonly audit: AdminAuditService
  ) {}

  @HandleUserErrors()
  async listAccounts(): Promise<AdminAccountSummary[]> {
    const users = await this.repository.listUsers();
    return users.map((u) => this.summarize(u)).sort((a, b) => a.id.localeCompare(b.id));
  }

  @HandleUserErrors()
  async countPending(): Promise<AdminPendingCount> {
    const users = await this.repository.listUsers();
    return { count: users.filter((u) => u.status === 'pending').length };
  }

  /**
   * Lets a sign-up in. Any admin can; when two act at once, the first wins
   * and the other is told it was already handled.
   */
  @HandleUserErrors()
  async approveAccount(actor: string, id: string, role: UserRole = 'user'): Promise<AdminAccountSummary> {
    return this.exclusive(async () => {
      await this.loadPending(id);
      const updated = await this.repository.atomicUpdateUser(id, async (user) => {
        if (user.status !== 'pending') throw UserError.NotPending({ userId: id });
        user.status = 'active';
        user.role = role;
        user.approvedBy = actor;
        user.approvedAt = new Date().toISOString();
        return user;
      });
      this.accountAccess.invalidate(id);
      AccountSettingsService.adminsChanged();
      await this.audit.record(actor, 'approve', id, { role });
      return this.summarize(updated);
    });
  }

  /** Turns a sign-up down: the account is deleted, so its id is free again. */
  @HandleUserErrors()
  async rejectAccount(actor: string, id: string): Promise<void> {
    await this.exclusive(async () => {
      await this.loadPending(id);
      await this.repository.deleteUser(id);
      this.accountAccess.invalidate(id);
      await this.audit.record(actor, 'reject', id);
    });
  }

  @HandleUserErrors()
  async createAccount(actor: string, request: AdminCreateAccountRequest): Promise<AdminAccountSummary> {
    if (!isValidAccountId(request.id)) {
      throw UserError.InvalidAccountId({ userId: request.id });
    }
    if (!passwordValidityChecker(request.password)) {
      throw UserError.BadNewPassword({ userId: request.id });
    }
    const role: UserRole = request.role ?? 'user';
    return this.exclusive(async () => {
      // The admin chose this password, so the user sets their own at first login.
      await this.repository.createUser(
        { id: request.id, password: request.password },
        { role, mustChangePassword: true }
      );
      AccountSettingsService.adminsChanged();
      await this.audit.record(actor, 'create', request.id, { role });
      return this.summarize(await this.repository.loadUserById(request.id));
    });
  }

  @HandleUserErrors()
  async setStatus(actor: string, id: string, status: AccountStatus): Promise<AdminAccountSummary> {
    this.refuseSelf(actor, id);
    return this.exclusive(async () => {
      const target = await this.loadNotPending(id);
      if ((target.status ?? 'active') === status) return this.summarize(target);
      if (status === 'disabled') {
        if (this.accountAccess.isAdminByConfig(id)) throw UserError.AdminByConfig({ userId: id });
        await this.refuseLastAdmin(target);
      }

      const updated = await this.repository.atomicUpdateUser(id, async (user) => {
        user.status = status;
        // Disabling ends every session at once; enabling starts none.
        if (status === 'disabled') user.sessionVersion = (user.sessionVersion ?? 0) + 1;
        return user;
      });
      this.accountAccess.invalidate(id);
      AccountSettingsService.adminsChanged();
      await this.audit.record(actor, status === 'disabled' ? 'disable' : 'enable', id);
      return this.summarize(updated);
    });
  }

  @HandleUserErrors()
  async setRole(actor: string, id: string, role: UserRole): Promise<AdminAccountSummary> {
    this.refuseSelf(actor, id);
    return this.exclusive(async () => {
      const target = await this.loadNotPending(id);
      // Before the no-change shortcut: a cwm.conf admin's stored role may
      // already be "user", yet they stay admin, so say why instead.
      if (role === 'user' && this.accountAccess.isAdminByConfig(id)) {
        throw UserError.AdminByConfig({ userId: id });
      }
      if ((target.role ?? 'user') === role) return this.summarize(target);
      if (role === 'user') await this.refuseLastAdmin(target);

      const updated = await this.repository.atomicUpdateUser(id, async (user) => {
        user.role = role;
        return user;
      });
      this.accountAccess.invalidate(id);
      AccountSettingsService.adminsChanged();
      await this.audit.record(actor, role === 'admin' ? 'grant_admin' : 'revoke_admin', id);
      return this.summarize(updated);
    });
  }

  @HandleUserErrors()
  async resetPassword(actor: string, id: string, newPassword: string): Promise<AdminAccountSummary> {
    this.refuseSelf(actor, id);
    if (!passwordValidityChecker(newPassword)) {
      throw UserError.BadNewPassword({ userId: id });
    }
    const hash = await this.password.getHashedValue(newPassword);
    return this.exclusive(async () => {
      await this.loadNotPending(id);
      const updated = await this.repository.atomicUpdateUser(id, async (user) => {
        user.password = hash;
        user.mustChangePassword = true;
        // Whoever held the old password is signed out everywhere.
        user.sessionVersion = (user.sessionVersion ?? 0) + 1;
        return user;
      });
      this.accountAccess.invalidate(id);
      await this.audit.record(actor, 'reset_password', id);
      return this.summarize(updated);
    });
  }

  /**
   * Ends every session of the account without disabling it (a lost laptop,
   * a shared browser): it can log in again at once.
   */
  @HandleUserErrors()
  async signOutEverywhere(actor: string, id: string): Promise<AdminAccountSummary> {
    this.refuseSelf(actor, id);
    return this.exclusive(async () => {
      await this.loadNotPending(id);
      const updated = await this.repository.atomicUpdateUser(id, async (user) => {
        user.sessionVersion = (user.sessionVersion ?? 0) + 1;
        return user;
      });
      this.accountAccess.invalidate(id);
      await this.audit.record(actor, 'sign_out', id);
      return this.summarize(updated);
    });
  }

  @HandleUserErrors()
  async deleteAccount(actor: string, id: string): Promise<void> {
    this.refuseSelf(actor, id);
    await this.exclusive(async () => {
      const target = await this.repository.loadUserById(id);
      if (this.accountAccess.isAdminByConfig(id)) throw UserError.AdminByConfig({ userId: id });
      await this.refuseLastAdmin(target);
      await this.repository.deleteUser(id);
      this.accountAccess.invalidate(id);
      AccountSettingsService.adminsChanged();
      await this.audit.record(actor, 'delete', id);
    });
  }

  async getSettings(): Promise<AdminSettings> {
    return this.accountSettings.getSettings();
  }

  async updateSettings(actor: string, update: AdminSettingsUpdate): Promise<AdminSettings> {
    if (update.registrationEnabled !== undefined) {
      await this.accountSettings.setRegistrationEnabled(update.registrationEnabled);
      await this.audit.record(actor, 'set_registration', undefined, { enabled: update.registrationEnabled });
    }
    if (update.registrationApproval !== undefined) {
      await this.accountSettings.setRegistrationApproval(update.registrationApproval);
      await this.audit.record(actor, 'set_registration_approval', undefined, {
        required: update.registrationApproval,
      });
    }
    return this.accountSettings.getSettings();
  }

  async queryAudit(filter: AdminAuditQuery): Promise<AdminAuditPage> {
    return this.audit.query(filter);
  }

  private summarize(user: User): AdminAccountSummary {
    return {
      id: user.id,
      role: this.accountAccess.isAdmin(user) ? 'admin' : 'user',
      adminByConfig: this.accountAccess.isAdminByConfig(user.id),
      status: user.status ?? 'active',
      mustChangePassword: user.mustChangePassword === true,
      hostCount: countHosts(user),
      ...(user.createdAt ? { createdAt: user.createdAt } : {}),
      ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt } : {}),
      ...(user.approvedBy ? { approvedBy: user.approvedBy } : {}),
      ...(user.approvedAt ? { approvedAt: user.approvedAt } : {}),
    };
  }

  /** A sign-up still waiting; gone or already handled reads as handled. */
  private async loadPending(id: string): Promise<User> {
    let user: User;
    try {
      user = await this.repository.loadUserById(id);
    } catch (err: unknown) {
      if (err instanceof UserError && err.code === UserErrorCode.USER_NOT_FOUND) {
        throw UserError.NotPending({ userId: id });
      }
      throw err;
    }
    if (user.status !== 'pending') throw UserError.NotPending({ userId: id });
    return user;
  }

  private async loadNotPending(id: string): Promise<User> {
    const user = await this.repository.loadUserById(id);
    if (user.status === 'pending') throw UserError.AccountPending({ userId: id });
    return user;
  }

  private refuseSelf(actor: string, id: string): void {
    if (actor === id) throw UserError.AdminSelfChange({ userId: id });
  }

  /** Refuses when `target` is the only active admin left. */
  private async refuseLastAdmin(target: User): Promise<void> {
    if (!this.accountAccess.isActiveAdmin(target)) return;
    const others = (await this.repository.listUsers()).filter(
      (u) => u.id !== target.id && this.accountAccess.isActiveAdmin(u)
    );
    if (others.length === 0) throw UserError.LastAdmin({ userId: target.id });
  }

  // Shared with UserService.deleteUser, so the last-admin check and the
  // change it guards run as one step: two admins demoting each other at once
  // can't both pass.
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    return AccountAccessService.exclusive(fn);
  }
}

/** Saved hosts across the account's groups; a malformed record counts as 0. */
function countHosts(user: User): number {
  try {
    return Object.values(readHostGroups(user)).reduce(
      (sum, group) => sum + Object.keys(readGroupHosts(group)).length,
      0
    );
  } catch {
    return 0;
  }
}
