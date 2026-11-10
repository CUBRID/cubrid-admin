import { DatabaseError } from '@error/database/database-error';

export const MAX_GENERAL_VOLUME_SIZE_BYTES = 20 * 1024 * 1024 * 1024;

export type GeneralVolumeSize = {
  numPages: number;
  pageSizeBytes: number;
  sizeBytes: number;
};

export function assertValidGeneralVolumeSize(
  numpage: string | number,
  pagesize: string | number
): GeneralVolumeSize {
  const numPages = Number(numpage);
  const pageSizeBytes = Number(pagesize);

  if (!Number.isFinite(numPages) || numPages <= 0) {
    throw DatabaseError.InvalidVolumeSize('General volume page count must be a positive number', {
      reason: 'VOLUME_PAGE_COUNT_NOT_POSITIVE',
      parameter: 'numpage',
      numpage,
    });
  }

  if (!Number.isFinite(pageSizeBytes) || pageSizeBytes <= 0) {
    throw DatabaseError.InvalidVolumeSize('General volume page size must be a positive number', {
      reason: 'VOLUME_PAGE_SIZE_NOT_POSITIVE',
      parameter: 'pagesize',
      pagesize,
    });
  }

  const sizeBytes = numPages * pageSizeBytes;
  if (!Number.isFinite(sizeBytes) || sizeBytes > MAX_GENERAL_VOLUME_SIZE_BYTES) {
    throw DatabaseError.InvalidVolumeSize('General volume size must not exceed 20 GB', {
      reason: 'VOLUME_SIZE_TOO_LARGE',
      parameter: 'generalVolumeSize',
      requestedSizeBytes: sizeBytes,
      maximumSizeBytes: MAX_GENERAL_VOLUME_SIZE_BYTES,
    });
  }

  return { numPages, pageSizeBytes, sizeBytes };
}
