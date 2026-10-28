import { Test, TestingModule } from '@nestjs/testing';
import { CmsConfigService } from './cms-config.service';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { DatabaseUserService } from '@database/user/database-user.service';

describe('CmsConfigService — raw conf text parsing whitespace & tab format robustness', () => {
  let service: CmsConfigService;
  let postAuthenticated: jest.Mock;

  const mockUserId = 'user-123';
  const mockHostUid = 'host-uid-1';
  const mockHost = {
    uid: mockHostUid,
    address: 'localhost',
    port: 8001,
    token: 'test-token',
  };
  // A real, current engine version string so every schema entry (no
  // minVersion/maxVersion bound excludes it) resolves — same CUBRIDVER
  // shape confirmed against a live host elsewhere in this codebase.
  const CUBRIDVER = 'CUBRID 11.4.5 (11.4.5.1907-7077e91) (64bit debug build for Linux)';

  const getEnvCmsResponse = {
    status: 'success',
    task: 'getenv',
    __EXEC_TIME: '1 ms',
    note: 'none',
    CUBRIDVER,
  };

  function cmsResponseFor(task: string) {
    if (task === 'getenv') return getEnvCmsResponse;
    return { status: 'success', task, __EXEC_TIME: '1 ms', note: 'none' };
  }

  beforeEach(async () => {
    const mockHostService = { findHostInternal: jest.fn().mockResolvedValue(mockHost) };
    postAuthenticated = jest.fn();
    const mockCmsClient = { postAuthenticated };
    const mockDatabaseUserService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CmsConfigService,
        { provide: HostService, useValue: mockHostService },
        { provide: CmsHttpsClientService, useValue: mockCmsClient },
        { provide: DatabaseUserService, useValue: mockDatabaseUserService },
      ],
    }).compile();

    service = module.get<CmsConfigService>(CmsConfigService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('setSystemParamFromRawEdit (cubridconf) — assertValidConfText parses tab/space-formatted raw text correctly', () => {
    it('accepts a valid value even when padded with tabs/spaces around the key and "="', async () => {
      postAuthenticated.mockImplementation((_url, req) => Promise.resolve(cmsResponseFor(req.task)));
      const confdata = ['[common]', '  csql_history_num \t = \t 100  '];

      await expect(
        service.setSystemParamFromRawEdit(mockUserId, mockHostUid, 'cubridconf', confdata)
      ).resolves.toEqual({ success: true });
    });

    it('still catches an out-of-range value hidden behind leading tabs and tabs around "="', async () => {
      postAuthenticated.mockImplementation((_url, req) => Promise.resolve(cmsResponseFor(req.task)));
      // csql_history_num's guard is { kind: 'int', min: 1, max: 200 } — 9999 is out of range.
      const confdata = ['[common]', '\tcsql_history_num\t=\t9999'];

      await expect(
        service.setSystemParamFromRawEdit(mockUserId, mockHostUid, 'cubridconf', confdata)
      ).rejects.toMatchObject({
        additionalData: { message: expect.stringContaining('csql_history_num') },
      });
    });
  });

  describe('setBrokerParamFromRawEdit — assertValidConfText catches required/crossField violations through formatting noise', () => {
    it('treats a whitespace-only value as blank for a required key (MASTER_SHM_ID)', async () => {
      postAuthenticated.mockImplementation((_url, req) => Promise.resolve(cmsResponseFor(req.task)));
      const confdata = ['[broker]', '\tMASTER_SHM_ID\t=\t   ', '[%broker1]', 'BROKER_PORT=30000'];

      await expect(
        service.setBrokerParamFromRawEdit(mockUserId, mockHostUid, confdata)
      ).rejects.toMatchObject({
        additionalData: { message: expect.stringContaining('MASTER_SHM_ID') },
      });
    });

    it('still enforces MAX_NUM_APPL_SERVER >= MIN_NUM_APPL_SERVER when both sides are tab/space-padded', async () => {
      postAuthenticated.mockImplementation((_url, req) => Promise.resolve(cmsResponseFor(req.task)));
      const confdata = [
        '[broker]',
        'MASTER_SHM_ID=1',
        '[%broker1]',
        'BROKER_PORT=30000',
        '  MIN_NUM_APPL_SERVER = 10',
        'MAX_NUM_APPL_SERVER\t=\t5',
      ];

      await expect(
        service.setBrokerParamFromRawEdit(mockUserId, mockHostUid, confdata)
      ).rejects.toMatchObject({
        additionalData: { message: expect.stringContaining('MAX_NUM_APPL_SERVER') },
      });
    });
  });

  describe('engine-fatal input the raw editors used to let through', () => {
    beforeEach(() => postAuthenticated.mockImplementation((_url, req) => Promise.resolve(cmsResponseFor(req.task))));

    it('rejects a cubrid.conf line with no "=" (the engine fails to load the whole file)', async () => {
      await expect(
        service.setSystemParamFromRawEdit(mockUserId, mockHostUid, 'cubridconf', ['[common]', 'max_clients 100'])
      ).rejects.toMatchObject({ additionalData: { message: expect.stringContaining('Line 2') } });
      expect(postAuthenticated.mock.calls.some(([, req]) => req.task === 'setsysparam')).toBe(false);
    });

    it('rejects a present-but-empty value for a non-string cubrid.conf key', async () => {
      await expect(
        service.setSystemParamFromRawEdit(mockUserId, mockHostUid, 'cubridconf', ['[common]', 'max_clients='])
      ).rejects.toMatchObject({ additionalData: { message: expect.stringContaining('max_clients') } });
    });

    it('rejects broker.conf with no [broker] section', async () => {
      await expect(
        service.setBrokerParamFromRawEdit(mockUserId, mockHostUid, ['[%broker1]', 'BROKER_PORT=30000'])
      ).rejects.toMatchObject({ additionalData: { message: expect.stringContaining('[broker]') } });
    });

    it('rejects a key the host\'s engine (11.4.5, catalogued exactly) does not know', async () => {
      await expect(
        service.setSystemParamFromRawEdit(mockUserId, mockHostUid, 'cubridconf', ['[common]', 'max_client=100'])
      ).rejects.toMatchObject({ additionalData: { message: expect.stringContaining('max_client') } });
      await expect(
        service.setBrokerParamFromRawEdit(mockUserId, mockHostUid, ['[broker]', 'MASTER_SHM_ID=30001', '[%b1]', 'BROKER_PORT=30000', 'BROKR_PORT=1'])
      ).rejects.toMatchObject({ additionalData: { message: expect.stringContaining('BROKR_PORT') } });
    });

    it('accepts the cm.conf template CMS ships (11.4.5 pin), including keys CMS reads in its own space-separated form', async () => {
      const template = [
        '# cm.conf', '[cm]', 'cm_port=8001', 'cm_process_monitor_interval=5', 'allow_user_multi_connection=YES',
        '#execute_diag=ON', 'server_long_query_time=10', 'auto_job_timeout=43200', '#token_active_time=7200',
        'support_mon_statistic=NO', 'max_log_files=10', 'cm_port 8001',
      ];
      const result = await service.setSystemParamFromRawEdit(mockUserId, mockHostUid, 'cmconf', template);
      expect(result).toMatchObject({ success: true, warnings: [expect.stringContaining('server_long_query_time')] });
      expect(postAuthenticated.mock.calls.some(([, req]) => req.task === 'setsysparam')).toBe(true);
    });
  });

  describe('getEnv — schemas resolved for the host\'s engine version', () => {
    it('sends database/broker/cm schemas plus the engine key list for 11.4.5', async () => {
      postAuthenticated.mockImplementation((_url, req) => Promise.resolve(cmsResponseFor(req.task)));
      const { paramSchemas } = await service.getEnv(mockUserId, mockHostUid);
      expect(paramSchemas.knownKeys).toMatchObject({ strict: true, catalogVersion: '11.4.5' });
      expect(paramSchemas.cm.map((e) => e.key)).toContain('cm_port');
      expect(paramSchemas.cm.map((e) => e.key)).not.toContain('async_job_ttl_sec');
      expect(paramSchemas.broker.map((e) => e.key)).toContain('ACCESS_CONTROL_DEFAULT_POLICY');
      // Default comes from the engine catalog (HB_DEFAULT_HA_PORT_ID).
      expect(paramSchemas.database.find((e) => e.key === 'ha_port_id')).toMatchObject({ default: '59901', scope: 'CLIENT' });
    });
  });

  describe('cm.conf and request shape', () => {
    beforeEach(() => postAuthenticated.mockImplementation((_url, req) => Promise.resolve(cmsResponseFor(req.task))));
    const writes = () => postAuthenticated.mock.calls.filter(([, req]) => req.task === 'setsysparam');

    it('rejects out-of-range / mistyped / unknown cm.conf values with a 400 listing each line', async () => {
      const error = await service
        .setSystemParamFromRawEdit(mockUserId, mockHostUid, 'cmconf', ['[cm]', 'cm_port=70000', 'auto_job_timeout=abc', 'cm_prot=8001'])
        .catch((e) => e);
      expect(error.additionalData.problems).toEqual([
        { lineNo: 2, key: 'cm_port', message: expect.stringContaining('<= 65535') },
        { lineNo: 3, key: 'auto_job_timeout', message: expect.stringContaining('32-bit integer') },
        { lineNo: 4, key: 'cm_prot', message: expect.stringContaining('not a cm.conf parameter') },
      ]);
      expect(error.toProblemDetails().problems).toHaveLength(3);
      expect(error.toProblemDetails().status).toBe(400);
      expect(writes()).toHaveLength(0);
    });

    it('accepts CMS aliases case-insensitively', async () => {
      await expect(
        service.setSystemParamFromRawEdit(mockUserId, mockHostUid, 'cmconf', ['MonitorInterval=10', 'HTTPTIMEOUT=60'])
      ).resolves.toEqual({ success: true });
    });

    it('only warns for the develop-only async keys (not in any released engine pin)', async () => {
      const result = await service.setSystemParamFromRawEdit(mockUserId, mockHostUid, 'cmconf', ['async_job_ttl_sec=10']);
      expect(result).toMatchObject({ success: true, warnings: [expect.stringContaining('async_job_ttl_sec')] });
    });

    it('refuses any confname other than cubridconf/cmconf (CMS would write it as a raw file name)', async () => {
      await expect(
        service.setSystemParamFromRawEdit(mockUserId, mockHostUid, 'cubrid_broker.conf', ['[broker]', 'MASTER_SHM_ID=0'])
      ).rejects.toMatchObject({ additionalData: { confname: 'cubrid_broker.conf' } });
      expect(writes()).toHaveLength(0);
    });

    it('returns structured problems for cubrid.conf too, and warnings for deprecated keys', async () => {
      const error = await service
        .setSystemParamFromRawEdit(mockUserId, mockHostUid, 'cubridconf', ['[common]', 'max_clients=5000'])
        .catch((e) => e);
      expect(error.additionalData.problems).toEqual([{ lineNo: 2, key: 'max_clients', message: expect.stringContaining('<= 4000') }]);
      await expect(
        service.setSystemParamFromRawEdit(mockUserId, mockHostUid, 'cubridconf', ['[common]', 'data_buffer_pages=32768'])
      ).resolves.toMatchObject({ warnings: [expect.stringContaining('use data_buffer_size')] });
    });
  });
});
