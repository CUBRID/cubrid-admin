import { Test, TestingModule } from '@nestjs/testing';
import type { GetEnvClientResponse } from '@api-interfaces';
import { CMS_CONFNAME_HACONF } from '@database/database.constants';
import { DatabaseInfoService } from './database-info.service';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { CmsConfigService } from '@cms-config/cms-config.service';
import { CmsError } from '@error/cms/cms-error';
import { failureDetails } from '@error/index';
import { DatabaseUserService } from '../user/database-user.service';

// Real GetEnv values (e.g. BROKERVER, CUBRIDVER) vary by host; tests use fixed mock data only.
const mockGetEnvForCreatedb: GetEnvClientResponse = {
  BROKERVER: '11.4',
  CUBRID: '/opt/cubrid',
  CUBRIDVER: '11.4',
  CUBRID_DATABASES: '/opt/cubrid/databases',
  CUBRID_DBMT: '',
  HOSTMONTAB0: '',
  HOSTMONTAB1: '',
  HOSTMONTAB2: '',
  HOSTMONTAB3: '',
  osinfo: 'Linux',
  paramSchemas: { database: [], broker: [], knownKeys: { strict: false, catalogVersion: null, database: [], broker: [], databaseGuards: {} } },
};

jest.mock('@common', () => ({
  ...jest.requireActual('@common'),
  checkCmsTokenError: jest.fn(),
  checkCmsStatusError: jest.fn(),
}));

