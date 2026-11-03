import { busyDatabase, withDatabaseActionLock } from './database-action-lock';

describe('withDatabaseActionLock', () => {
  it('turns away a second action on a database still in progress, on the same host only', async () => {
    let release!: () => void;
    const first = withDatabaseActionLock('h:8001', ['db1'], 'startDatabase', () => new Promise<string>((r) => { release = () => r('started'); }));

    await expect(withDatabaseActionLock('h:8001', ['db1'], 'stopDatabase', async () => 'stopped'))
      .resolves.toEqual({ busy: { dbname: 'db1', action: 'startDatabase' } });
    await expect(withDatabaseActionLock('other:8001', ['db1'], 'stopDatabase', async () => 'stopped'))
      .resolves.toEqual({ result: 'stopped' });

    release();
    await expect(first).resolves.toEqual({ result: 'started' });
    expect(busyDatabase('h:8001', ['db1'])).toBeNull();
  });

  it('releases the databases when the action fails', async () => {
    await expect(withDatabaseActionLock('h:8001', ['db1', 'db2'], 'x', async () => { throw new Error('boom'); }))
      .rejects.toThrow('boom');
    expect(busyDatabase('h:8001', ['db1', 'db2'])).toBeNull();
  });

  it('holds every listed database, so a bulk action blocks a single one inside it', async () => {
    let release!: () => void;
    const bulk = withDatabaseActionLock('h:8001', ['a', 'b'], 'stopAllDatabases', () => new Promise<void>((r) => { release = r; }));

    expect(busyDatabase('h:8001', ['b'])).toEqual({ dbname: 'b', action: 'stopAllDatabases' });
    release();
    await bulk;
  });
});
