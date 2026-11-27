import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { UserError } from '@error/user/user-error';
import { AdminAuditService } from '@admin/admin-audit.service';
import { AccountAccessService } from './account-access.service';
import { AccountSettingsService } from './account-settings.service';

describe('account control storage', () => {
  let dir: string;
  const previousStorage = process.env.STORAGE_PATH;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cwm-account-'));
    process.env.STORAGE_PATH = dir;
    AccountSettingsService.reset();
    AccountAccessService.clearCache();
  });

  afterEach(async () => {
    if (previousStorage === undefined) delete process.env.STORAGE_PATH;
    else process.env.STORAGE_PATH = previousStorage;
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe('AccountSettingsService', () => {
    type Approval = boolean | 'unset';
    const config = (registration: boolean | undefined, desktop = false, approval: Approval = false) =>
      ({
        getAuthRegistrationSetting: () => registration,
        getAuthRegistrationApprovalSetting: () => (approval === 'unset' ? undefined : approval),
        getConfiguredAdmins: () => new Set<string>(),
        isDesktopMode: () => desktop,
      }) as any;
    let users: any[];
    const repository = { listUsers: jest.fn(async () => users) };
    // Approval off unless a test says otherwise, so the older rules show.
    const make = (registration: boolean | undefined, desktop = false, approval: Approval = false) => {
      const cfg = config(registration, desktop, approval);
      return new AccountSettingsService(cfg, repository as any, new AccountAccessService(repository as any, cfg));
    };

    beforeEach(() => {
      users = [];
      repository.listUsers.mockClear();
    });

    it('falls back to cwm.conf until an admin sets the switch', async () => {
      const service = make(false);
      await expect(service.isRegistrationEnabled()).resolves.toBe(false);

      await service.setRegistrationEnabled(true);
      await expect(service.isRegistrationEnabled()).resolves.toBe(true);

      // Survives a restart: read back from storage/admin/settings.json.
      AccountSettingsService.reset();
      await expect(make(false).isRegistrationEnabled()).resolves.toBe(true);
    });

    it('left unset, stays open whether or not an admin exists, even without approval', async () => {
      const service = make(undefined);
      await expect(service.isRegistrationEnabled()).resolves.toBe(true);

      users = [{ id: 'admin', password: 'h', role: 'admin' }];
      AccountSettingsService.adminsChanged();
      await expect(service.isRegistrationEnabled()).resolves.toBe(true);
    });

    it('lets cwm.conf and then the admin switch close it', async () => {
      users = [{ id: 'admin', password: 'h', role: 'admin' }];
      await expect(make(false).isRegistrationEnabled()).resolves.toBe(false);

      const service = make(undefined);
      await service.setRegistrationEnabled(false);
      await expect(service.isRegistrationEnabled()).resolves.toBe(false);
    });

    it('left unset with approval required (the default), stays open after an admin exists', async () => {
      users = [{ id: 'root', password: 'h', role: 'admin' }];
      const service = make(undefined, false, 'unset');
      await expect(service.isApprovalRequired()).resolves.toBe(true);
      await expect(service.isRegistrationEnabled()).resolves.toBe(true);
    });

    it('needs approval only while an active admin exists to give it', async () => {
      const service = make(undefined, false, 'unset');
      // A fresh install: nobody could approve the first sign-up.
      await expect(service.needsApproval()).resolves.toBe(false);

      users = [{ id: 'root', password: 'h', role: 'admin', status: 'disabled' }];
      await expect(service.needsApproval()).resolves.toBe(false);

      users = [{ id: 'root', password: 'h', role: 'admin' }];
      // Not the cached answer: the admin appeared a moment ago.
      await expect(service.needsApproval()).resolves.toBe(true);

      await expect(make(undefined, false, false).needsApproval()).resolves.toBe(false);
    });

    it('lets the admin switch override AUTH_REGISTRATION_APPROVAL, and says which applies', async () => {
      users = [{ id: 'root', password: 'h', role: 'admin' }];
      const service = make(undefined, false, true);
      await expect(service.getSettings()).resolves.toMatchObject({
        registrationApproval: true,
        registrationApprovalSource: 'config',
      });
      await service.setRegistrationApproval(false);
      await expect(service.needsApproval()).resolves.toBe(false);
      await expect(service.getSettings()).resolves.toMatchObject({
        registrationApproval: false,
        registrationApprovalSource: 'admin',
      });

      // Both switches live in one file, and survive a restart together.
      await service.setRegistrationEnabled(true);
      AccountSettingsService.reset();
      await expect(make(undefined, false, true).getSettings()).resolves.toMatchObject({
        registrationEnabled: true,
        registrationApproval: false,
      });
    });

    it('says why sign-up is open or closed, and lists ADMIN_USERS', async () => {
      await expect(make(undefined).getSettings()).resolves.toMatchObject({ registrationSource: 'auto', configuredAdmins: [] });
      await expect(make(false).getSettings()).resolves.toMatchObject({ registrationEnabled: false, registrationSource: 'config' });
      const service = make(false);
      await service.setRegistrationEnabled(true);
      await expect(service.getSettings()).resolves.toMatchObject({ registrationEnabled: true, registrationSource: 'admin' });
    });

    it('keeps its file out of the storage root the key migration decrypts', async () => {
      await make(true).setRegistrationEnabled(false);
      const rootFiles = (await fs.readdir(dir, { withFileTypes: true })).filter((e) => e.isFile());
      expect(rootFiles).toEqual([]);
      await expect(fs.readFile(path.join(dir, 'admin', 'settings.json'), 'utf8')).resolves.toContain(
        '"registrationEnabled": false'
      );
    });

    it('is always closed in the desktop app', async () => {
      const service = make(true, true);
      await service.setRegistrationEnabled(true);
      await expect(service.isRegistrationEnabled()).resolves.toBe(false);
    });
  });

  describe('AdminAuditService', () => {
    it('appends entries and reads them newest first, paged', async () => {
      const audit = new AdminAuditService();
      await audit.record('root', 'create', 'alice', { role: 'user' });
      await audit.record('root', 'disable', 'alice');
      await audit.record('root', 'set_registration', undefined, { enabled: false });

      const page = await audit.query({ limit: 2 });
      expect(page.total).toBe(3);
      expect(page.entries.map((e) => e.action)).toEqual(['set_registration', 'disable']);
      expect(page.entries[1]).toMatchObject({ actor: 'root', target: 'alice' });
      expect(page.entries[0]).not.toHaveProperty('target');
      expect((await audit.query({ limit: 2, offset: 2 })).entries.map((e) => e.action)).toEqual(['create']);
    });

    it('filters by actor, target, action and time', async () => {
      const audit = new AdminAuditService();
      await audit.record('root', 'create', 'alice');
      await audit.record('ops', 'disable', 'alice');
      await audit.record('root', 'disable', 'bob');

      expect((await audit.query({ actor: 'root' })).total).toBe(2);
      expect((await audit.query({ target: 'alice' })).total).toBe(2);
      expect((await audit.query({ action: 'disable', target: 'bob' })).total).toBe(1);
      expect((await audit.query({ from: '2999-01-01T00:00:00.000Z' })).total).toBe(0);
      expect((await audit.query({ to: '2999-01-01T00:00:00.000Z' })).total).toBe(3);
      // A bad date filters nothing out rather than everything.
      expect((await audit.query({ from: 'not a date' })).total).toBe(3);
    });

    it('returns nothing before the first entry and skips a torn line', async () => {
      const audit = new AdminAuditService();
      await expect(audit.query()).resolves.toEqual({ entries: [], total: 0 });
      await audit.record('root', 'delete', 'bob');
      await fs.appendFile(AdminAuditService.auditPath(), '{"at":"tor');
      await expect(audit.query()).resolves.toMatchObject({ total: 1 });
    });

    it('caps a page at the export limit', async () => {
      const audit = new AdminAuditService();
      await audit.record('root', 'delete', 'bob');
      await expect(audit.query({ limit: 999999 })).resolves.toMatchObject({ total: 1 });
    });
  });

  describe('AccountAccessService', () => {
    const user = { id: 'alice', password: 'h', role: 'user', status: 'active', sessionVersion: 0 } as any;

    const setup = (load: jest.Mock, admins: string[] = []) =>
      new AccountAccessService(
        { loadUserById: load, listUsers: jest.fn().mockResolvedValue([]) } as any,
        { getConfiguredAdmins: () => new Set(admins), isDesktopMode: () => false } as any
      );

    it('caches an account briefly and reads it again after invalidate', async () => {
      const load = jest.fn().mockResolvedValue(user);
      const access = setup(load);
      await access.get('alice');
      await access.get('alice');
      expect(load).toHaveBeenCalledTimes(1);

      load.mockResolvedValue({ ...user, status: 'disabled', sessionVersion: 1 });
      access.invalidate('alice');
      await expect(access.get('alice')).resolves.toMatchObject({ disabled: true, sessionVersion: 1 });
      expect(load).toHaveBeenCalledTimes(2);
    });

    it('reads again once the cache entry is older than the TTL', async () => {
      const load = jest.fn().mockResolvedValue(user);
      const access = setup(load);
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      await access.get('alice');
      now.mockReturnValue(1_000_000 + AccountAccessService.CACHE_TTL_MS + 1);
      await access.get('alice');
      now.mockRestore();
      expect(load).toHaveBeenCalledTimes(2);
    });

    it('reports a deleted account as missing', async () => {
      const access = setup(jest.fn().mockRejectedValue(UserError.UserNotFound({ userId: 'gone' })));
      await expect(access.get('gone')).resolves.toMatchObject({ exists: false });
    });

    it('runs guarded changes one at a time, even after one fails', async () => {
      const order: string[] = [];
      const step = (name: string, fail = false) => async () => {
        order.push(`${name}:start`);
        await new Promise((r) => setTimeout(r, 5));
        order.push(`${name}:end`);
        if (fail) throw new Error(name);
      };
      await Promise.allSettled([
        AccountAccessService.exclusive(step('a', true)),
        AccountAccessService.exclusive(step('b')),
      ]);
      expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
    });

    it('treats an ADMIN_USERS account as admin whatever its stored role', async () => {
      const access = setup(jest.fn().mockResolvedValue(user), ['alice']);
      await expect(access.get('alice')).resolves.toMatchObject({ isAdmin: true });
      expect(access.isAdminByConfig('alice')).toBe(true);
    });
  });
});