describe('DatabaseInfoService', () => {
  let service: DatabaseInfoService;
  let hostService: jest.Mocked<HostService>;
  let cmsClient: jest.Mocked<CmsHttpsClientService>;
  let cmsConfigService: jest.Mocked<CmsConfigService>;
  let databaseUserService: { isDbLoginActive: jest.Mock; isDbLoginRestoring: jest.Mock };

  const mockHost = {
    uid: 'host-uid-1',
    id: 'host-1',
    address: 'localhost',
    port: 8001,
    password: 'host-password',
    token: 'test-token',
    initialLogin: false,
    alias: 'host-1',
    dbProfiles: {},
  };

  const mockUserId = 'user-123';
  const mockHostUid = 'host-uid-1';

  beforeEach(async () => {
    const mockHostService = { findHostInternal: jest.fn() };
    const mockCmsClient = { postAuthenticated: jest.fn() };
    const mockCmsConfigService = {
      getEnv: jest.fn(),
      getAllSystemParam: jest.fn().mockResolvedValue({
        conflist: [{ confdata: ['[common]', 'ha_db_list='] }],
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseInfoService,
        { provide: HostService, useValue: mockHostService },
        { provide: CmsHttpsClientService, useValue: mockCmsClient },
        { provide: CmsConfigService, useValue: mockCmsConfigService },
        { provide: DatabaseUserService, useValue: { isDbLoginActive: jest.fn().mockReturnValue(false), isDbLoginRestoring: jest.fn().mockReturnValue(false) } },
      ],
    }).compile();

    service = module.get(DatabaseInfoService);
    hostService = module.get(HostService);
    cmsClient = module.get(CmsHttpsClientService);
    cmsConfigService = module.get(CmsConfigService);
    databaseUserService = module.get(DatabaseUserService);

    hostService.findHostInternal.mockResolvedValue(mockHost);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startInfoInternal', () => {
    it('should return raw CMS startinfo response', async () => {
      const mockResponse = {
        __EXEC_TIME: '10 ms',
        note: 'none',
        status: 'success',
        task: 'startinfo',
        dblist: [{ dbs: [{ dbname: 'testdb' }] }],
        activelist: [{ active: [] }],
      };
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.startInfoInternal(mockUserId, mockHostUid);

      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: 'startinfo' })
      );
      expect(result).toEqual(mockResponse);
    });

    const startInfoResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'startinfo',
      dblist: [{ dbs: [{ dbname: 'testdb' }] }],
      activelist: [{ active: [] }],
    };
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    it('shares a startinfo request still in flight for the same user and host, then reads again', async () => {
      let finishFirst: (value: unknown) => void = () => undefined;
      cmsClient.postAuthenticated
        .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
        .mockResolvedValue(startInfoResponse);

      const first = service.startInfoInternal(mockUserId, mockHostUid);
      const second = service.startInfoInternal(mockUserId, mockHostUid);
      await settle();
      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(1);

      finishFirst(startInfoResponse);
      await expect(Promise.all([first, second])).resolves.toEqual([startInfoResponse, startInfoResponse]);

      // Settled results are not kept: a later read sends its own request.
      await service.startInfoInternal(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(2);
    });

    it('does not share across users or hosts', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(startInfoResponse);

      await Promise.all([
        service.startInfoInternal(mockUserId, mockHostUid),
        service.startInfoInternal('other-user', mockHostUid),
        service.startInfoInternal(mockUserId, 'other-host'),
      ]);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(3);
    });

    it('fails every caller that joined a failed request, and a later read can succeed', async () => {
      cmsClient.postAuthenticated
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValue(startInfoResponse);

      const first = service.startInfoInternal(mockUserId, mockHostUid);
      const second = service.startInfoInternal(mockUserId, mockHostUid);
      await expect(first).rejects.toBeDefined();
      await expect(second).rejects.toBeDefined();

      await expect(service.startInfoInternal(mockUserId, mockHostUid)).resolves.toEqual(startInfoResponse);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledTimes(2);
    });

    it('should throw CmsError when CMS status is not success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        status: 'fail',
        task: 'startinfo',
        note: 'failed',
      });

      await expect(
        service.startInfoInternal(mockUserId, mockHostUid)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('startInfo', () => {
    it('should return client start info with isProfileExists', async () => {
      const mockCmsResponse = {
        __EXEC_TIME: '10 ms',
        note: 'none',
        status: 'success',
        task: 'startinfo',
        dblist: [{ dbs: [{ dbname: 'testdb', dbdir: '/path' }] }],
        activelist: [{ active: [{ dbname: 'testdb' }] }],
      };
      cmsClient.postAuthenticated.mockResolvedValue(mockCmsResponse);

      const result = await service.startInfo(mockUserId, mockHostUid);

      expect(cmsConfigService.getAllSystemParam).toHaveBeenCalledWith(
        mockUserId,
        mockHostUid,
        CMS_CONFNAME_HACONF
      );
      expect(result).toEqual({
        activelist: { active: [{ dbname: 'testdb', isProfileExists: false, isLoggedIn: false, isLoggedOut: false }] },
        dblist: {
          dbs: [{ dbname: 'testdb', dbdir: '/path', isProfileExists: false, isLoggedIn: false, isLoggedOut: false }],
        },
        haDbNames: [],
      });
    });

    it('reports isLoggedIn from the server-side DB login state for the current host token', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '10 ms',
        note: 'none',
        status: 'success',
        task: 'startinfo',
        dblist: [{ dbs: [{ dbname: 'testdb', dbdir: '/path' }, { dbname: 'otherdb', dbdir: '/path2' }] }],
        activelist: [{ active: [{ dbname: 'testdb' }] }],
      });
      databaseUserService.isDbLoginActive.mockImplementation((_u, _h, dbname) => dbname === 'testdb');

      const result = await service.startInfo(mockUserId, mockHostUid);

      expect(databaseUserService.isDbLoginActive).toHaveBeenCalledWith(mockUserId, mockHostUid, 'testdb', 'test-token');
      expect(result.dblist.dbs.map((d) => [d.dbname, d.isLoggedIn])).toEqual([['testdb', true], ['otherdb', false]]);
      expect(result.activelist.active).toEqual([{ dbname: 'testdb', isProfileExists: false, isLoggedIn: true, isLoggedOut: false }]);
    });

    it('reports a database whose login is being restored after a host login as logged in', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '10 ms',
        note: 'none',
        status: 'success',
        task: 'startinfo',
        dblist: [{ dbs: [{ dbname: 'testdb', dbdir: '/path' }] }],
        activelist: [{ active: [{ dbname: 'testdb' }] }],
      });
      databaseUserService.isDbLoginRestoring.mockImplementation((_u, _h, dbname) => dbname === 'testdb');

      const result = await service.startInfo(mockUserId, mockHostUid);

      expect(result.dblist.dbs[0].isLoggedIn).toBe(true);
    });
  });

  describe('HA databases (getHaDbNames, getHaNodeState, effectiveHaDbForDbname)', () => {
    type SysParam = Awaited<ReturnType<CmsConfigService['getAllSystemParam']>>;
    // cubrid.conf with `ha_mode` (none when null), cubrid_ha.conf with
    // `ha_db_list`, or an unreadable cubrid_ha.conf when it is an Error.
    const confs = (haMode: string | null, haDbList: string | Error = 'hadb1,hadb2') => async (_u: string, _h: string, confname: string) => {
      if (confname === CMS_CONFNAME_HACONF && haDbList instanceof Error) throw haDbList;
      return {
        conflist: [{
          confdata: confname === CMS_CONFNAME_HACONF
            ? ['[common]', `ha_db_list=${haDbList}`]
            : ['[common]', ...(haMode === null ? [] : [`ha_mode=${haMode}`]), '[service]', 'service=server'],
        }],
      } as SysParam;
    };

    it.each(['on', 'replica', 'ON'])('are the ha_db_list databases when ha_mode is %s', async (haMode) => {
      cmsConfigService.getAllSystemParam.mockImplementation(confs(haMode));
      expect([...(await service.getHaDbNames(mockUserId, mockHostUid))].sort()).toEqual(['hadb1', 'hadb2']);
      expect(await service.getHaNodeState(mockUserId, mockHostUid)).toEqual({
        haNode: true,
        haDbNames: new Set(['hadb1', 'hadb2']),
        haConfFailure: null,
      });
    });

    it.each(['off', 'no', '', null])('are none when ha_mode is %j, since the engine refuses heartbeat then', async (haMode) => {
      cmsConfigService.getAllSystemParam.mockImplementation(confs(haMode));
      expect([...(await service.getHaDbNames(mockUserId, mockHostUid))]).toEqual([]);
      expect(await service.getHaNodeState(mockUserId, mockHostUid)).toEqual({ haNode: false, haDbNames: new Set(), haConfFailure: null });
      expect(await service.effectiveHaDbForDbname(mockUserId, mockHostUid, 'hadb1')).toBe(false);
      expect(cmsConfigService.getAllSystemParam).not.toHaveBeenCalledWith(mockUserId, mockHostUid, CMS_CONFNAME_HACONF);
    });

    it('split ha_db_list on spaces, commas and colons, as the engine does', async () => {
      cmsConfigService.getAllSystemParam.mockImplementation(confs('on', 'hadb1 hadb2:hadb3,,hadb4'));
      expect([...(await service.getHaDbNames(mockUserId, mockHostUid))].sort()).toEqual(['hadb1', 'hadb2', 'hadb3', 'hadb4']);
    });

    it('keep an unreadable cubrid_ha.conf on an HA node as haConfFailure, so the node-wide request still goes out', async () => {
      const readError = CmsError.RequestFailed({ message: 'cannot open cubrid_ha.conf' });
      cmsConfigService.getAllSystemParam.mockImplementation(confs('on', readError));
      expect(await service.getHaNodeState(mockUserId, mockHostUid)).toEqual({
        haNode: true,
        haDbNames: new Set(),
        haConfFailure: failureDetails(readError),
      });
    });

    it('tell whether one database is an HA database: in ha_db_list on an HA node', async () => {
      cmsConfigService.getAllSystemParam.mockImplementation(confs('on', 'demodb,testdb'));
      expect(await service.effectiveHaDbForDbname(mockUserId, mockHostUid, 'testdb')).toBe(true);
      expect(await service.effectiveHaDbForDbname(mockUserId, mockHostUid, 'otherdb')).toBe(false);
      cmsConfigService.getAllSystemParam.mockImplementation(confs('on', ''));
      expect(await service.effectiveHaDbForDbname(mockUserId, mockHostUid, 'testdb')).toBe(false);
    });
  });

  describe('getCreatedbInfo', () => {
    it('should return create info from env', async () => {
      cmsConfigService.getEnv.mockResolvedValue(mockGetEnvForCreatedb);

      const result = await service.getCreatedbInfo(mockUserId, mockHostUid);

      expect(cmsConfigService.getEnv).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(result).toEqual({
        defaultDbDirectory: '/opt/cubrid/databases',
        cubridVersion: '11.4', // Matches mock CUBRIDVER; not tied to any real deployment version
        cubridPath: '/opt/cubrid',
      });
    });
  });
});
