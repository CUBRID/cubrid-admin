import { Test, TestingModule } from '@nestjs/testing';
import { LockService } from './lock.service';
import * as lockfile from 'proper-lockfile';
import * as fs from 'fs/promises';

// Mock the dependencies
jest.mock('proper-lockfile');
jest.mock('fs/promises');

// A custom decorator mock to simply run the method
function MockHandleLockFsErrors() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    // The mock decorator's only job is to execute the original method.
    // We test the service's logic, not the decorator's.
    return descriptor;
  };
}

// Replace the actual decorator with our mock during tests
jest.mock('@common', () => ({
  ...jest.requireActual('@common'),
  HandleLockFsErrors: jest.fn().mockImplementation(MockHandleLockFsErrors),
}));

describe('LockService', () => {
  let service: LockService;

  // Type-safe mock objects
  let mockedLockfile: jest.Mocked<typeof lockfile>;
  let mockedFs: jest.Mocked<typeof fs>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LockService],
    }).compile();

    service = module.get<LockService>(LockService);

    // Assign mocks with types
    mockedLockfile = lockfile as jest.Mocked<typeof lockfile>;
    mockedFs = fs as jest.Mocked<typeof fs>;

    // Reset mocks before each test
    mockedLockfile.lock.mockClear();
    mockedFs.mkdir.mockClear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('acquire', () => {
    it('should acquire a lock and return a release function', async () => {
      const mockRelease = jest.fn().mockResolvedValue(undefined);
      mockedLockfile.lock.mockResolvedValue(mockRelease);
      mockedFs.mkdir.mockResolvedValue(undefined);

      const filename = 'test.txt';
      const lock = await service.acquire(filename);

      expect(mockedFs.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      expect(mockedLockfile.lock).toHaveBeenCalledWith(
        expect.stringContaining(filename),
        expect.any(Object)
      );
      expect(lock.release).toBe(mockRelease);

      // Verify that calling our release function calls the mock
      await lock.release();
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should throw an error if lock acquisition fails', async () => {
      const error = new Error('Failed to lock');
      mockedLockfile.lock.mockRejectedValue(error);
      mockedFs.mkdir.mockResolvedValue(undefined);

      await expect(service.acquire('test.txt')).rejects.toThrow();
    });
  });

  describe('release', () => {
    it('should call the release function on the lock object', async () => {
      const mockRelease = jest.fn().mockResolvedValue(undefined);
      const fileLock = {
        filePath: 'path/to/file',
        release: mockRelease,
        acquiredAt: Date.now(),
        releasing: false,
        compromised: null,
        assertHeld: () => undefined,
      };

      await service.release(fileLock);

      expect(mockRelease).toHaveBeenCalled();
    });

    it('should throw an error if releasing fails', async () => {
      const error = new Error('Failed to release');
      const mockRelease = jest.fn().mockRejectedValue(error);
      const fileLock = {
        filePath: 'path/to/file',
        release: mockRelease,
        acquiredAt: Date.now(),
        releasing: false,
        compromised: null,
        assertHeld: () => undefined,
      };

      await expect(service.release(fileLock)).rejects.toThrow();
    });
  });

  describe('withLock', () => {
    it('should acquire lock, execute work, and release lock', async () => {
      const mockRelease = jest.fn().mockResolvedValue(undefined);
      mockedLockfile.lock.mockResolvedValue(mockRelease);

      const work = jest.fn().mockResolvedValue('work_result');
      const result = await service.withLock('test.txt', work);

      // Check execution order
      expect(mockedLockfile.lock).toHaveBeenCalled();
      expect(work).toHaveBeenCalled();
      expect(mockRelease).toHaveBeenCalled();
      expect(result).toBe('work_result');
    });

    it('should release the lock even if the work function throws an error', async () => {
      const mockRelease = jest.fn().mockResolvedValue(undefined);
      mockedLockfile.lock.mockResolvedValue(mockRelease);

      const error = new Error('Work failed');
      const work = jest.fn().mockRejectedValue(error);

      // We expect the original error from 'work' to be thrown
      await expect(service.withLock('test.txt', work)).rejects.toThrow(error);

      // But the lock should still have been released
      expect(mockedLockfile.lock).toHaveBeenCalled();
      expect(work).toHaveBeenCalled();
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should not suppress the original error if release also fails', async () => {
      const releaseError = new Error('Release failed');
      const mockRelease = jest.fn().mockRejectedValue(releaseError);
      mockedLockfile.lock.mockResolvedValue(mockRelease);

      const workError = new Error('Work failed');
      const work = jest.fn().mockRejectedValue(workError);

      // The service should prioritize and throw the original work error
      await expect(service.withLock('test.txt', work)).rejects.toThrow(workError);

      expect(mockRelease).toHaveBeenCalled(); // Release was attempted
    });
  });
});
