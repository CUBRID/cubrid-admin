import { Test, TestingModule } from '@nestjs/testing';
import { ResourceMonitoringController } from './resource-monitoring.controller';
import { ResourceMonitoringService } from './resource-monitoring.service';

describe('ResourceMonitoringController', () => {
  let controller: ResourceMonitoringController;
  const service = { getHostStat: jest.fn(), getSysDiskInfo: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResourceMonitoringController],
      providers: [{ provide: ResourceMonitoringService, useValue: service }],
    }).compile();

    controller = module.get<ResourceMonitoringController>(ResourceMonitoringController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getSysDiskInfo delegates with the requesting user and host', async () => {
    const diskInfo = { disk_info: [{ name: '/', total_size: '100', free_size: '40' }] };
    service.getSysDiskInfo.mockResolvedValue(diskInfo);

    await expect(controller.getSysDiskInfo('host1', { user: { sub: 'user1' } })).resolves.toBe(diskInfo);
    expect(service.getSysDiskInfo).toHaveBeenCalledWith('user1', 'host1');
  });
});
