import { Test, TestingModule } from '@nestjs/testing';
import * as updateCheck from '@update-check';
import { VersionService } from './version.service';

jest.mock('@update-check', () => ({
  checkForUpdate: jest.fn(),
}));

const mockCheckForUpdate = updateCheck.checkForUpdate as jest.Mock;

describe('VersionService', () => {
  let service: VersionService;
  const originalAppVersion = process.env.APP_VERSION;

  beforeEach(async () => {
    process.env.APP_VERSION = '1.2.3';
    mockCheckForUpdate.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [VersionService],
    }).compile();

    service = module.get(VersionService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    process.env.APP_VERSION = originalAppVersion;
  });

  it('reports the baked-in app version', () => {
    expect(service.getCurrentVersion()).toBe('1.2.3');
  });

  it('falls back to a default version when APP_VERSION was never injected', () => {
    delete process.env.APP_VERSION;
    expect(service.getCurrentVersion()).toBe('0.0.0');
  });

  it('caches the result of a successful check', async () => {
    mockCheckForUpdate.mockResolvedValue({ status: 'up-to-date' });

    const result = await service.runCheck();

    expect(result).toEqual({ status: 'up-to-date' });
    expect(service.getState().result).toEqual({ status: 'up-to-date' });
    expect(service.getState().lastCheckedAt).not.toBeNull();
  });

  it('de-duplicates concurrent calls into a single outbound check', async () => {
    let resolveCheck: (value: updateCheck.UpdateCheckResult) => void;
    mockCheckForUpdate.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      })
    );

    const first = service.runCheck();
    const second = service.runCheck();

    resolveCheck!({ status: 'up-to-date' });
    await Promise.all([first, second]);

    expect(mockCheckForUpdate).toHaveBeenCalledTimes(1);
  });

  it('never throws and caches a network error when checkForUpdate rejects', async () => {
    // checkForUpdate itself never rejects by contract, but this must stay
    // safe even if that contract is ever violated — a closed-network
    // deployment must never see an update check crash the request.
    mockCheckForUpdate.mockRejectedValue(new Error('boom'));

    await expect(service.runCheck()).resolves.toEqual({ status: 'error', reason: 'network' });
    expect(service.getState().result).toEqual({ status: 'error', reason: 'network' });
  });

  it('requests the "server" package type with the current version', async () => {
    mockCheckForUpdate.mockResolvedValue({ status: 'up-to-date' });

    await service.runCheck();

    expect(mockCheckForUpdate).toHaveBeenCalledWith({
      currentVersion: '1.2.3',
      packageType: 'server',
    });
  });
});
