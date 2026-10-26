import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./databaseApi', () => ({
  databaseApi: {
    startDatabase: vi.fn(),
    stopDatabase: vi.fn(),
    startAllDatabases: vi.fn(),
    stopAllDatabases: vi.fn(),
    getStartInfo: vi.fn(),
  },
}));
import { databaseApi } from './databaseApi';
import reducer, {
  startDatabase, stopDatabase, startAllDatabases, stopAllDatabases, fetchDatabaseStartInfo,
} from './databaseCoreSlice';
import { restartDatabasesInBulk, groupBulkFailures, bulkResultStatusModal } from './databaseBulkActions';
import { CM } from '../../constants/cmLabels';
import { CM_KO } from '../../constants/cmLabels.ko';

beforeEach(() => vi.resetAllMocks());

describe('bulk start/stop isolate per-database failures instead of aborting the whole batch', () => {
  // Bug: "Stop All Databases" used to loop individual stopDatabase calls and
  // abort the whole operation the instant one database (e.g. one with no
  // stored login profile) failed. startAllDatabases/stopAllDatabases go
  // through the dedicated bulk endpoints instead, which already isolate
  // per-database failures server-side and report them in `failed` without
  // the request itself failing.
  it('startAllDatabases resolves (not rejects) even when some databases in the batch failed', async () => {
    databaseApi.startAllDatabases.mockResolvedValue({
      succeeded: ['demodb'],
      failed: [{ dbname: 'otherdb', error: 'Missing credentials for otherdb' }],
    });
    const store = configureStore({ reducer });

    const result = await store.dispatch(
      startAllDatabases({ hostUid: 'hostA', dbnames: ['demodb', 'otherdb'] })
    );

    expect(result.type).toBe(startAllDatabases.fulfilled.type);
    expect(result.payload.failed).toHaveLength(1);
  });

  it('stopAllDatabases resolves (not rejects) even when some databases in the batch failed', async () => {
    databaseApi.stopAllDatabases.mockResolvedValue({
      succeeded: ['demodb'],
      failed: [{ dbname: 'otherdb', error: 'Missing credentials for otherdb' }],
    });
    const store = configureStore({ reducer });

    const result = await store.dispatch(
      stopAllDatabases({ hostUid: 'hostA', dbnames: ['demodb', 'otherdb'] })
    );

    expect(result.type).toBe(stopAllDatabases.fulfilled.type);
    expect(result.payload.failed).toHaveLength(1);
  });
});

describe('a successful start/stop marks the database logged in, not just an explicit loginDatabase call', () => {
  // Bug: after "Restart All"/"Start All" silently (re-)authenticated a
  // database via the backend's own ensureDbLogin (no stored profile needed
  // beyond what's already saved), the frontend's loggedInDatabases never
  // learned about it — only the explicit loginDatabase thunk updated it.
  // That left this database's own individual Start/Stop menu item disabled
  // (gated on loggedInDatabases) even though the backend would happily
  // service it, so only the "All" actions (which don't check that gate)
  // kept working for it afterward.
  it('startDatabase.fulfilled marks (hostUid, dbname) as logged in', async () => {
    databaseApi.startDatabase.mockResolvedValue({ dblist: { dbs: [] }, activelist: { active: ['demodb'] } });
    const store = configureStore({ reducer });

    await store.dispatch(startDatabase({ hostUid: 'hostA', dbname: 'demodb' }));

    expect(store.getState().loggedInDatabases).toContain('hostA:demodb');
  });

  it('stopDatabase.fulfilled marks (hostUid, dbname) as logged in', async () => {
    databaseApi.stopDatabase.mockResolvedValue({ dblist: { dbs: [] }, activelist: { active: [] } });
    const store = configureStore({ reducer });

    await store.dispatch(stopDatabase({ hostUid: 'hostA', dbname: 'demodb' }));

    expect(store.getState().loggedInDatabases).toContain('hostA:demodb');
  });

  it('startAllDatabases.fulfilled marks every succeeded dbname as logged in, but not a failed one', async () => {
    databaseApi.startAllDatabases.mockResolvedValue({
      succeeded: ['demodb'],
      failed: [{ dbname: 'otherdb', error: 'Missing credentials for otherdb' }],
    });
    const store = configureStore({ reducer });

    await store.dispatch(startAllDatabases({ hostUid: 'hostA', dbnames: ['demodb', 'otherdb'] }));

    const { loggedInDatabases } = store.getState();
    expect(loggedInDatabases).toContain('hostA:demodb');
    expect(loggedInDatabases).not.toContain('hostA:otherdb');
  });

  it('stopAllDatabases.fulfilled marks every succeeded dbname as logged in, but not a failed one', async () => {
    databaseApi.stopAllDatabases.mockResolvedValue({
      succeeded: ['demodb'],
      failed: [{ dbname: 'otherdb', error: 'Missing credentials for otherdb' }],
    });
    const store = configureStore({ reducer });

    await store.dispatch(stopAllDatabases({ hostUid: 'hostA', dbnames: ['demodb', 'otherdb'] }));

    const { loggedInDatabases } = store.getState();
    expect(loggedInDatabases).toContain('hostA:demodb');
    expect(loggedInDatabases).not.toContain('hostA:otherdb');
  });
});

