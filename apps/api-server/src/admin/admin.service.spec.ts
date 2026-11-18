import { AccountAccessService } from '@account/account-access.service';
import { UserError } from '@error/user/user-error';
import { User } from '@type/index';
import { AdminService } from './admin.service';

/** An in-memory account store with the repository methods AdminService uses. */
function fakeRepository(initial: Partial<User>[]) {
  const users = new Map<string, User>();
  for (const u of initial) {
    users.set(u.id!, { password: 'hash', host_groups: {}, ...u } as User);
  }
  const notFound = (id: string) => UserError.UserNotFound({ userId: id });
  return {
    users,
    listUsers: jest.fn(async () => [...users.values()].map((u) => ({ ...u }))),
    loadUserById: jest.fn(async (id: string) => {
      const u = users.get(id);
      if (!u) throw notFound(id);
      return { ...u };
    }),
    atomicUpdateUser: jest.fn(async (id: string, fn: (u: User) => Promise<User>) => {
      const u = users.get(id);
      if (!u) throw notFound(id);
      const next = await fn({ ...u });
      users.set(id, next);
      return { ...next };
    }),
    createUser: jest.fn(async (dto: { id: string; password: string }, options: any = {}) => {
      if (users.has(dto.id)) throw UserError.UserAlreadyExists({ userId: dto.id });
      users.set(dto.id, {
        id: dto.id,
        password: `hashed:${dto.password}`,
        role: options.role ?? 'user',
        status: options.status ?? 'active',
        ...(options.mustChangePassword ? { mustChangePassword: true } : {}),
        sessionVersion: 0,
        createdAt: '2026-11-12T00:00:00.000Z',
      } as User);
    }),
    deleteUser: jest.fn(async (id: string) => {
      users.delete(id);
    }),
  };
}

