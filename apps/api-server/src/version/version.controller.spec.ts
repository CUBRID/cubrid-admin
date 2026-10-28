import { Test, TestingModule } from '@nestjs/testing';
import { VersionController } from './version.controller';
import { VersionService } from './version.service';

describe('VersionController', () => {
  let controller: VersionController;
  let service: { getCurrentVersion: jest.Mock; runCheck: jest.Mock; getState: jest.Mock };

  beforeEach(async () => {
    service = {
      getCurrentVersion: jest.fn().mockReturnValue('1.2.3'),
      runCheck: jest.fn().mockResolvedValue({ status: 'up-to-date' }),
      getState: jest.fn().mockReturnValue({
        currentVersion: '1.2.3',
        lastCheckedAt: '2026-01-01T00:00:00.000Z',
        result: { status: 'up-to-date' },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VersionController],
      providers: [{ provide: VersionService, useValue: service }],
    }).compile();

    controller = module.get(VersionController);
  });

  it('GET /version returns the current version', () => {
    expect(controller.getVersion()).toEqual({ version: '1.2.3' });
  });

  it('GET /version/check triggers a check and returns the resulting state', async () => {
    const response = await controller.checkForUpdate();

    expect(service.runCheck).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      currentVersion: '1.2.3',
      lastCheckedAt: '2026-01-01T00:00:00.000Z',
      result: { status: 'up-to-date' },
    });
  });
});
