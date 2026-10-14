import { DatabaseErrorCode } from '@error/database/database-error-code';
import { DatabaseError } from '@error/database/database-error';
import {
  MAX_GENERAL_VOLUME_SIZE_BYTES,
  assertValidGeneralVolumeSize,
} from './database-volume-size';

describe('assertValidGeneralVolumeSize', () => {
  it('accepts a general volume exactly at 20 GB', () => {
    expect(assertValidGeneralVolumeSize(1310720, 16384)).toEqual({
      numPages: 1310720,
      pageSizeBytes: 16384,
      sizeBytes: MAX_GENERAL_VOLUME_SIZE_BYTES,
    });
  });

  it('rejects a general volume greater than 20 GB', () => {
    expect(() => assertValidGeneralVolumeSize(1310721, 16384)).toThrow(
      expect.objectContaining({ code: DatabaseErrorCode.INVALID_VOLUME_SIZE })
    );
  });

  it('reports the requested and maximum sizes for API clients', () => {
    try {
      assertValidGeneralVolumeSize(1310721, 16384);
      throw new Error('Expected volume validation to fail');
    } catch (error) {
      if (!(error instanceof DatabaseError)) throw error;
      expect(error.toProblemDetails()).toMatchObject({
        requestedSizeBytes: 21474852864,
        maximumSizeBytes: MAX_GENERAL_VOLUME_SIZE_BYTES,
      });
    }
  });

  it.each([
    [0, 16384],
    [-1, 16384],
    ['invalid', 16384],
    [1, 0],
    [1, -1],
    [1, 'invalid'],
  ])('rejects invalid page values (%s, %s)', (numpage, pagesize) => {
    expect(() => assertValidGeneralVolumeSize(numpage, pagesize)).toThrow(
      expect.objectContaining({ code: DatabaseErrorCode.INVALID_VOLUME_SIZE })
    );
  });
});
