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
      activelist: { active: [{ dbname: 'demodb' }] },
      dblist: { dbs: [{ dbname: 'demodb', dbdir: '/db/demodb', isProfileExists: true }] },
      haDbNames: ['demodb'],
    });
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
