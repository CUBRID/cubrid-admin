import { Test, TestingModule } from '@nestjs/testing';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { CmsConfigService } from '@cms-config/cms-config.service';
import { UserRepositoryService } from '@repository';
import { HaService } from '@ha';
import { CmsAuthService } from './cms-auth.service';
import { HostInfo, User } from '@type/index';
import { getHost } from '@host/host-group.util';

describe('CMSAuthService', () => {
  let service: CmsAuthService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CmsAuthService,
        { provide: CmsHttpsClientService, useValue: { postPublic: jest.fn() } },
        {
          provide: UserRepositoryService,
          useValue: { loadUserById: jest.fn(), atomicUpdateUser: jest.fn() },
        },
        { provide: CmsConfigService, useValue: { getAllSystemParam: jest.fn() } },
        { provide: HaService, useValue: { heartbeatlistInternal: jest.fn() } },
      ],
    }).compile();

    moduleRef = module;
    service = module.get<CmsAuthService>(CmsAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('CMS session tracking', () => {
    const host = () => ({
      uid: 'h1', id: 'admin', address: '10.0.0.1', port: 8001, password: 'pw',
      alias: 'h1', initialLogin: true, dbProfiles: {}, token: 'old-token',
    });
    let user: User;
    const saved = () => getHost(user, 'h1') as HostInfo;
    let client: { postPublic: jest.Mock };
    let repository: { loadUserById: jest.Mock; atomicUpdateUser: jest.Mock };
    let cmsConfig: { getAllSystemParam: jest.Mock };

    beforeEach(() => {
      user = { host_groups: { g: { name: 'G', hosts: { h1: host() } } } } as unknown as User;
      client = moduleRef.get(CmsHttpsClientService);
      repository = moduleRef.get(UserRepositoryService);
      cmsConfig = moduleRef.get(CmsConfigService);
      repository.loadUserById.mockResolvedValue(user);
      repository.atomicUpdateUser.mockImplementation(async (_id, update) => update(user));
      client.postPublic.mockResolvedValue({ status: 'success', token: 'new-token' });
      jest.spyOn(service, 'getHaInfo').mockResolvedValue({ success: true, isHA: false });
    });

    it('stores the login time and cm.conf token_active_time with the new token', async () => {
      cmsConfig.getAllSystemParam.mockResolvedValue({ conflist: [{ confdata: ['token_active_time=600'] }] });
      const before = Date.now();

      await service.login('u1', 'h1');

      expect(saved().token).toBe('new-token');
      expect(saved().cmsTokenIssuedAt).toBeGreaterThanOrEqual(before);
      expect(saved().cmsTokenActiveTimeSec).toBe(600);
      expect(cmsConfig.getAllSystemParam).toHaveBeenCalledWith('u1', 'h1', 'cmconf');
    });

    it('still logs in when cm.conf cannot be read, leaving the CMS default', async () => {
      cmsConfig.getAllSystemParam.mockRejectedValue(new Error('denied'));

      await expect(service.login('u1', 'h1')).resolves.toEqual({ success: true, isHA: false });

      expect(saved().cmsTokenActiveTimeSec).toBeUndefined();
    });

    it('forgets the session on disconnect but keeps the token', async () => {
      saved().cmsTokenIssuedAt = 123;

      await service.disconnect('u1', 'h1');

      expect(saved().cmsTokenIssuedAt).toBeUndefined();
      expect(saved().token).toBe('old-token');
    });
  });
});