describe('Restart All: bulk stop then bulk start, each failed database reported once', () => {
  // Restart All goes through the same start-all/stop-all endpoints (and HA
  // rule) as Start/Stop All. A database with no stored login fails in both
  // phases; it must be counted and listed once, with each phase's reason.
  it('calls stopAll then startAll with the same list and tags failures with their phase', async () => {
    const calls = [];
    databaseApi.stopAllDatabases.mockImplementation(async (hostUid, dbnames) => {
      calls.push(['stop', hostUid, dbnames]);
      return { succeeded: ['demodb'], failed: [{ dbname: 'otherdb', error: 'no login' }], skipped: [] };
    });
    databaseApi.startAllDatabases.mockImplementation(async (hostUid, dbnames) => {
      calls.push(['start', hostUid, dbnames]);
      return { succeeded: ['demodb'], failed: [{ dbname: 'otherdb', error: 'no login' }], skipped: [] };
    });
    const store = configureStore({ reducer });

    const { failed, skipped } = await restartDatabasesInBulk(store.dispatch, 'hostA', ['demodb', 'otherdb']);

    expect(calls).toEqual([
      ['stop', 'hostA', ['demodb', 'otherdb']],
      ['start', 'hostA', ['demodb', 'otherdb']],
    ]);
    expect(databaseApi.stopDatabase).not.toHaveBeenCalled();
    expect(databaseApi.startDatabase).not.toHaveBeenCalled();
    expect(skipped).toEqual([]);
    expect(groupBulkFailures(failed)).toEqual([
      { dbname: 'otherdb', reasons: [{ phase: 'stop', error: 'no login' }, { phase: 'start', error: 'no login' }] },
    ]);
  });

  it('lists an HA database skipped in both phases (non-admin CMS account) once', async () => {
    const skip = { dbname: 'hadb1', reason: 'HA bulk start/stop is limited to the CMS admin account' };
    databaseApi.stopAllDatabases.mockResolvedValue({ succeeded: ['demodb'], failed: [], skipped: [skip] });
    databaseApi.startAllDatabases.mockResolvedValue({ succeeded: ['demodb'], failed: [], skipped: [skip] });
    const store = configureStore({ reducer });

    const { failed, skipped } = await restartDatabasesInBulk(store.dispatch, 'hostA', ['demodb', 'hadb1']);

    expect(failed).toEqual([]);
    expect(skipped).toEqual([skip]);
    const report = bulkResultStatusModal(CM, {
      title: CM.restartAllDatabases, failedMsg: CM.someDatabasesFailedToRestartMsg, failed, skipped,
    });
    expect(report.type).toBe('info');
    expect(report.message).toBe('1 database(s) skipped.');
  });

  it('does nothing when no database is active', async () => {
    const store = configureStore({ reducer });

    expect(await restartDatabasesInBulk(store.dispatch, 'hostA', [])).toEqual({ failed: [], skipped: [] });
    expect(databaseApi.stopAllDatabases).not.toHaveBeenCalled();
    expect(databaseApi.startAllDatabases).not.toHaveBeenCalled();
  });

  it('groupBulkFailures counts a database once and keeps every phase reason', () => {
    const grouped = groupBulkFailures([
      { dbname: 'otherdb', phase: 'stop', error: 'no login' },
      { dbname: 'demodb', phase: 'start', error: 'boom' },
      { dbname: 'otherdb', phase: 'start', error: 'no login' },
    ]);

    expect(grouped).toEqual([
      { dbname: 'otherdb', reasons: [{ phase: 'stop', error: 'no login' }, { phase: 'start', error: 'no login' }] },
      { dbname: 'demodb', reasons: [{ phase: 'start', error: 'boom' }] },
    ]);
  });
});

