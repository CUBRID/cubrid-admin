import { Test, TestingModule } from '@nestjs/testing';
import { ResourceMonitoringService } from './resource-monitoring.service';
import { CmsHttpsClientService } from '@cms-https-client/cms-https-client.service';
import { HostService } from '@host';

describe('ResourceMonitoringService', () => {
  let service: ResourceMonitoringService;
  const client = { postAuthenticated: jest.fn() };
  const hostService = {
    findHostInternal: jest.fn().mockResolvedValue({ address: '10.0.0.1', port: 8001, token: 'tok' }),
  };

  beforeEach(async () => {
    client.postAuthenticated.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceMonitoringService,
        { provide: CmsHttpsClientService, useValue: client },
        { provide: HostService, useValue: hostService },
      ],
    }).compile();

    service = module.get<ResourceMonitoringService>(ResourceMonitoringService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSysDiskInfo', () => {
    it('sends getsysdiskinfo and returns only the disk entries', async () => {
      client.postAuthenticated.mockResolvedValue({
        task: 'getsysdiskinfo',
        status: 'success',
        note: 'none',
        __EXEC_TIME: '1 ms',
        disk_info: [{ name: '/', total_size: '107374182400', free_size: '53687091200' }],
      });

      const result = await service.getSysDiskInfo('user1', 'host1');

      expect(client.postAuthenticated).toHaveBeenCalledWith(
        'https://10.0.0.1:8001/cm_api',
        { task: 'getsysdiskinfo', token: 'tok' }
      );
      expect(result).toEqual({
        disk_info: [{ name: '/', total_size: '107374182400', free_size: '53687091200' }],
      });
    });

    it('returns an empty list when CMS reports no disk entries', async () => {
      client.postAuthenticated.mockResolvedValue({ task: 'getsysdiskinfo', status: 'success', note: 'none' });

      await expect(service.getSysDiskInfo('user1', 'host1')).resolves.toEqual({ disk_info: [] });
    });

    it('rejects when CMS reports a failure', async () => {
      client.postAuthenticated.mockResolvedValue({
        task: 'getsysdiskinfo',
        status: 'failure',
        note: 'get file system info error!',
      });

      await expect(service.getSysDiskInfo('user1', 'host1')).rejects.toBeDefined();
    });
  });
});
