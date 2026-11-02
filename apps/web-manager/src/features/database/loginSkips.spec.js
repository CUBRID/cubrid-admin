import { describe, expect, it } from 'vitest';
import { autoStartServers, loginSkipsOf, startInfoDatabases } from './loginSkips';
import { serviceSkippedTable } from './databaseBulkActions';
import { CM } from '../../constants/cmLabels';

const info = {
  dblist: { dbs: [
    { dbname: 'a', isLoggedIn: true, isLoggedOut: false },
    { dbname: 'b', isLoggedIn: false, isLoggedOut: true },
    { dbname: 'c', isLoggedIn: false, isLoggedOut: false },
  ] },
  // `ha1` is running but missing from dblist.
  activelist: { active: [{ dbname: 'a', isLoggedIn: true }, { dbname: 'ha1', isLoggedIn: false, isLoggedOut: true }] },
  haDbNames: ['ha1'],
};

describe('startInfoDatabases', () => {
  it('lists dblist and active-only databases once, with run, HA and login state', () => {
    expect(startInfoDatabases(info)).toEqual([
      { dbname: 'a', running: true, isHa: false, loggedIn: true, loggedOut: false },
      { dbname: 'b', running: false, isHa: false, loggedIn: false, loggedOut: true },
      { dbname: 'c', running: false, isHa: false, loggedIn: false, loggedOut: false },
      { dbname: 'ha1', running: true, isHa: true, loggedIn: false, loggedOut: true },
    ]);
  });
});

describe('loginSkipsOf', () => {
  it('splits the targets that are not logged in by why, leaving logged-in and unknown ones out', () => {
    expect(loginSkipsOf(startInfoDatabases(info), ['a', 'b', 'c', 'ha1', 'gone'])).toEqual({
      loggedOut: ['b', 'ha1'],
      notLoggedIn: ['c'],
      count: 3,
    });
  });
});

describe('autoStartServers', () => {
  it('reads server= from [service] only when service= includes server', () => {
    expect(autoStartServers(['[service]', 'service=server,broker', 'server="a, b"', '[common]', 'server=x'])).toEqual(['a', 'b']);
    expect(autoStartServers(['[service]', 'service=broker', 'server=a'])).toEqual([]);
  });

  it('reads the conf as the engine does: key case, trailing comments, continued lines, the last server=', () => {
    expect(autoStartServers(['[Service]', 'SERVICE=server,broker', 'server=old', 'Server=a,\\', 'b c:d # comment'])).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('serviceSkippedTable', () => {
  it('says a database skipped at the stop kept running and one skipped at the start stayed stopped', () => {
    const table = serviceSkippedTable(CM, [
      { name: 'x', reason: 'Not logged in', phase: 'stop' },
      { name: 'y', reason: 'Logged out', phase: 'start' },
    ], 'restart');
    expect(table.rows).toEqual([
      { name: 'x', reasons: [{ reason: `Not logged in · ${CM.skippedStillRunning}` }] },
      { name: 'y', reasons: [{ reason: `Logged out · ${CM.skippedStoppedNotStarted}` }] },
    ]);
  });
});
