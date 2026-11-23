import { StorageError } from '@error/storage/storage-error';
import { Injectable } from '@nestjs/common';
import { getStoragePath, resolveUserFilePath } from '@util';
import * as fs from 'fs/promises';
import { LockService } from '@lock/lock.service';
import { HandleStorageFsErrors } from '@decorators/handle-storage-fs-errors.decorator';

/**
 * Service for managing file storage operations.
 * 파일 스토리지 작업을 관리하는 서비스입니다.
 *
 * Provides functionality for file storage, retrieval, and management.
 * Handles file system operations and storage path resolution.
 *
 * 파일 스토리지, 검색, 관리 기능을 제공합니다.
 * 파일 시스템 작업과 스토리지 경로 해결을 처리합니다.
 *
 * @category Infrastructure Services
 * @since 1.0.0
 */
@Injectable()
export class StorageService {
    constructor(private readonly lockService: LockService) {
        this.initializeStorageDirectory();
    }

    /**
     * Initializes the storage directory, creating it if it doesn't exist.
     * 저장소 디렉토리를 초기화하고, 존재하지 않으면 생성합니다.
     *
     * @returns A Promise that resolves when the directory is initialized.
     */
    private async initializeStorageDirectory(): Promise<void> {
        try {
            await fs.mkdir(getStoragePath(), { recursive: true });
        } catch (err) {
            if (err?.code !== 'EEXIST') {
                console.warn(
                    'Failed to initialize storage directory:',
                    err?.message,
                );
            }
        }
    }

    /**
     * Handles file system errors by translating them into StorageError instances.
     * 파일 시스템 오류를 StorageError 인스턴스로 변환하여 처리합니다.
     *
     * @param err - The original file system error.
     * @throws StorageError - The translated storage error.
     */
    private handleFsError(err: any): never {
        switch (err?.code) {
            case 'ENOENT':
                throw StorageError.NoSuchFile({ filePath: err.path }, err);
            case 'EEXIST':
                throw StorageError.AlreadyExists({ filePath: err.path }, err);
            case 'EACCES':
            case 'EPERM':
                throw StorageError.PermissionDenied(
                    { filePath: err.path },
                    err,
                );
            default:
                throw StorageError.Unknown(
                    {
                        originalCode: err?.code,
                        originalMessage: err?.message,
                    },
                    err,
                );
        }
    }

    /**
     * Resolves the absolute file path for a given filename within the storage directory.
     * 저장소 디렉토리 내에서 주어진 파일 이름에 대한 절대 파일 경로를 확인합니다.
     *
     * @param filename - The name of the file.
     * @returns The absolute path to the file.
     */
    resolveFilePath(filename: string) {
        return resolveUserFilePath(filename);
    }

    /**
     * Reads the content of a file without acquiring a lock.
     * This method is considered unsafe for concurrent access.
     *
     * 잠금을 획득하지 않고 파일 내용을 읽습니다.
     * 이 메서드는 동시 액세스에 안전하지 않습니다.
     *
     * @param filename - The name of the file to read.
     * @returns A Promise that resolves with the file content as a string.
     * @throws StorageError if the file cannot be read.
     */
    @HandleStorageFsErrors()
    async readUnsafe(filename: string): Promise<string> {
        const filePath = resolveUserFilePath(filename);
        return await fs.readFile(filePath, 'utf-8');
    }

    /**
     * Reads the content of a file, ensuring atomic access using a file lock.
     * 파일 잠금을 사용하여 원자적 액세스를 보장하면서 파일 내용을 읽습니다.
     *
     * @param filename - The name of the file to read.
     * @returns A Promise that resolves with the file content as a string.
     * @throws StorageError if the file cannot be read or the lock cannot be acquired/released.
     */
    @HandleStorageFsErrors()
    async read(filename: string): Promise<string> {
        return this.lockService.withLock(filename, async () => {
            return await this.readUnsafe(filename);
        });
    }

    /**
     * Writes data to a file without acquiring a lock, using a temporary file for atomic writes.
     * 이 메서드는 잠금을 획득하지 않고 임시 파일을 사용하여 원자적으로 데이터를 파일에 씁니다.
     *
     * This method is considered unsafe for concurrent access if not wrapped by a locking mechanism.
     * 잠금 메커니즘으로 래핑되지 않으면 동시 액세스에 안전하지 않습니다.
     *
     * @param filename - The name of the file to write to.
     * @param data - The data to write to the file.
     * @returns A Promise that resolves when the data is written.
     * @throws StorageError if the file cannot be written.
     */
    @HandleStorageFsErrors()
    async writeUnsafe(filename: string, data: string): Promise<void> {
        const filePath = resolveUserFilePath(filename);
        const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;

        await fs.writeFile(tmp, data, 'utf-8');
        await fs.rename(tmp, filePath);
        await fs.rm(tmp, { force: true });
    }

