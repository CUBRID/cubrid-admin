import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { UserRepositoryService } from './user-repository.service';

describe('UserRepositoryService.listUsers', () => {
  let dir: string;
  const previousStorage = process.env.STORAGE_PATH;
  const hex = (c: string) => c.repeat(64);

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cwm-users-'));
    process.env.STORAGE_PATH = dir;
  });

  afterEach(async () => {
    if (previousStorage === undefined) delete process.env.STORAGE_PATH;
    else process.env.STORAGE_PATH = previousStorage;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reads only account files and skips what does not decrypt to an account', async () => {
    const files: Record<string, string> = {
      [hex('a')]: JSON.stringify({ id: 'alice', password: 'h' }),
      [hex('b')]: JSON.stringify({ id: 'bob', password: 'h', role: 'admin' }),
      [hex('c')]: 'not-decryptable',
      [hex('d')]: JSON.stringify({ something: 'else' }),
      'desktop-secrets.json': JSON.stringify({ id: 'x', password: 'y' }),
    };
    for (const [name, body] of Object.entries(files)) await fs.writeFile(path.join(dir, name), body);
    await fs.mkdir(path.join(dir, 'refresh-tokens'));

    const storage = { read: jest.fn((name: string) => fs.readFile(path.join(dir, name), 'utf8')) };
    const encryption = {
      decryptValue: jest.fn((v: string) => {
        if (v === 'not-decryptable') throw new Error('bad tag');
        return v;
      }),
    };
    const repo = new UserRepositoryService(encryption as any, {} as any, storage as any, {} as any);

    const users = await repo.listUsers();
    expect(users.map((u) => u.id).sort()).toEqual(['alice', 'bob']);
    expect(storage.read).not.toHaveBeenCalledWith('desktop-secrets.json');
  });

  it('returns an empty list when storage does not exist yet', async () => {
    process.env.STORAGE_PATH = path.join(dir, 'missing');
    const repo = new UserRepositoryService({} as any, {} as any, {} as any, {} as any);
    await expect(repo.listUsers()).resolves.toEqual([]);
  });
});
