import { Test, TestingModule } from '@nestjs/testing';
import * as updateCheck from '@update-check';
import { VersionService } from './version.service';

jest.mock('@update-check', () => ({
  ...jest.requireActual('@update-check'),
  checkForUpdate: jest.fn(),
}));

const mockCheckForUpdate = updateCheck.checkForUpdate as jest.Mock;

describe('VersionService', () => {
  let service: VersionService;
  const originalAppVersion = process.env.APP_VERSION;
  const originalRepoOverride = process.env.CWM_UPDATE_CHECK_REPO;

  beforeEach(async () => {
    process.env.APP_VERSION = '1.2.3';
    delete process.env.CWM_UPDATE_CHECK_REPO;
    mockCheckForUpdate.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [VersionService],
    }).compile();

    service = module.get(VersionService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    process.env.APP_VERSION = originalAppVersion;
    if (originalRepoOverride === undefined) {
      delete process.env.CWM_UPDATE_CHECK_REPO;
    } else {
      process.env.CWM_UPDATE_CHECK_REPO = originalRepoOverride;
    }
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
    const resolvers: Array<(value: updateCheck.UpdateCheckResult) => void> = [];
    mockCheckForUpdate.mockReturnValue(
      new Promise((resolve) => {
        resolvers.push(resolve);
      })
    );

    const first = service.runCheck();
    const second = service.runCheck();

    resolvers.forEach((resolve) => resolve({ status: 'up-to-date' }));
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

  it('requests the "server" package type from the official repo by default', async () => {
    mockCheckForUpdate.mockResolvedValue({ status: 'up-to-date' });

    await service.runCheck();

    expect(mockCheckForUpdate).toHaveBeenCalledWith({
      currentVersion: '1.2.3',
      packageType: 'server',
      repo: 'CUBRID/cubrid-admin',
    });
  });

  it('honors a well-formed CWM_UPDATE_CHECK_REPO override', async () => {
    process.env.CWM_UPDATE_CHECK_REPO = 'JohnDohnut/cubrid-webmanager';
    mockCheckForUpdate.mockResolvedValue({ status: 'up-to-date' });

    await service.runCheck();

    expect(mockCheckForUpdate).toHaveBeenCalledWith(expect.objectContaining({ repo: 'JohnDohnut/cubrid-webmanager' }));
  });

  it('ignores a malformed CWM_UPDATE_CHECK_REPO override', async () => {
    process.env.CWM_UPDATE_CHECK_REPO = '../../evil';
    mockCheckForUpdate.mockResolvedValue({ status: 'up-to-date' });

    await service.runCheck();

    expect(mockCheckForUpdate).toHaveBeenCalledWith(expect.objectContaining({ repo: 'CUBRID/cubrid-admin' }));
  });

  it('fires one check on init and stops its periodic timer on destroy', async () => {
    jest.useFakeTimers();
    try {
      mockCheckForUpdate.mockResolvedValue({ status: 'up-to-date' });

      service.onModuleInit();
      expect(mockCheckForUpdate).toHaveBeenCalledTimes(1);
      await Promise.resolve();
      await Promise.resolve();

      await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      expect(mockCheckForUpdate).toHaveBeenCalledTimes(2);

      service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      expect(mockCheckForUpdate).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not block or throw from onModuleInit when the first check hangs', () => {
    mockCheckForUpdate.mockReturnValue(new Promise(() => undefined));

    expect(() => service.onModuleInit()).not.toThrow();
  });
});
