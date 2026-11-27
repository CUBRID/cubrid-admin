import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { UserError } from '@error/user/user-error';
import { passwordValidityChecker } from '@util';
import {
  generateInitialPassword,
  INITIAL_ADMIN_ID,
  initialAdminPasswordPath,
  InitialAdminService,
  removeInitialAdminPasswordFile,
} from './initial-admin.service';

describe('InitialAdminService', () => {
  let dir: string;
  const previousStorage = process.env.STORAGE_PATH;
  let stdout: jest.SpyInstance;
  let repository: { hasAccountFiles: jest.Mock; createUser: jest.Mock; loadUserById: jest.Mock };
  const config = (desktop = false) => ({ isDesktopMode: () => desktop }) as any;
  const make = (desktop = false) => new InitialAdminService(repository as any, config(desktop));
  const exists = (file: string) => fs.access(file).then(() => true, () => false);

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cwm-initial-admin-'));
    process.env.STORAGE_PATH = dir;
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    repository = {
      hasAccountFiles: jest.fn(async () => false),
      createUser: jest.fn(async () => undefined),
      loadUserById: jest.fn(),
    };
  });

  afterEach(async () => {
    stdout.mockRestore();
    if (previousStorage === undefined) delete process.env.STORAGE_PATH;
    else process.env.STORAGE_PATH = previousStorage;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('creates admin on a fresh install with a password that must be changed', async () => {
    await make().onModuleInit();

    expect(repository.createUser).toHaveBeenCalledTimes(1);
    const [dto, options] = repository.createUser.mock.calls[0];
    expect(dto.id).toBe(INITIAL_ADMIN_ID);
    expect(passwordValidityChecker(dto.password)).toBe(true);
    expect(options).toEqual({ role: 'admin', status: 'active', mustChangePassword: true });

    // The same password is in the file, readable by the owner only, and on the console.
    const file = initialAdminPasswordPath();
    expect(await fs.readFile(file, 'utf8')).toContain(`Password: ${dto.password}`);
    if (process.platform !== 'win32') {
      expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
    }
    expect(stdout.mock.calls.map((c) => String(c[0])).join('')).toContain(dto.password);
  });

  it('leaves an install that has accounts alone', async () => {
    repository.hasAccountFiles.mockResolvedValue(true);
    await make().onModuleInit();
    expect(repository.createUser).not.toHaveBeenCalled();
    expect(await exists(initialAdminPasswordPath())).toBe(false);
  });

  it('does nothing in the desktop app', async () => {
    await make(true).onModuleInit();
    expect(repository.hasAccountFiles).not.toHaveBeenCalled();
    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it('removes the file again if the account cannot be created', async () => {
    repository.createUser.mockRejectedValue(new Error('disk full'));
    await expect(make().onModuleInit()).rejects.toThrow('disk full');
    expect(await exists(initialAdminPasswordPath())).toBe(false);
  });

  it('takes an admin account created meanwhile as done', async () => {
    repository.createUser.mockRejectedValue(UserError.UserAlreadyExists({ userId: INITIAL_ADMIN_ID }));
    await expect(make().onModuleInit()).resolves.toBeUndefined();
    expect(await exists(initialAdminPasswordPath())).toBe(false);
  });

  describe('on a later start', () => {
    beforeEach(async () => {
      repository.hasAccountFiles.mockResolvedValue(true);
      await fs.mkdir(path.dirname(initialAdminPasswordPath()), { recursive: true });
      await fs.writeFile(initialAdminPasswordPath(), 'Password: x');
    });

    it('keeps the file while the first password is still unchanged', async () => {
      repository.loadUserById.mockResolvedValue({ id: INITIAL_ADMIN_ID, mustChangePassword: true });
      await make().onModuleInit();
      expect(await exists(initialAdminPasswordPath())).toBe(true);
    });

    it('removes the file once the password has been changed', async () => {
      repository.loadUserById.mockResolvedValue({ id: INITIAL_ADMIN_ID });
      await make().onModuleInit();
      expect(await exists(initialAdminPasswordPath())).toBe(false);
    });

    it('removes the file when admin has been deleted', async () => {
      repository.loadUserById.mockRejectedValue(UserError.UserNotFound({ userId: INITIAL_ADMIN_ID }));
      await make().onModuleInit();
      expect(await exists(initialAdminPasswordPath())).toBe(false);
    });

    it('keeps the file when admin cannot be read', async () => {
      repository.loadUserById.mockRejectedValue(new Error('bad key'));
      await make().onModuleInit();
      expect(await exists(initialAdminPasswordPath())).toBe(true);
    });
  });

  it('removing a missing file is not an error', async () => {
    await expect(removeInitialAdminPasswordFile()).resolves.toBeUndefined();
  });

  it('generates passwords that differ and pass the rules', () => {
    const passwords = new Set(Array.from({ length: 20 }, generateInitialPassword));
    expect(passwords.size).toBe(20);
    for (const p of passwords) {
      expect(p).toHaveLength(16);
      expect(passwordValidityChecker(p)).toBe(true);
    }
  });
});
