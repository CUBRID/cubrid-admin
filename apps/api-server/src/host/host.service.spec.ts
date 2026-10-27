import { Test, TestingModule } from '@nestjs/testing';
import { HostService } from './host.service';
import { UserRepositoryService } from '@repository';
import { HostInfo, User } from '@type/index';
import { getHost } from './host-group.util';

describe('HostService', () => {
  let service: HostService;
  let repository: { atomicUpdateUser: jest.Mock };

  beforeEach(async () => {
    repository = { atomicUpdateUser: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HostService,
        { provide: UserRepositoryService, useValue: repository },
      ],
    }).compile();

    service = module.get<HostService>(HostService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateHost and the stored CMS session', () => {
    let user: User;
    const saved = () => getHost(user, 'h1') as HostInfo;

    beforeEach(() => {
      user = {
        host_groups: {
          g: {
            name: 'G',
            hosts: {
              h1: {
                uid: 'h1', id: 'admin', address: '10.0.0.1', port: 8001, password: 'pw', alias: 'h1',
                initialLogin: false, dbProfiles: {}, token: 'tok', cmsTokenIssuedAt: 123, cmsTokenActiveTimeSec: 600,
              },
            },
          },
        },
      } as unknown as User;
      repository.atomicUpdateUser.mockImplementation(async (_id, update) => update(user));
    });

    it('keeps it when only the alias changes', async () => {
      await service.updateHost('u1', 'h1', { alias: 'renamed' });

      expect(saved().cmsTokenIssuedAt).toBe(123);
      expect(saved().cmsTokenActiveTimeSec).toBe(600);
    });

    it('drops it when the server or CMS account changes', async () => {
      await service.updateHost('u1', 'h1', { address: '10.0.0.2' });

      expect(saved().cmsTokenIssuedAt).toBeUndefined();
      expect(saved().cmsTokenActiveTimeSec).toBeUndefined();
    });
  });
});
