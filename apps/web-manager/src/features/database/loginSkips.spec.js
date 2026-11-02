import { describe, expect, it } from 'vitest';
import { autoStartServers, loginSkipsOf, restartLoginSkips, serviceStartTargets, startInfoDatabases } from './loginSkips';
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

describe('service restart skips', () => {
  const db = (dbname, running, loggedIn, extra = {}) => ({ dbname, running, isHa: false, loggedIn, loggedOut: false, ...extra });
  const databases = [
    db('auto_on', true, true),
    db('auto_on_nologin', true, false),
    db('manual_nologin', true, false, { loggedOut: true }),
    db('auto_off_nologin', false, false),
    db('ha_off_nologin', false, false, { isHa: true }),
    db('other_off_nologin', false, false),
  ];
  const autoStart = new Set(['auto_on', 'auto_on_nologin', 'auto_off_nologin']);

  it('brings up the stopped autostart and HA databases on a service start', () => {
    expect(serviceStartTargets(databases, autoStart)).toEqual(['auto_off_nologin', 'ha_off_nologin']);
  });

  it('names the running databases not logged in as kept running, and the stopped ones the start would bring up as not started', () => {
    expect(restartLoginSkips(databases, autoStart)).toEqual({
      keepsRunning: ['manual_nologin', 'auto_on_nologin'],
      notStarted: ['auto_off_nologin', 'ha_off_nologin'],
    });
  });

  it('names nothing when every database is logged in', () => {
    expect(restartLoginSkips([db('a', true, true), db('b', false, true)], new Set(['b']))).toEqual({ keepsRunning: [], notStarted: [] });
  });
});
