import { mapStartInfoToClientResponse } from './start-info.mapper';
import type { StartInfoCmsResponse } from '@type/cms-response';

describe('mapStartInfoToClientResponse', () => {
  it('maps dbs and computes isProfileExists from dbProfiles', () => {
    const cmsStart = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'startinfo',
      dblist: [{ dbs: [{ dbname: 'demodb', dbdir: '/db/demodb' }] }],
      activelist: [{ active: [{ dbname: 'demodb' }] }],
    } as StartInfoCmsResponse;

    const result = mapStartInfoToClientResponse(
      cmsStart,
      { demodb: { id: 'dba', password: 'pw' } },
      ['demodb']
    );

    expect(result).toEqual({
      activelist: { active: [{ dbname: 'demodb', isLoggedIn: false }] },
      dblist: { dbs: [{ dbname: 'demodb', dbdir: '/db/demodb', isProfileExists: true, isLoggedIn: false }] },
      haDbNames: ['demodb'],
    });
  });

  it('sets isLoggedIn on every dblist and activelist entry from the predicate', () => {
    const cmsStart = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'startinfo',
      dblist: [{ dbs: [{ dbname: 'demodb', dbdir: '/db/demodb' }, { dbname: 'otherdb', dbdir: '/db/otherdb' }] }],
      // hadb is active but missing from dblist (HA replica) — still flagged.
      activelist: [{ active: [{ dbname: 'demodb' }, { dbname: 'hadb' }] }],
    } as StartInfoCmsResponse;

    const result = mapStartInfoToClientResponse(cmsStart, {}, [], (dbname) => dbname !== 'otherdb');

    expect(result.dblist.dbs.map((d) => [d.dbname, d.isLoggedIn])).toEqual([['demodb', true], ['otherdb', false]]);
    expect(result.activelist.active).toEqual([
      { dbname: 'demodb', isLoggedIn: true },
      { dbname: 'hadb', isLoggedIn: true },
    ]);
  });

  it('returns empty arrays when cms lists are missing', () => {
    const cmsStart = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'startinfo',
      dblist: [],
      activelist: [],
    } as unknown as StartInfoCmsResponse;

    const result = mapStartInfoToClientResponse(cmsStart, undefined);

    expect(result).toEqual({
      activelist: { active: [] },
      dblist: { dbs: [] },
      haDbNames: [],
    });
  });
});
