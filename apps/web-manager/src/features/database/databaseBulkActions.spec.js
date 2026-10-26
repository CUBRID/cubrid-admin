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
import { restartDatabasesIndividually, groupBulkFailures, bulkOutcomeMessages } from './databaseBulkActions';
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

describe('Restart All restarts only the requested databases and reports each failed one once', () => {
  // Bug: Restart All went through the start-all endpoint, which on an HA
  // host runs a bulk ha_start over every ha_db_list entry regardless of the
  // dbnames passed — so an HA database stopped on purpose came back up. A
  // database with no stored login also failed both phases and was then
  // counted and listed twice.
  it('stops then starts each requested database individually, never via the bulk endpoints', async () => {
    databaseApi.stopDatabase.mockResolvedValue({ dblist: { dbs: [] }, activelist: { active: [] } });
    databaseApi.startDatabase.mockResolvedValue({ dblist: { dbs: [] }, activelist: { active: ['hadb1'] } });
    const store = configureStore({ reducer });

    const { failed } = await restartDatabasesIndividually(store.dispatch, 'hostA', ['hadb1']);

    expect(failed).toEqual([]);
    expect(databaseApi.stopDatabase).toHaveBeenCalledWith('hostA', 'hadb1');
    expect(databaseApi.startDatabase).toHaveBeenCalledWith('hostA', 'hadb1');
    expect(databaseApi.startDatabase).toHaveBeenCalledTimes(1);
    expect(databaseApi.startAllDatabases).not.toHaveBeenCalled();
    expect(databaseApi.stopAllDatabases).not.toHaveBeenCalled();
  });

  it('continues past a failed stop and does not start a database confirmed still running', async () => {
    databaseApi.stopDatabase.mockImplementation(async (hostUid, dbname) => {
      if (dbname === 'otherdb') throw { response: { data: { message: 'Missing credentials for otherdb' } } };
      return { dblist: { dbs: [] }, activelist: { active: [] } };
    });
    databaseApi.getStartInfo.mockResolvedValue({ dblist: { dbs: [] }, activelist: { active: ['otherdb'] } });
    databaseApi.startDatabase.mockResolvedValue({ dblist: { dbs: [] }, activelist: { active: ['demodb'] } });
    const store = configureStore({ reducer });

    const { failed } = await restartDatabasesIndividually(store.dispatch, 'hostA', ['otherdb', 'demodb']);

    expect(failed).toEqual([{ dbname: 'otherdb', phase: 'stop', error: 'Missing credentials for otherdb' }]);
    expect(databaseApi.startDatabase).toHaveBeenCalledTimes(1);
    expect(databaseApi.startDatabase).toHaveBeenCalledWith('hostA', 'demodb');
  });

  // Re-review: a rejected stop doesn't prove the database is still running —
  // the server only reads start info after the stop command succeeded, so if
  // that lookup (and the thunk's own re-check) fails, the database is down
  // and skipping its start would leave it down after "Restart All".
  it('starts a database whose stop was rejected but which a re-check shows stopped', async () => {
    databaseApi.stopDatabase.mockRejectedValue({ response: { data: { message: 'startinfo failed' } } });
    databaseApi.getStartInfo
      .mockRejectedValueOnce({ response: { data: { message: 'startinfo failed' } } })
      .mockResolvedValue({ dblist: { dbs: [] }, activelist: { active: [] } });
    databaseApi.startDatabase.mockResolvedValue({ dblist: { dbs: [] }, activelist: { active: ['demodb'] } });
    const store = configureStore({ reducer });

    const { failed } = await restartDatabasesIndividually(store.dispatch, 'hostA', ['demodb']);

    expect(failed).toEqual([]);
    expect(databaseApi.startDatabase).toHaveBeenCalledWith('hostA', 'demodb');
  });

  it('still starts a database whose stop was rejected when its state cannot be re-checked', async () => {
    databaseApi.stopDatabase.mockRejectedValue({ response: { data: { message: 'startinfo failed' } } });
    databaseApi.getStartInfo.mockRejectedValue({ response: { data: { message: 'startinfo failed' } } });
    databaseApi.startDatabase.mockResolvedValue({ dblist: { dbs: [] }, activelist: { active: ['demodb'] } });
    const store = configureStore({ reducer });

    const { failed } = await restartDatabasesIndividually(store.dispatch, 'hostA', ['demodb']);

    expect(databaseApi.startDatabase).toHaveBeenCalledWith('hostA', 'demodb');
    expect(failed).toEqual([{ dbname: 'demodb', phase: 'stop', error: 'startinfo failed' }]);
  });

  it('records a failed start tagged with its phase', async () => {
    databaseApi.stopDatabase.mockResolvedValue({ dblist: { dbs: [] }, activelist: { active: [] } });
    databaseApi.startDatabase.mockRejectedValue({ response: { data: { message: 'boom' } } });
    const store = configureStore({ reducer });

    const { failed } = await restartDatabasesIndividually(store.dispatch, 'hostA', ['demodb']);

    expect(failed).toEqual([{ dbname: 'demodb', phase: 'start', error: 'boom' }]);
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

  it('reports skipped databases on their own, not as a failure', () => {
    const { failedText, skippedText } = bulkOutcomeMessages(
      CM, { succeeded: ['demodb'], failed: [], skipped }, CM.someDatabasesFailedToStartMsg
    );

    expect(failedText).toBe('');
    expect(skippedText).toBe(
      '2 database(s) skipped: hadb1, hadb2 (HA bulk start/stop requires the CMS admin account).'
    );
  });

  it('reports both failures and skips when both happened', () => {
    const { failedText, skippedText } = bulkOutcomeMessages(
      CM_KO,
      { succeeded: [], failed: [{ dbname: 'otherdb', error: 'boom' }], skipped: [skipped[0]] },
      CM_KO.someDatabasesFailedToStopMsg
    );

    expect(failedText).toBe('1개의 데이터베이스를 중지하지 못했습니다. 실패: otherdb (boom).');
    expect(skippedText).toBe(
      '1개의 데이터베이스를 건너뛰었습니다: hadb1 (HA 일괄 시작/중지는 CMS admin 계정으로만 할 수 있습니다).'
    );
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