describe('Start All / Stop All on an HA host: HA databases skipped for a non-admin CMS account', () => {
  // Policy: a dbname-less ha_start/ha_stop is host-wide, so the backend runs
  // it only for the CMS admin account (no per-db login gate) and reports
  // every HA database as skipped for any other account.
  const skipped = [
    { dbname: 'hadb1', reason: 'HA bulk start/stop is limited to the CMS admin account' },
    { dbname: 'hadb2', reason: 'HA bulk start/stop is limited to the CMS admin account' },
  ];

  it('reports skipped databases on their own (info, not error), in a separate table', () => {
    const report = bulkResultStatusModal(CM, {
      title: CM.startAllDatabases, failedMsg: CM.someDatabasesFailedToStartMsg, failed: [], skipped,
    });

    expect(report.type).toBe('info');
    expect(report.message).toBe('2 database(s) skipped.');
    expect(report.tables.map((tb) => tb.variant)).toEqual(['skipped']);
    expect(report.tables[0].rows.map((r) => r.name)).toEqual(['hadb1', 'hadb2']);
  });

  it('reports both failures and skips when both happened (localized)', () => {
    const report = bulkResultStatusModal(CM_KO, {
      title: CM_KO.stopAllDatabases,
      failedMsg: CM_KO.someDatabasesFailedToStopMsg,
      failed: [{ dbname: 'otherdb', error: 'boom' }],
      skipped: [skipped[0]],
    });

    expect(report.type).toBe('error');
    expect(report.message).toBe('1개의 데이터베이스를 중지하지 못했습니다. 1개의 데이터베이스를 건너뛰었습니다.');
    expect(report.tables.map((tb) => [tb.variant, tb.rows])).toEqual([
      ['failed', [{ name: 'otherdb', reasons: [{ phase: undefined, reason: 'boom' }] }]],
      ['skipped', [{ name: 'hadb1', reasons: [{ reason: 'HA 일괄 시작/중지는 CMS admin 계정으로만 할 수 있습니다' }] }]],
    ]);
  });

  it('does not mark an HA database logged in from a bulk success (host-wide ha_start skips the db login)', async () => {
    databaseApi.getStartInfo.mockResolvedValue({
      dblist: { dbs: [{ dbname: 'hadb1' }, { dbname: 'demodb' }] },
      activelist: { active: [] },
      haDbNames: ['hadb1'],
    });
    databaseApi.startAllDatabases.mockResolvedValue({ succeeded: ['hadb1', 'demodb'], failed: [], skipped: [] });
    const store = configureStore({ reducer });
    await store.dispatch(fetchDatabaseStartInfo('hostA'));

    await store.dispatch(startAllDatabases({ hostUid: 'hostA', dbnames: ['hadb1', 'demodb'] }));

    const { loggedInDatabases } = store.getState();
    expect(loggedInDatabases).toContain('hostA:demodb');
    expect(loggedInDatabases).not.toContain('hostA:hadb1');
  });
});
