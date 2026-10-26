import { DatabaseErrorCode } from '@error/database/database-error-code';
import { AppError } from '@error/app-error';
import { convertExvolArrayToCmsFormat, parseExvolArray } from './parse-exvol';

function publicDetail(fn: () => unknown): { code: string; detail: string } {
  try {
    fn();
  } catch (e) {
    const err = e as AppError;
    return { code: err.code, detail: err.toProblemDetails().detail };
  }
  throw new Error('expected to throw');
}

describe('convertExvolArrayToCmsFormat public error message', () => {
  const base = { type: 'data', size: 512, pagesize: 16384, volpath: '/data/testdb' };

  it('converts a valid volume', () => {
    expect(convertExvolArrayToCmsFormat([{ v1: base }])).toEqual([
      { v1: 'data;32768;/data/testdb' },
    ]);
  });

  it('surfaces the size cause through ConvertVolumeFailed', () => {
    expect(publicDetail(() => convertExvolArrayToCmsFormat([{ v1: { ...base, size: 0 } }]))).toEqual({
      code: DatabaseErrorCode.CONVERT_VOLUME_FAILED,
      detail: 'Volume "v1": Volume size and pagesize must be positive numbers',
    });
  });

  it('surfaces the required-field cause through ConvertVolumeFailed', () => {
    expect(publicDetail(() => convertExvolArrayToCmsFormat([{ v1: { ...base, volpath: '' } }]))).toEqual({
      code: DatabaseErrorCode.CONVERT_VOLUME_FAILED,
      detail: 'Volume "v1": Volume info must have type and volpath',
    });
  });

  it('keeps the generic message for non-validation failures', () => {
    expect(publicDetail(() => convertExvolArrayToCmsFormat([{ v1: null as any }]))).toEqual({
      code: DatabaseErrorCode.CONVERT_VOLUME_FAILED,
      detail: 'Invalid volume information.',
    });
  });
});

describe('parseExvolArray public error message', () => {
  it('surfaces the cause through ParseVolumeFailed when the cause has a message', () => {
    expect(publicDetail(() => parseExvolArray([{ v1: '' }]))).toEqual({
      code: DatabaseErrorCode.PARSE_VOLUME_FAILED,
      detail: 'Volume "v1": Volume string must be a non-empty string',
    });
  });
});
