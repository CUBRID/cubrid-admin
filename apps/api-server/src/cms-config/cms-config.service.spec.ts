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

    it('still passes cmconf through untouched (CMS parses it itself)', async () => {
      await expect(
        service.setSystemParamFromRawEdit(mockUserId, mockHostUid, 'cmconf', ['cm_port 8001'])
      ).resolves.toEqual({ success: true });
    });
  });
});
