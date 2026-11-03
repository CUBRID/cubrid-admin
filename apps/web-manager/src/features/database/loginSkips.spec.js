import { describe, expect, it } from 'vitest';
import { autoStartServers, haModeOn, loginSkipsOf, restartLoginSkips, serviceDatabases, serviceStartTargets, serviceStopTargets, startInfoDatabases } from './loginSkips';
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

  it('counts only non-HA databases as service start and stop targets', () => {
    expect(serviceStartTargets(databases, autoStart)).toEqual(['auto_off_nologin']);
    expect(serviceStopTargets([...databases, db('ha_on', true, false, { isHa: true })])).toEqual(['auto_on', 'auto_on_nologin', 'manual_nologin']);
  });

  it('names the running databases not logged in as kept running, and the stopped autostart ones as not started; never HA ones', () => {
    expect(restartLoginSkips(databases, autoStart)).toEqual({
      keepsRunning: ['manual_nologin', 'auto_on_nologin'],
      notStarted: ['auto_off_nologin'],
    });
  });

  it('names nothing when every database is logged in', () => {
    expect(restartLoginSkips([db('a', true, true), db('b', false, true)], new Set(['b']))).toEqual({ keepsRunning: [], notStarted: [] });
  });
});

describe('HA node for a service action', () => {
  it.each([
    [['[common]', 'ha_mode=on'], true],
    [['[common]', 'HA_MODE = replica  # standby'], true],
    [['[common]', 'ha_mode=off'], false],
    [['[common]', 'ha_mode=no'], false],
    [['[common]', 'data_buffer_size=512M'], false],
    [['[service]', 'ha_mode=on'], false],
  ])('reads ha_mode from [common] as the engine does: %j -> %s', (lines, expected) => {
    expect(haModeOn(lines)).toBe(expected);
  });

  it('treats ha_db_list databases as plain ones when the host is not an HA node', () => {
    const databases = [
      { dbname: 'ha1', running: true, isHa: true, loggedIn: false, loggedOut: false },
      { dbname: 'db1', running: false, isHa: false, loggedIn: false, loggedOut: false },
    ];
    expect(serviceDatabases(databases, true)).toBe(databases);
    const plain = serviceDatabases(databases, false);
    expect(plain.map((db) => db.isHa)).toEqual([false, false]);
    expect(serviceStopTargets(plain)).toEqual(['ha1']);
    expect(restartLoginSkips(plain, new Set(['db1']))).toEqual({ keepsRunning: ['ha1'], notStarted: ['db1'] });
  });
});
