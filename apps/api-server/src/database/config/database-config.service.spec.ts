import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseConfigService } from './database-config.service';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { CmsConfigService } from '@cms-config/cms-config.service';
import { DatabaseUserService } from '@database/user/database-user.service';
import { HostError } from '@error/index';
import { CmsError } from '@error/cms/cms-error';

describe('DatabaseConfigService', () => {
  let service: DatabaseConfigService;
  let hostService: jest.Mocked<HostService>;
  let cmsClient: jest.Mocked<CmsHttpsClientService>;
  let cmsConfigService: jest.Mocked<CmsConfigService>;

  const mockHost = {
    uid: 'host-uid-1',
    id: 'host-1',
    address: 'localhost',
    port: 8001,
    password: 'host-password',
    initialLogin: false,
    token: 'test-token',
    alias: 'host-1',
    dbProfiles: {},
  };

  const mockUserId = 'user-123';
  const mockHostUid = 'host-uid-1';
  const mockDbname = 'testdb';

  beforeEach(async () => {
    const mockHostService = {
      findHostInternal: jest.fn(),
    };

    const mockCmsClient = {
      postAuthenticated: jest.fn(),
    };

    const mockCmsConfigService = {
      getAllSystemParam: jest.fn(),
      setSystemParam: jest.fn(),
    };

    const mockDatabaseUserService = {
      ensureDbLogin: jest.fn().mockResolvedValue({ reauthenticated: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseConfigService,
        {
          provide: HostService,
          useValue: mockHostService,
        },
        {
          provide: CmsHttpsClientService,
          useValue: mockCmsClient,
        },
        {
          provide: CmsConfigService,
          useValue: mockCmsConfigService,
        },
        {
          provide: DatabaseUserService,
          useValue: mockDatabaseUserService,
        },
      ],
    }).compile();

    service = module.get<DatabaseConfigService>(DatabaseConfigService);
    hostService = module.get(HostService);
    cmsClient = module.get(CmsHttpsClientService);
    cmsConfigService = module.get(CmsConfigService);

    // Setup default mocks
    hostService.findHostInternal.mockResolvedValue(mockHost);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setAutoExecQuery', () => {
    const mockRequest = {
      dbname: mockDbname,
      planlist: [
        {
          queryplan: [],
        },
      ],
    };

    const mockResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'setautoexecquery',
    };

    it('should successfully set auto exec query', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.setAutoExecQuery(
        mockUserId,
        mockHostUid,
        mockDbname,
        mockRequest
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'setautoexecquery',
          dbname: mockDbname,
          planlist: mockRequest.planlist.map((item) => ({ ...item, dbname: mockDbname })),
        })
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('getAutoExecQuery', () => {
    const mockResponse = {
      __EXEC_TIME: '10 ms',
      note: 'none',
      status: 'success',
      task: 'getautoexecquery',
      planlist: [],
    };

    it('should successfully get auto exec query', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.getAutoExecQuery(mockUserId, mockHostUid, mockDbname);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'getautoexecquery',
          dbname: mockDbname,
        })
      );
      expect(result).toEqual({ planlist: [] });
    });

    it('should return empty planlist when CMS response has no planlist', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '10 ms',
        note: 'none',
        status: 'success',
        task: 'getautoexecquery',
      });

      const result = await service.getAutoExecQuery(mockUserId, mockHostUid, mockDbname);
      expect(result).toEqual({ planlist: [] });
    });

    it('should return empty queryplan when a plan has invalid queryplan', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '10 ms',
        note: 'none',
        status: 'success',
        task: 'getautoexecquery',
        planlist: [{ dbname: 'testdb', queryplan: null }],
      });

      const result = await service.getAutoExecQuery(mockUserId, mockHostUid, mockDbname);
      expect(result).toEqual({
        planlist: [{ dbname: 'testdb', queryplan: [] }],
      });
    });
  });

  describe('getClassInfo', () => {
    const mockRequest = {
      dbstatus: 'off' as const,
    };

    const mockResponse = {
      __EXEC_TIME: '2510 ms',
      dbname: 'empty',
      note: 'none',
      status: 'success',
      task: 'classinfo',
      systemclass: [
        {
          class: [
            {
              classname: 'db_root',
              owner: 'DBA',
              virtual: 'normal',
            },
            {
              classname: 'db_user',
              owner: 'DBA',
              virtual: 'normal',
            },
          ],
        },
      ],
      userclass: [
        {
          class: [
            {
              classname: 'dba.test',
              owner: 'DBA',
              virtual: 'normal',
            },
            {
              classname: 'dba.test2',
              owner: 'DBA',
              virtual: 'normal',
            },
          ],
        },
      ],
    };

    it('should successfully get class info', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.getClassInfo(
        mockUserId,
        mockHostUid,
        mockDbname,
        mockRequest
      );

      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        expect.objectContaining({
          task: 'classinfo',
          token: mockHost.token,
          dbname: mockDbname,
          dbstatus: 'off',
        })
      );
      expect(result).toEqual({
        dbname: 'empty',
        systemclass: mockResponse.systemclass,
        userclass: mockResponse.userclass,
      });
    });

    it('should successfully get class info with dbstatus on', async () => {
      const requestWithOn = {
        dbstatus: 'on' as const,
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockResponse);

      const result = await service.getClassInfo(
        mockUserId,
        mockHostUid,
        mockDbname,
        requestWithOn
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'classinfo',
          dbname: mockDbname,
          dbstatus: 'on',
        })
      );
      expect(result).toEqual({
        dbname: 'empty',
        systemclass: mockResponse.systemclass,
        userclass: mockResponse.userclass,
      });
    });

    it('should throw HostError when host is not found', async () => {
      hostService.findHostInternal.mockRejectedValue(
        HostError.NoSuchHost({ hostUid: mockHostUid })
      );

      await expect(
        service.getClassInfo(mockUserId, mockHostUid, mockDbname, mockRequest)
      ).rejects.toThrow(HostError);

      expect(cmsClient.postAuthenticated).not.toHaveBeenCalled();
    });

    it('should throw CmsError when CMS request fails', async () => {
      const cmsError = CmsError.RequestFailed({
        status: 500,
        data: { message: 'Internal server error' },
      });

      cmsClient.postAuthenticated.mockRejectedValue(cmsError);

      await expect(
        service.getClassInfo(mockUserId, mockHostUid, mockDbname, mockRequest)
      ).rejects.toThrow(CmsError);
    });

    it('should throw CmsError when CMS token error is detected', async () => {
      const invalidTokenResponse = {
        __EXEC_TIME: '0 ms',
        note: 'Request is rejected due to invalid token. Please reconnect.',
        status: 'failed',
        task: 'classinfo',
      };

      cmsClient.postAuthenticated.mockResolvedValue(invalidTokenResponse);

      await expect(
        service.getClassInfo(mockUserId, mockHostUid, mockDbname, mockRequest)
      ).rejects.toThrow(CmsError);
    });

    it('should throw CmsError when CMS status error is detected', async () => {
      const failedResponse = {
        __EXEC_TIME: '0 ms',
        note: 'Class info failed',
        status: 'failed',
        task: 'classinfo',
      };

      cmsClient.postAuthenticated.mockResolvedValue(failedResponse);

      await expect(
        service.getClassInfo(mockUserId, mockHostUid, mockDbname, mockRequest)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('getAutoAddVol', () => {
    const mockGetAutoAddVolResponse = {
      __EXEC_TIME: '0 ms',
      data: 'ON',
      data_ext_page: '32768',
      data_warn_outofspace: '0.15',
      index: 'ON',
      index_ext_page: '32768',
      index_warn_outofspace: '0.15',
      note: 'none',
      status: 'success',
      task: 'getautoaddvol',
    };

    it('should return auto-add vol config on success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(mockGetAutoAddVolResponse);

      const result = await service.getAutoAddVol(mockUserId, mockHostUid, mockDbname);

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'getautoaddvol',
          dbname: mockDbname,
          token: mockHost.token,
        })
      );
      expect(result).toEqual({
        data: 'ON',
        data_ext_page: '32768',
        data_warn_outofspace: '0.15',
        index: 'ON',
        index_ext_page: '32768',
        index_warn_outofspace: '0.15',
      });
    });

    it('should throw CmsError when CMS returns non-success', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'failed',
        status: 'fail',
        task: 'getautoaddvol',
      });

      await expect(
        service.getAutoAddVol(mockUserId, mockHostUid, mockDbname)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('getAutoExecQueryErrLog', () => {
    const mockRequest = {};

    it('should successfully get auto exec query error log with errors', async () => {
      const mockSuccessResponse = {
        __EXEC_TIME: '0 ms',
        note: 'none',
        status: 'success',
        task: 'getautoexecqueryerrlog',
        error: [
          {
            '@username': 'admin',
            dbname: 'demodb',
            error_code: '0',
            error_desc: 'start',
            error_time: '2026/01/24 15:10:00',
            query_id: 'test_query',
          },
          {
            '@username': 'admin',
            dbname: 'demodb',
            error_code: '0',
            error_desc: 'success',
            error_time: '2026/01/24 15:10:00',
            query_id: 'test_query',
          },
        ],
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      const result = await service.getAutoExecQueryErrLog(
        mockUserId,
        mockHostUid,
        mockRequest
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'getautoexecqueryerrlog',
          token: mockHost.token,
        })
      );
      expect(result).toEqual({
        error: [
          {
            '@username': 'admin',
            dbname: 'demodb',
            error_code: '0',
            error_desc: 'start',
            error_time: '2026/01/24 15:10:00',
            query_id: 'test_query',
          },
          {
            '@username': 'admin',
            dbname: 'demodb',
            error_code: '0',
            error_desc: 'success',
            error_time: '2026/01/24 15:10:00',
            query_id: 'test_query',
          },
        ],
      });
    });

    it('should successfully get auto exec query error log with null error', async () => {
      const mockSuccessResponse = {
        __EXEC_TIME: '0 ms',
        note: 'none',
        status: 'success',
        task: 'getautoexecqueryerrlog',
        error: null,
      };

      cmsClient.postAuthenticated.mockResolvedValue(mockSuccessResponse);

      const result = await service.getAutoExecQueryErrLog(
        mockUserId,
        mockHostUid,
        mockRequest
      );

      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          task: 'getautoexecqueryerrlog',
          token: mockHost.token,
        })
      );
      expect(result).toEqual({
        error: null,
      });
    });

    it('should throw HostError if host is not found', async () => {
      hostService.findHostInternal.mockRejectedValue(
        HostError.NoSuchHost({ hostUid: mockHostUid })
      );

      await expect(
        service.getAutoExecQueryErrLog(mockUserId, mockHostUid, mockRequest)
      ).rejects.toThrow(HostError);
    });

    it('should throw CmsError if CMS token error', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'Request is rejected due to invalid token. Please reconnect.',
        status: 'error',
        task: 'getautoexecqueryerrlog',
      });

      await expect(
        service.getAutoExecQueryErrLog(mockUserId, mockHostUid, mockRequest)
      ).rejects.toThrow(CmsError);
    });

    it('should throw CmsError if CMS status is fail', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '0 ms',
        note: 'Error log retrieval failed',
        status: 'failed',
        task: 'getautoexecqueryerrlog',
      });

      await expect(
        service.getAutoExecQueryErrLog(mockUserId, mockHostUid, mockRequest)
      ).rejects.toThrow(CmsError);
    });
  });

  describe('getAutoAddVolLog', () => {
    const cmsLog = (log: Array<Record<string, string>>) => ({
      __EXEC_TIME: '3 ms',
      note: 'none',
      status: 'success',
      task: 'getautoaddvollog',
      log,
    });

    it('asks CMS for every line instead of sending the range CMS would strcmp', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(cmsLog([]));

      await service.getAutoAddVolLog(mockUserId, mockHostUid, {
        start_time: '2026-10-27,0:0:0',
        end_time: '2026-10-27,23:59:59',
      });

      const sent = cmsClient.postAuthenticated.mock.calls[0][1];
      expect(sent).toEqual(expect.objectContaining({ task: 'getautoaddvollog', token: mockHost.token }));
      expect(sent).not.toHaveProperty('start_time');
      expect(sent).not.toHaveProperty('end_time');
    });

    it('realigns the 5-field lines CMS writes and strips the HA host from dbname', async () => {
      // As tsGetAutoaddvolLog returns them: volname holds the type, page the time, time the outcome.
      cmsClient.postAuthenticated.mockResolvedValue(cmsLog([
        { dbname: 'testdb', volname: 'data', purpose: '2048', page: '2026-10-27,9:5:3', time: 'start', outcome: '' },
        { dbname: 'testdb@127.0.0.1', volname: 'data', purpose: '2048', page: '2026-10-27,9:5:4', time: 'success', outcome: 'start' },
        { dbname: 'demodb', volname: 'demodb_x002', purpose: 'data', page: '2048', time: '2026-10-19,10:12:34', outcome: 'failure' },
      ]));

      const result = await service.getAutoAddVolLog(mockUserId, mockHostUid, {});

      expect(result).toEqual([
        { dbname: 'testdb', volname: '', purpose: 'data', page: '2048', time: '2026-10-27,9:5:3', outcome: 'start' },
        { dbname: 'testdb', volname: '', purpose: 'data', page: '2048', time: '2026-10-27,9:5:4', outcome: 'success' },
        { dbname: 'demodb', volname: 'demodb_x002', purpose: 'data', page: '2048', time: '2026-10-19,10:12:34', outcome: 'failure' },
      ]);
    });

    it('filters the range by time value, so unpadded hours like 9:x stay in a same-day range', async () => {
      cmsClient.postAuthenticated.mockResolvedValue(cmsLog([
        { dbname: 'a', volname: 'data', purpose: '1', page: '2026-10-27,9:5:3', time: 'success', outcome: '' },
        { dbname: 'a', volname: 'data', purpose: '1', page: '2026-10-26,23:59:59', time: 'success', outcome: '' },
        { dbname: 'a', volname: 'a_x1', purpose: 'data', page: '1', time: '2026-9-30,10:0:0', outcome: 'success' },
        { dbname: 'a', volname: 'a_x2', purpose: 'data', page: '1', time: 'garbage', outcome: 'success' },
      ]));

      const sameDay = await service.getAutoAddVolLog(mockUserId, mockHostUid, {
        start_time: '2026-10-27,0:0:0',
        end_time: '2026-10-27,23:59:59',
      });
      expect(sameDay.map((e) => e.time)).toEqual(['2026-10-27,9:5:3']);

      const acrossMonths = await service.getAutoAddVolLog(mockUserId, mockHostUid, {
        start_time: '2026-9-1,0:0:0',
        end_time: '2026-10-31,23:59:59',
      });
      expect(acrossMonths.map((e) => e.time)).toEqual(['2026-10-27,9:5:3', '2026-10-26,23:59:59', '2026-9-30,10:0:0']);
    });
  });

  describe('ensureDbHaModeOff', () => {
    const confname = 'cubridconf';

    function mockConfig(confdata: string[]) {
      cmsConfigService.getAllSystemParam.mockResolvedValue({
        conflist: [{ confdata }],
      } as never);
    }

    it('appends a new [@dbname] section with ha_mode=off when the section does not exist at all', async () => {
      mockConfig(['[common]', 'ha_mode=on', '[service]', 'server=other_db']);
      cmsConfigService.setSystemParam.mockResolvedValue({ success: true } as never);

      await service.ensureDbHaModeOff(mockUserId, mockHostUid, mockDbname);

      expect(cmsConfigService.setSystemParam).toHaveBeenCalledWith(
        mockUserId,
        mockHostUid,
        confname,
        ['[common]', 'ha_mode=on', '[service]', 'server=other_db', '', `[@${mockDbname}]`, 'ha_mode=off']
      );
    });

    it('inserts ha_mode=off right after an existing [@dbname] header with no ha_mode key yet', async () => {
      mockConfig(['[common]', 'ha_mode=on', `[@${mockDbname}]`, 'some_other_param=1']);
      cmsConfigService.setSystemParam.mockResolvedValue({ success: true } as never);

      await service.ensureDbHaModeOff(mockUserId, mockHostUid, mockDbname);

      expect(cmsConfigService.setSystemParam).toHaveBeenCalledWith(
        mockUserId,
        mockHostUid,
        confname,
        ['[common]', 'ha_mode=on', `[@${mockDbname}]`, 'ha_mode=off', 'some_other_param=1']
      );
    });

    it('treats a blank line between the section header and ha_mode=off as already configured', async () => {
      mockConfig(['[common]', 'ha_mode=on', `[@${mockDbname}]`, '', 'ha_mode=off']);

      await service.ensureDbHaModeOff(mockUserId, mockHostUid, mockDbname);

      expect(cmsConfigService.setSystemParam).not.toHaveBeenCalled();
    });

    it('leaves an existing ha_mode value untouched instead of overwriting it', async () => {
      mockConfig(['[common]', 'ha_mode=on', `[@${mockDbname}]`, 'ha_mode=on']);

      await service.ensureDbHaModeOff(mockUserId, mockHostUid, mockDbname);

      expect(cmsConfigService.setSystemParam).not.toHaveBeenCalled();
    });

    it('serializes concurrent calls for the same host so neither write clobbers the other', async () => {
      // Simulates two different databases created concurrently on the same
      // HA host: both would read the same conflist and, without a host-level
      // lock, each write back a full file — the second write would clobber
      // the first write's [@dbname] addition. `storedConfdata` here plays
      // the role of the real cubridconf file CMS holds, updated by whichever
      // setSystemParam call runs.
      //
      // The first call's WRITE is held open behind `firstWriteGate` until
      // the test explicitly releases it, after the second call has had a
      // chance to read+write on its own. Without host-level serialization,
      // call2 reads the pre-call1-write conflist and writes its own addition
      // immediately, which call1's later (delayed) write then clobbers —
      // losing call2's section. With serialization, call2's read/write
      // cannot even start until call1 (holding the lock) has fully finished,
      // so call2 reads call1's already-written conflist and both additions
      // survive.
      let storedConfdata = ['[common]', 'ha_mode=on'];
      let writeCount = 0;
      let releaseFirstWrite!: () => void;
      const firstWriteGate = new Promise<void>((resolve) => {
        releaseFirstWrite = resolve;
      });

      cmsConfigService.getAllSystemParam.mockImplementation(async () => {
        return { conflist: [{ confdata: [...storedConfdata] }] } as never;
      });
      cmsConfigService.setSystemParam.mockImplementation(async (_u, _h, _c, updatedConfdata) => {
        writeCount += 1;
        if (writeCount === 1) {
          await firstWriteGate;
        }
        storedConfdata = updatedConfdata as string[];
        return { success: true } as never;
      });

      const call1 = service.ensureDbHaModeOff(mockUserId, mockHostUid, 'db1');
      // Give call1 a chance to read and reach (and block on) its gated write.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      const call2 = service.ensureDbHaModeOff(mockUserId, mockHostUid, 'db2');
      // Give call2 a chance to read+write on its own, if nothing serializes it.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      releaseFirstWrite();

      await Promise.all([call1, call2]);

      expect(storedConfdata).toEqual(expect.arrayContaining(['[@db1]', '[@db2]']));
      expect(storedConfdata.filter((line) => line === 'ha_mode=off')).toHaveLength(2);
    });

    it('does not serialize calls for different hosts', async () => {
      mockConfig(['[common]', 'ha_mode=on']);
      cmsConfigService.setSystemParam.mockResolvedValue({ success: true } as never);

      await Promise.all([
        service.ensureDbHaModeOff(mockUserId, 'host-uid-1', 'db1'),
        service.ensureDbHaModeOff(mockUserId, 'host-uid-2', 'db2'),
      ]);

      expect(cmsConfigService.setSystemParam).toHaveBeenCalledTimes(2);
    });
  });
});
