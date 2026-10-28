import { Test, TestingModule } from '@nestjs/testing';
import { HostService } from './host.service';
import { UserRepositoryService } from '@repository';
import { HostError, HostErrorCode } from '@error/index';
import { HostInfo, User } from '@type/index';
import { getHost, MAX_HOST_ALIAS_LENGTH, UNGROUPED_GROUP_ID } from './host-group.util';

describe('HostService', () => {
  let service: HostService;
  let user: User;

  const existingHost = {
    uid: 'host-a',
    address: '10.0.0.1',
    port: 8001,
    id: 'admin',
    alias: 'A',
    password: 'pw',
    initialLogin: false,
    dbProfiles: {},
  };

  beforeEach(async () => {
    user = {
      host_groups: {
        [UNGROUPED_GROUP_ID]: {
          name: '',
          defaultHostUid: 'host-a',
          hosts: { 'host-a': { ...existingHost } },
        },
      },
    } as unknown as User;

    const repository = {
      atomicUpdateUser: jest.fn(async (_userId: string, fn: (u: User) => Promise<User>) => fn(user)),
    };

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

  const newHost = (alias: string) => ({
    address: '10.0.0.2',
    port: 8001,
    id: 'admin',
    password: 'pw',
    alias,
  });

  async function expectAliasTooLong(promise: Promise<unknown>) {
    const err = await promise.then(
      () => undefined,
      (e) => e
    );
    expect(err).toBeInstanceOf(HostError);
    expect(err.code).toBe(HostErrorCode.INVALID_FORMAT);
    expect(err.additionalData).toEqual({ field: 'alias', reason: 'ALIAS_TOO_LONG', max: MAX_HOST_ALIAS_LENGTH });
  }

  describe('alias length cap', () => {
    it('addHost accepts an alias of exactly the max length', async () => {
      const alias = 'x'.repeat(MAX_HOST_ALIAS_LENGTH);
      const groups = await service.addHost('u1', newHost(alias));
      const aliases = Object.values(groups[UNGROUPED_GROUP_ID].hosts ?? {}).map((h) => h.alias);
      expect(aliases).toContain(alias);
    });

    it('addHost rejects an alias one character over the max', async () => {
      await expectAliasTooLong(service.addHost('u1', newHost('x'.repeat(MAX_HOST_ALIAS_LENGTH + 1))));
    });

    it('addHost measures the trimmed alias', async () => {
      const alias = 'x'.repeat(MAX_HOST_ALIAS_LENGTH);
      const groups = await service.addHost('u1', newHost(`  ${alias}\t`));
      const aliases = Object.values(groups[UNGROUPED_GROUP_ID].hosts ?? {}).map((h) => h.alias);
      expect(aliases).toContain(alias);
    });

    it('updateHost accepts an alias of exactly the max length', async () => {
      const alias = 'y'.repeat(MAX_HOST_ALIAS_LENGTH);
      const groups = await service.updateHost('u1', 'host-a', { alias });
      expect(groups[UNGROUPED_GROUP_ID].hosts?.['host-a'].alias).toBe(alias);
    });

    it('updateHost rejects an alias one character over the max and leaves the host unchanged', async () => {
      await expectAliasTooLong(
        service.updateHost('u1', 'host-a', { alias: 'y'.repeat(MAX_HOST_ALIAS_LENGTH + 1) })
      );
      expect(user.host_groups?.[UNGROUPED_GROUP_ID].hosts?.['host-a'].alias).toBe('A');
    });

    it('updateHost without an alias field keeps an existing alias untouched', async () => {
      const groups = await service.updateHost('u1', 'host-a', { port: 8002 });
      expect(groups[UNGROUPED_GROUP_ID].hosts?.['host-a'].alias).toBe('A');
    });
  });

  describe('updateHost and the stored CMS session', () => {
    const saved = () => getHost(user, 'host-a') as HostInfo;

    beforeEach(() => {
      Object.assign(saved(), { token: 'tok', cmsTokenIssuedAt: 123, cmsTokenActiveTimeSec: 600 });
    });

    it('keeps it when only the alias changes', async () => {
      await service.updateHost('u1', 'host-a', { alias: 'renamed' });

      expect(saved().cmsTokenIssuedAt).toBe(123);
      expect(saved().cmsTokenActiveTimeSec).toBe(600);
    });

    it('drops it when the server or CMS account changes', async () => {
      await service.updateHost('u1', 'host-a', { address: '10.0.0.2' });

      expect(saved().cmsTokenIssuedAt).toBeUndefined();
      expect(saved().cmsTokenActiveTimeSec).toBeUndefined();
    });
  });
});
