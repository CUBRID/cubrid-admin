import { isNewerVersion } from './version';

describe('isNewerVersion', () => {
  it('detects a newer minor version', () => {
    expect(isNewerVersion('v1.2.0', '1.1.0')).toBe(true);
  });

  it('returns false for an identical version', () => {
    expect(isNewerVersion('1.1.0', '1.1.0')).toBe(false);
  });

  it('returns false for an older version', () => {
    expect(isNewerVersion('1.0.9', '1.1.0')).toBe(false);
  });

  it('treats a release as newer than its own prerelease', () => {
    expect(isNewerVersion('1.1.0', '1.1.0-beta.1')).toBe(true);
  });

  it('returns false when either version fails to parse', () => {
    expect(isNewerVersion('garbage', '1.1.0')).toBe(false);
    expect(isNewerVersion('1.1.0', 'garbage')).toBe(false);
  });
});