describe('AdminService', () => {
  let repo: ReturnType<typeof fakeRepository>;
  let configured: Set<string>;
  let access: AccountAccessService;
  let audit: { record: jest.Mock; query: jest.Mock };
  let settings: { getSettings: jest.Mock; setRegistrationEnabled: jest.Mock; setRegistrationApproval: jest.Mock };
  let service: AdminService;

  const setup = (initial: Partial<User>[]) => {
    repo = fakeRepository(initial);
    configured = new Set();
    access = new AccountAccessService(repo as any, { getConfiguredAdmins: () => configured, isDesktopMode: () => false } as any);
    jest.spyOn(access, 'invalidate');
    audit = { record: jest.fn().mockResolvedValue(undefined), query: jest.fn().mockResolvedValue({ entries: [], total: 0 }) } as any;
    settings = {
      getSettings: jest.fn().mockResolvedValue({ registrationEnabled: false }),
      setRegistrationEnabled: jest.fn().mockResolvedValue(undefined),
      setRegistrationApproval: jest.fn().mockResolvedValue(undefined),
    };
    const password = { getHashedValue: jest.fn(async (p: string) => `hashed:${p}`) };
    service = new AdminService(repo as any, password as any, access, settings as any, audit as any);
  };

  beforeEach(() => {
    AccountAccessService.clearCache();
    setup([
      { id: 'root', role: 'admin', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'alice', role: 'user', lastLoginAt: '2026-11-01T00:00:00.000Z' },
      { id: 'bob' },
    ]);
  });

  describe('listAccounts', () => {
    it('lists every account sorted by id, without passwords or hosts', async () => {
      const list = await service.listAccounts();
      expect(list.map((a) => a.id)).toEqual(['alice', 'bob', 'root']);
      expect(list[0]).toEqual({
        id: 'alice',
        role: 'user',
        adminByConfig: false,
        status: 'active',
        mustChangePassword: false,
        hostCount: 0,
        lastLoginAt: '2026-11-01T00:00:00.000Z',
      });
      for (const a of list) {
        expect(a).not.toHaveProperty('password');
        expect(a).not.toHaveProperty('host_groups');
      }
    });

    it('counts saved hosts across groups without returning them', async () => {
      setup([{ id: 'alice', host_groups: { g1: { name: 'a', hosts: { h1: {}, h2: {} } }, g2: { name: 'b', hosts: { h3: {} } } } as any }]);
      const [alice] = await service.listAccounts();
      expect(alice.hostCount).toBe(3);
      expect(JSON.stringify(alice)).not.toContain('h1');
    });

    it('reads accounts from before roles as active users', async () => {
      const bob = (await service.listAccounts()).find((a) => a.id === 'bob');
      expect(bob).toMatchObject({ role: 'user', status: 'active', adminByConfig: false });
    });

    it('shows ADMIN_USERS accounts as admins by config', async () => {
      configured.add('bob');
      const bob = (await service.listAccounts()).find((a) => a.id === 'bob');
      expect(bob).toMatchObject({ role: 'admin', adminByConfig: true });
    });
  });

  describe('createAccount', () => {
    it('creates an account that must set its own password, and audits it', async () => {
      const created = await service.createAccount('root', { id: 'carol', password: 'Passw0rd' });
      expect(created).toMatchObject({ id: 'carol', role: 'user', mustChangePassword: true, status: 'active' });
      expect(audit.record).toHaveBeenCalledWith('root', 'create', 'carol', { role: 'user' });
    });

    it('can create an admin', async () => {
      const created = await service.createAccount('root', { id: 'dave', password: 'Passw0rd', role: 'admin' });
      expect(created.role).toBe('admin');
    });

    it('refuses a password that breaks the policy', async () => {
      await expect(service.createAccount('root', { id: 'xavier', password: 'short' })).rejects.toMatchObject({
        code: 'BAD_NEW_PASSWORD',
      });
      expect(repo.createUser).not.toHaveBeenCalled();
    });

    it.each(['ab', ' carol', 'carol '])('refuses the account id %j', async (id) => {
      await expect(service.createAccount('root', { id, password: 'Passw0rd' })).rejects.toMatchObject({
        code: 'INVALID_ACCOUNT_ID',
      });
      expect(repo.createUser).not.toHaveBeenCalled();
    });

    it('can create an ADMIN_USERS account, which sign-up refuses', async () => {
      configured.add('boss');
      await expect(service.createAccount('root', { id: 'boss', password: 'Passw0rd' })).resolves.toMatchObject({
        role: 'admin',
        adminByConfig: true,
      });
    });

    it('refuses an id that already exists', async () => {
      await expect(service.createAccount('root', { id: 'alice', password: 'Passw0rd' })).rejects.toMatchObject({
        code: 'USER_ALREADY_EXISTS',
      });
    });
  });

  describe('setStatus', () => {
    it('disabling ends every session of the account', async () => {
      const result = await service.setStatus('root', 'alice', 'disabled');
      expect(result.status).toBe('disabled');
      expect(repo.users.get('alice')!.sessionVersion).toBe(1);
      expect(access.invalidate).toHaveBeenCalledWith('alice');
      expect(audit.record).toHaveBeenCalledWith('root', 'disable', 'alice');
      await expect(access.get('alice')).resolves.toMatchObject({ disabled: true, sessionVersion: 1 });
    });

    it('enabling keeps the session version', async () => {
      await service.setStatus('root', 'alice', 'disabled');
      await service.setStatus('root', 'alice', 'active');
      expect(repo.users.get('alice')).toMatchObject({ status: 'active', sessionVersion: 1 });
      expect(audit.record).toHaveBeenLastCalledWith('root', 'enable', 'alice');
    });

    it('does nothing and audits nothing when the status is unchanged', async () => {
      await service.setStatus('root', 'alice', 'active');
      expect(repo.atomicUpdateUser).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('refuses to disable the acting admin', async () => {
      await expect(service.setStatus('root', 'root', 'disabled')).rejects.toMatchObject({ code: 'ADMIN_SELF_CHANGE' });
    });

    it('refuses to disable an ADMIN_USERS admin', async () => {
      configured.add('alice');
      await expect(service.setStatus('root', 'alice', 'disabled')).rejects.toMatchObject({ code: 'ADMIN_BY_CONFIG' });
    });

    it('refuses to disable the last active admin', async () => {
      // The actor is an admin whose own account is disabled in storage
      // (a session left over), so only "other" stays active.
      setup([{ id: 'actor', role: 'admin', status: 'disabled' }, { id: 'other', role: 'admin' }]);
      await expect(service.setStatus('actor', 'other', 'disabled')).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    });

    it('reports an unknown account', async () => {
      await expect(service.setStatus('root', 'nobody', 'disabled')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    });
  });

  describe('setRole', () => {
    it('grants and removes admin, auditing each', async () => {
      await service.setRole('root', 'alice', 'admin');
      expect(repo.users.get('alice')!.role).toBe('admin');
      expect(audit.record).toHaveBeenCalledWith('root', 'grant_admin', 'alice');

      await service.setRole('root', 'alice', 'user');
      expect(repo.users.get('alice')!.role).toBe('user');
      expect(audit.record).toHaveBeenCalledWith('root', 'revoke_admin', 'alice');
      expect(access.invalidate).toHaveBeenCalledWith('alice');
    });

    it('refuses to change the acting admin', async () => {
      await expect(service.setRole('root', 'root', 'user')).rejects.toMatchObject({ code: 'ADMIN_SELF_CHANGE' });
    });

    it('refuses to demote an ADMIN_USERS admin', async () => {
      configured.add('alice');
      await expect(service.setRole('root', 'alice', 'user')).rejects.toMatchObject({ code: 'ADMIN_BY_CONFIG' });
    });

    it('refuses to demote the last active admin', async () => {
      setup([{ id: 'actor', role: 'admin', status: 'disabled' }, { id: 'other', role: 'admin' }]);
      await expect(service.setRole('actor', 'other', 'user')).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    });

    it('serializes concurrent demotions so one admin always remains', async () => {
      setup([{ id: 'a', role: 'admin' }, { id: 'b', role: 'admin' }, { id: 'c', role: 'admin' }]);
      const results = await Promise.allSettled([
        service.setRole('a', 'b', 'user'),
        service.setRole('b', 'c', 'user'),
        service.setRole('c', 'a', 'user'),
      ]);
      const admins = [...repo.users.values()].filter((u) => u.role === 'admin');
      expect(admins.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    });
  });

  describe('resetPassword', () => {
    it('sets the new password, requires a change, and ends sessions', async () => {
      const result = await service.resetPassword('root', 'alice', 'NewPassw0rd');
      expect(result.mustChangePassword).toBe(true);
      expect(repo.users.get('alice')).toMatchObject({
        password: 'hashed:NewPassw0rd',
        mustChangePassword: true,
        sessionVersion: 1,
      });
      expect(audit.record).toHaveBeenCalledWith('root', 'reset_password', 'alice');
      // The audit entry never carries the password.
      expect(JSON.stringify(audit.record.mock.calls)).not.toContain('NewPassw0rd');
    });

    it('refuses a weak password and the acting admin', async () => {
      await expect(service.resetPassword('root', 'alice', 'weak')).rejects.toMatchObject({ code: 'BAD_NEW_PASSWORD' });
      await expect(service.resetPassword('root', 'root', 'NewPassw0rd')).rejects.toMatchObject({
        code: 'ADMIN_SELF_CHANGE',
      });
    });
  });

  describe('signOutEverywhere', () => {
    it('ends sessions without disabling, and audits it', async () => {
      const result = await service.signOutEverywhere('root', 'alice');
      expect(result.status).toBe('active');
      expect(repo.users.get('alice')!.sessionVersion).toBe(1);
      expect(access.invalidate).toHaveBeenCalledWith('alice');
      expect(audit.record).toHaveBeenCalledWith('root', 'sign_out', 'alice');
    });

    it('refuses the acting admin and unknown accounts', async () => {
      await expect(service.signOutEverywhere('root', 'root')).rejects.toMatchObject({ code: 'ADMIN_SELF_CHANGE' });
      await expect(service.signOutEverywhere('root', 'nobody')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    });
  });

  describe('deleteAccount', () => {
    it('deletes the account and audits it', async () => {
      await service.deleteAccount('root', 'alice');
      expect(repo.users.has('alice')).toBe(false);
      expect(access.invalidate).toHaveBeenCalledWith('alice');
      expect(audit.record).toHaveBeenCalledWith('root', 'delete', 'alice');
    });

    it('refuses the acting admin, an ADMIN_USERS admin, and the last active admin', async () => {
      await expect(service.deleteAccount('root', 'root')).rejects.toMatchObject({ code: 'ADMIN_SELF_CHANGE' });

      configured.add('alice');
      await expect(service.deleteAccount('root', 'alice')).rejects.toMatchObject({ code: 'ADMIN_BY_CONFIG' });

      setup([{ id: 'actor', role: 'admin', status: 'disabled' }, { id: 'other', role: 'admin' }]);
      await expect(service.deleteAccount('actor', 'other')).rejects.toMatchObject({ code: 'LAST_ADMIN' });
      expect(repo.users.has('other')).toBe(true);
    });
  });

  it('switches self-registration and audits it', async () => {
    await service.updateSettings('root', { registrationEnabled: true });
    expect(settings.setRegistrationEnabled).toHaveBeenCalledWith(true);
    expect(settings.setRegistrationApproval).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('root', 'set_registration', undefined, { enabled: true });
  });

  it('switches sign-up approval and audits it', async () => {
    await service.updateSettings('root', { registrationApproval: false });
    expect(settings.setRegistrationApproval).toHaveBeenCalledWith(false);
    expect(settings.setRegistrationEnabled).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('root', 'set_registration_approval', undefined, { required: false });
  });

  describe('sign-up approval', () => {
    beforeEach(() => {
      setup([
        { id: 'root', role: 'admin' },
        { id: 'ops', role: 'admin' },
        { id: 'newbie', role: 'user', status: 'pending', createdAt: '2026-11-18T00:00:00.000Z' },
        { id: 'alice', role: 'user' },
      ]);
    });

    it('counts and lists waiting sign-ups', async () => {
      await expect(service.countPending()).resolves.toEqual({ count: 1 });
      const newbie = (await service.listAccounts()).find((a) => a.id === 'newbie');
      expect(newbie).toMatchObject({ status: 'pending', role: 'user' });
    });

    it('approves a sign-up with the chosen role, records who did, and audits it', async () => {
      const approved = await service.approveAccount('ops', 'newbie', 'admin');
      expect(approved).toMatchObject({ id: 'newbie', status: 'active', role: 'admin', approvedBy: 'ops' });
      expect(approved.approvedAt).toEqual(expect.any(String));
      expect(access.invalidate).toHaveBeenCalledWith('newbie');
      expect(audit.record).toHaveBeenCalledWith('ops', 'approve', 'newbie', { role: 'admin' });
      await expect(service.countPending()).resolves.toEqual({ count: 0 });
    });

    it('approves as a plain user by default', async () => {
      await expect(service.approveAccount('root', 'newbie')).resolves.toMatchObject({ role: 'user' });
    });

    it('rejects a sign-up by deleting it, and audits it', async () => {
      await service.rejectAccount('root', 'newbie');
      expect(repo.users.has('newbie')).toBe(false);
      expect(audit.record).toHaveBeenCalledWith('root', 'reject', 'newbie');
    });

    it('lets only the first of two admins handle a sign-up', async () => {
      const results = await Promise.allSettled([
        service.approveAccount('root', 'newbie'),
        service.rejectAccount('ops', 'newbie'),
      ]);
      expect(results[0].status).toBe('fulfilled');
      expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'NOT_PENDING' } });
      expect(repo.users.get('newbie')?.status).toBe('active');

      // Handled, then gone: a late click says so rather than "not found".
      await service.deleteAccount('root', 'newbie');
      await expect(service.approveAccount('ops', 'newbie')).rejects.toMatchObject({ code: 'NOT_PENDING' });
    });

    it('refuses to approve or reject an account that did not sign up for approval', async () => {
      await expect(service.approveAccount('root', 'alice')).rejects.toMatchObject({ code: 'NOT_PENDING' });
      await expect(service.rejectAccount('root', 'alice')).rejects.toMatchObject({ code: 'NOT_PENDING' });
      expect(repo.users.has('alice')).toBe(true);
    });

    it('lets a waiting sign-up become active only through approval', async () => {
      await expect(service.setStatus('root', 'newbie', 'active')).rejects.toMatchObject({ code: 'ACCOUNT_PENDING' });
      await expect(service.setRole('root', 'newbie', 'admin')).rejects.toMatchObject({ code: 'ACCOUNT_PENDING' });
      await expect(service.resetPassword('root', 'newbie', 'Passw0rd!x')).rejects.toMatchObject({ code: 'ACCOUNT_PENDING' });
      await expect(service.signOutEverywhere('root', 'newbie')).rejects.toMatchObject({ code: 'ACCOUNT_PENDING' });
      expect(repo.users.get('newbie')?.status).toBe('pending');
      // Deleting it is still allowed.
      await service.deleteAccount('root', 'newbie');
      expect(repo.users.has('newbie')).toBe(false);
    });

    it('does not count a waiting sign-up as an active admin', () => {
      expect(access.isActiveAdmin({ id: 'x', role: 'admin', status: 'pending' })).toBe(false);
      expect(access.accessOf({ id: 'x', status: 'pending' } as User).disabled).toBe(true);
    });
  });
});
