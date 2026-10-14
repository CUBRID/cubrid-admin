import { Test, TestingModule } from '@nestjs/testing';
import { HaService } from './ha.service';
import { HostService } from '@host';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';

jest.mock('@common', () => ({
  ...jest.requireActual('@common'),
  checkCmsTokenError: jest.fn(),
  checkCmsStatusError: jest.fn(),
}));

describe('HaService', () => {
  let service: HaService;
  let hostService: jest.Mocked<Pick<HostService, 'findHostInternal'>>;
  let cmsClient: { postAuthenticated: jest.Mock };

  const mockUserId = 'user-1';
  const mockHostUid = 'host-uid-1';
  const mockHost = {
    uid: mockHostUid,
    id: 'host-1',
    address: 'localhost',
    port: 8001,
    password: 'host-password',
    token: 'test-token',
    initialLogin: false,
    alias: 'host-1',
    dbProfiles: {},
  };

  beforeEach(async () => {
    hostService = { findHostInternal: jest.fn().mockResolvedValue(mockHost) };
    cmsClient = { postAuthenticated: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HaService,
        { provide: HostService, useValue: hostService },
        { provide: CmsHttpsClientService, useValue: cmsClient },
      ],
    }).compile();

    service = module.get(HaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('haReload', () => {
    it('should call CMS with task ha_reload and host token', async () => {
      cmsClient.postAuthenticated.mockResolvedValue({
        __EXEC_TIME: '72 ms',
        note: 'none',
        status: 'success',
        task: 'ha_reload',
      });

      const result = await service.haReload(mockUserId, mockHostUid);

      expect(hostService.findHostInternal).toHaveBeenCalledWith(mockUserId, mockHostUid);
      expect(cmsClient.postAuthenticated).toHaveBeenCalledWith(
        `https://${mockHost.address}:${mockHost.port}/cm_api`,
        expect.objectContaining({
          task: 'ha_reload',
          token: mockHost.token,
        }),
        expect.objectContaining({ timeoutMs: expect.any(Number) })
      );
      expect(result.task).toBe('ha_reload');
      expect(result.status).toBe('success');
    });
  });
});
