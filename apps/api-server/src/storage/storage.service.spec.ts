import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { LockService } from '@lock/lock.service';
import * as fs from 'fs/promises';

// The lock a work function gets from withLock; its writes check it is still held.
const HELD_LOCK = { assertHeld: () => undefined } as any;

// Mock dependencies
jest.mock('fs/promises');
jest.mock('@lock/lock.service');
jest.mock('@util', () => ({
  ...jest.requireActual('@util'),
  resolveUserFilePath: jest.fn((filename) => `mock/path/to/${filename}`),
  getStoragePath: jest.fn(() => 'mock/path'),
}));

describe('StorageService', () => {
    let service: StorageService;
    let lockService: jest.Mocked<LockService>;
    let mockedFs: jest.Mocked<typeof fs>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [StorageService, LockService],
        }).compile();

        service = module.get<StorageService>(StorageService);
        lockService = module.get(LockService);
        mockedFs = fs as jest.Mocked<typeof fs>;

        // Mock implementation of withLock to just run the worker function
        lockService.withLock.mockImplementation(
            async (filename: string, work: (lock: unknown) => Promise<any>) => {
                return work(HELD_LOCK);
            },
        );

        // Reset fs mocks
        Object.values(mockedFs).forEach((mockFn) => {
            if (typeof mockFn === 'function') {
                mockFn.mockReset();
            }
        });
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('Unsafe methods (without lock)', () => {
        describe('readUnsafe', () => {
            it('should read and return file content', async () => {
                const content = 'file content';
                mockedFs.readFile.mockResolvedValue(content);
                const result = await service.readUnsafe('test.txt');
                expect(mockedFs.readFile).toHaveBeenCalledWith(
                    'mock/path/to/test.txt',
                    'utf-8',
                );
                expect(result).toBe(content);
            });

            it('should throw if fs.readFile rejects', async () => {
                mockedFs.readFile.mockRejectedValue(new Error('Read error'));
                await expect(service.readUnsafe('test.txt')).rejects.toThrow();
            });
        });

        describe('writeUnsafe', () => {
            it('should perform an atomic write (write to tmp, then rename)', async () => {
                const data = 'new data';
                mockedFs.writeFile.mockResolvedValue(undefined);
                mockedFs.rename.mockResolvedValue(undefined);
                mockedFs.rm.mockResolvedValue(undefined);

                await service.writeUnsafe('test.txt', data);

                expect(mockedFs.writeFile).toHaveBeenCalledWith(
                    expect.stringContaining('.tmp'),
                    data,
                    'utf-8',
                );
                expect(mockedFs.rename).toHaveBeenCalledWith(
                    expect.stringContaining('.tmp'),
                    'mock/path/to/test.txt',
                );
                expect(mockedFs.rm).toHaveBeenCalledWith(
                    expect.stringContaining('.tmp'),
                    { force: true },
                );
            });
        });

        describe('createUnsafe', () => {
            it('should create an empty file with "wx" flag', async () => {
                mockedFs.writeFile.mockResolvedValue(undefined);
                await service.createUnsafe('new-file.txt');
                expect(mockedFs.writeFile).toHaveBeenCalledWith(
                    'mock/path/to/new-file.txt',
                    '',
                    { flag: 'wx' },
                );
            });
        });

        describe('createAndWriteUnsafe', () => {
            it('should create and write to a file with "wx" flag', async () => {
                const data = 'initial data';
                mockedFs.writeFile.mockResolvedValue(undefined);
                await service.createAndWriteUnsafe('new-file.txt', data);
                expect(mockedFs.writeFile).toHaveBeenCalledWith(
                    'mock/path/to/new-file.txt',
                    data,
                    { flag: 'wx', encoding: 'utf-8' },
                );
            });
        });

        describe('deleteUnsafe', () => {
             it('should delete a file using fs.rm', async () => {
                mockedFs.rm.mockResolvedValue(undefined);
                await service.deleteUnsafe('test.txt');
                expect(mockedFs.rm).toHaveBeenCalledWith(
                    'mock/path/to/test.txt',
                    { force: true },
                );
            });
        });
    });

    describe('Safe methods (with lock)', () => {
        it('read() should call lockService.withLock and execute readUnsafe within the lock', async () => {
            const readUnsafeSpy = jest
                .spyOn(service, 'readUnsafe')
                .mockResolvedValue('data');

            let capturedWorker: ((lock: unknown) => Promise<any>) | null = null;
            lockService.withLock.mockImplementation(
                async (filename: string, work: (lock: unknown) => Promise<any>) => {
                    expect(filename).toBe('test.txt');
                    capturedWorker = work;
                    return work(HELD_LOCK);
                },
            );

            const result = await service.read('test.txt');

            expect(lockService.withLock).toHaveBeenCalledWith(
                'test.txt',
                expect.any(Function),
            );
            expect(capturedWorker).toBeDefined();
            expect(readUnsafeSpy).toHaveBeenCalledWith('test.txt');
            expect(result).toBe('data');
        });

        it('write() should call lockService.withLock and execute writeUnsafe within the lock', async () => {
            const writeUnsafeSpy = jest
                .spyOn(service, 'writeUnsafe')
                .mockResolvedValue(undefined);

            let capturedWorker: ((lock: unknown) => Promise<any>) | null = null;
            lockService.withLock.mockImplementation(
                async (filename: string, work: (lock: unknown) => Promise<any>) => {
                    expect(filename).toBe('test.txt');
                    capturedWorker = work;
                    return work(HELD_LOCK);
                },
            );

            // service.write()를 호출하면 내부적으로 lockService.withLock이 호출되어야 함
            await service.write('test.txt', 'data');

            // 검증: lockService.withLock이 service.write() 내부에서 호출되었는지 확인
            expect(lockService.withLock).toHaveBeenCalledWith(
                'test.txt',
                expect.any(Function),
            );
            expect(capturedWorker).toBeDefined();
            // 검증: withLock 내부에서 writeUnsafe가 호출되었는지 확인
            expect(writeUnsafeSpy).toHaveBeenCalledWith('test.txt', 'data');
        });

        it('create() should call lockService.withLock and execute createUnsafe within the lock', async () => {
            const createUnsafeSpy = jest
                .spyOn(service, 'createUnsafe')
                .mockResolvedValue(undefined);

            let capturedWorker: ((lock: unknown) => Promise<any>) | null = null;
            lockService.withLock.mockImplementation(
                async (filename: string, work: (lock: unknown) => Promise<any>) => {
                    expect(filename).toBe('test.txt');
                    capturedWorker = work;
                    return work(HELD_LOCK);
                },
            );

            const result = await service.create('test.txt');

            expect(lockService.withLock).toHaveBeenCalledWith(
                'test.txt',
                expect.any(Function),
            );
            expect(capturedWorker).toBeDefined();
            expect(createUnsafeSpy).toHaveBeenCalledWith('test.txt');
            expect(result).toBe('test.txt');
        });

        it('createAndWrite() should call lockService.withLock and execute createAndWriteUnsafe within the lock', async () => {
            const createAndWriteUnsafeSpy = jest
                .spyOn(service, 'createAndWriteUnsafe')
                .mockResolvedValue(undefined);

            let capturedWorker: ((lock: unknown) => Promise<any>) | null = null;
            lockService.withLock.mockImplementation(
                async (filename: string, work: (lock: unknown) => Promise<any>) => {
                    expect(filename).toBe('test.txt');
                    capturedWorker = work;
                    return work(HELD_LOCK);
                },
            );

            const result = await service.createAndWrite('test.txt', 'data');

            expect(lockService.withLock).toHaveBeenCalledWith(
                'test.txt',
                expect.any(Function),
            );
            expect(capturedWorker).toBeDefined();
            expect(createAndWriteUnsafeSpy).toHaveBeenCalledWith(
                'test.txt',
                'data',
            );
            expect(result).toBe('test.txt');
        });

        it('delete() should call lockService.withLock and execute deleteUnsafe within the lock', async () => {
            const deleteUnsafeSpy = jest
                .spyOn(service, 'deleteUnsafe')
                .mockResolvedValue(undefined);

            let capturedWorker: ((lock: unknown) => Promise<any>) | null = null;
            lockService.withLock.mockImplementation(
                async (filename: string, work: (lock: unknown) => Promise<any>) => {
                    expect(filename).toBe('test.txt');
                    capturedWorker = work;
                    return work(HELD_LOCK);
                },
            );

            await service.delete('test.txt');

            expect(lockService.withLock).toHaveBeenCalledWith(
                'test.txt',
                expect.any(Function),
            );
            expect(capturedWorker).toBeDefined();
            expect(deleteUnsafeSpy).toHaveBeenCalledWith('test.txt');
        });
    });

    describe('a lock compromised before the write', () => {
        const brokenLock = {
            assertHeld: () => { throw Object.assign(new Error('Lock compromised'), { code: 'STALE_LOCK' }); },
        } as any;

        beforeEach(() => {
            lockService.withLock.mockImplementation(async (_filename: string, work: (lock: unknown) => Promise<any>) => work(brokenLock));
        });

        it('write() writes nothing and fails', async () => {
            await expect(service.write('test.txt', 'data')).rejects.toMatchObject({ code: 'STALE_LOCK' });
            expect(mockedFs.writeFile).not.toHaveBeenCalled();
            expect(mockedFs.rename).not.toHaveBeenCalled();
        });

        it('create(), createAndWrite() and delete() do nothing and fail', async () => {
            await expect(service.create('test.txt')).rejects.toMatchObject({ code: 'STALE_LOCK' });
            await expect(service.createAndWrite('test.txt', 'data')).rejects.toMatchObject({ code: 'STALE_LOCK' });
            await expect(service.delete('test.txt')).rejects.toMatchObject({ code: 'STALE_LOCK' });
            expect(mockedFs.writeFile).not.toHaveBeenCalled();
            expect(mockedFs.rm).not.toHaveBeenCalled();
        });
    });
});