    /**
     * Writes data to a file, ensuring atomic access using a file lock.
     * 파일 잠금을 사용하여 원자적 액세스를 보장하면서 파일에 데이터를 씁니다.
     *
     * @param filename - The name of the file to write to.
     * @param data - The data to write to the file.
     * @returns A Promise that resolves when the data is written.
     * @throws StorageError if the file cannot be written or the lock cannot be acquired/released.
     */
    async write(filename: string, data: string): Promise<void> {
        return this.lockService.withLock(filename, async (lock) => {
            lock.assertHeld();
            return this.writeUnsafe(filename, data);
        });
    }

    /**
     * Creates an empty file without acquiring a lock.
     * 잠금을 획득하지 않고 빈 파일을 생성합니다.
     *
     * This method is considered unsafe for concurrent access.
     * 이 메서드는 동시 액세스에 안전하지 않습니다.
     *
     * @param filename - The name of the file to create.
     * @returns A Promise that resolves when the file is created.
     * @throws StorageError if the file already exists or cannot be created.
     */
    @HandleStorageFsErrors()
    async createUnsafe(filename: string): Promise<void> {
        const filePath = resolveUserFilePath(filename);
        await fs.mkdir(getStoragePath(), { recursive: true });
        await fs.writeFile(filePath, '', { flag: 'wx' });
    }

    /**
     * Creates an empty file, ensuring atomic access using a file lock.
     * 파일 잠금을 사용하여 원자적 액세스를 보장하면서 빈 파일을 생성합니다.
     *
     * @param filename - The name of the file to create.
     * @returns A Promise that resolves with the filename when the file is created.
     * @throws StorageError if the file already exists or cannot be created, or the lock fails.
     */
    async create(filename: string): Promise<string> {
        return this.lockService.withLock(filename, async (lock) => {
            lock.assertHeld();
            await this.createUnsafe(filename);
            return filename;
        });
    }

    /**
     * Creates and writes data to a file without acquiring a lock.
     * 잠금을 획득하지 않고 파일을 생성하고 데이터를 씁니다.
     *
     * This method is considered unsafe for concurrent access.
     * 이 메서드는 동시 액세스에 안전하지 않습니다.
     *
     * @param filename - The name of the file to create and write to.
     * @param data - The data to write to the file.
     * @returns A Promise that resolves when the file is created and data is written.
     * @throws StorageError if the file already exists or cannot be created/written.
     */
    @HandleStorageFsErrors()
    async createAndWriteUnsafe(filename: string, data: string): Promise<void> {
        const filePath = resolveUserFilePath(filename);
        await fs.mkdir(getStoragePath(), { recursive: true });
        await fs.writeFile(filePath, data, { flag: 'wx', encoding: 'utf-8' });
    }

    /**
     * Creates and writes data to a file, ensuring atomic access using a file lock.
     * 파일 잠금을 사용하여 원자적 액세스를 보장하면서 파일을 생성하고 데이터를 씁니다.
     *
     * @param filename - The name of the file to create and write to.
     * @param data - The data to write to the file.
     * @returns A Promise that resolves with the filename when the operation is complete.
     * @throws StorageError if the file already exists or cannot be created/written, or the lock fails.
     */
    async createAndWrite(filename: string, data: string): Promise<string> {
        return this.lockService.withLock(filename, async (lock) => {
            lock.assertHeld();
            await this.createAndWriteUnsafe(filename, data);
            return filename;
        });
    }

    /**
     * Deletes a file without acquiring a lock.
     * 잠금을 획득하지 않고 파일을 삭제합니다.
     *
     * This method is considered unsafe for concurrent access.
     * 이 메서드는 동시 액세스에 안전하지 않습니다.
     *
     * @param filename - The name of the file to delete.
     * @returns A Promise that resolves when the file is deleted.
     * @throws StorageError if the file cannot be deleted.
     */
    @HandleStorageFsErrors()
    async deleteUnsafe(filename: string): Promise<void> {
        const filePath = resolveUserFilePath(filename);
        await fs.rm(filePath, { force: true });
    }

    /**
     * Deletes a file, ensuring atomic access using a file lock.
     * 파일 잠금을 사용하여 원자적 액세스를 보장하면서 파일을 삭제합니다.
     *
     * @param filename - The name of the file to delete.
     * @returns A Promise that resolves when the file is deleted.
     * @throws StorageError if the file cannot be deleted or the lock fails.
     */
    async delete(filename: string): Promise<void> {
        return this.lockService.withLock(filename, async (lock) => {
            lock.assertHeld();
            return this.deleteUnsafe(filename);
        });
    }
}
