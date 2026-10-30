import { describe, expect, it } from 'vitest';
import {
  checkCmsPassword,
  checkDbPassword,
  CMS_PASSWORD_MAX_BYTES,
  DB_PASSWORD_MAX_BYTES,
  utf8ByteLength,
} from '@api-interfaces';

describe('password rules shared with the api-server', () => {
  it('counts UTF-8 bytes, as strlen in the engine and CMS does', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('가나')).toBe(6);
  });

  it('allows an empty database password and rejects one over 31 bytes', () => {
    expect(checkDbPassword('')).toBeNull();
    expect(checkDbPassword('a'.repeat(DB_PASSWORD_MAX_BYTES))).toBeNull();
    expect(checkDbPassword('a'.repeat(DB_PASSWORD_MAX_BYTES + 1))).toBe('tooLong');
    // 11 Hangul characters are 33 bytes.
    expect(checkDbPassword('가'.repeat(11))).toBe('tooLong');
  });

  it('requires a CMS password and rejects one over 32 bytes', () => {
    expect(checkCmsPassword('')).toBe('required');
    expect(checkCmsPassword('a'.repeat(CMS_PASSWORD_MAX_BYTES))).toBeNull();
    expect(checkCmsPassword('a'.repeat(CMS_PASSWORD_MAX_BYTES + 1))).toBe('tooLong');
  });
});
