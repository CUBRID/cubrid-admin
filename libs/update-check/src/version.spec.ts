import { compareVersions, isNewerVersion, isPrereleaseVersion, parseVersion } from './version';

function v(raw: string) {
  const parsed = parseVersion(raw);
  if (!parsed) {
    throw new Error(`invalid test version ${raw}`);
  }
  return parsed;
}

describe('parseVersion', () => {
  it('accepts a leading v and ignores build metadata', () => {
    expect(parseVersion('v1.2.3+build.7')).toEqual({ core: [1, 2, 3], prerelease: [] });
  });

  it('keeps hyphens inside prerelease identifiers', () => {
    expect(parseVersion('1.0.0-alpha-1.2')?.prerelease).toEqual(['alpha-1', '2']);
  });

  it.each(['garbage', '1.2', '1.2.3.4', '1..3', '01.2.3', '1.2.3-', '1.2.3-alpha..1', ''])(
    'rejects %p',
    (raw) => {
      expect(parseVersion(raw)).toBeNull();
    }
  );
});

describe('isPrereleaseVersion', () => {
  it('detects prerelease versions', () => {
    expect(isPrereleaseVersion('0.1.0-alpha.1')).toBe(true);
    expect(isPrereleaseVersion('v0.1.0')).toBe(false);
    expect(isPrereleaseVersion('garbage')).toBe(false);
  });
});

describe('compareVersions (semver precedence)', () => {
  // The ordering example straight from the semver 2.0.0 spec, section 11.
  const ordered = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
  ];

  it('orders the semver spec example correctly', () => {
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const lower = v(ordered[i]);
      const higher = v(ordered[i + 1]);
      expect(compareVersions(lower, higher)).toBeLessThan(0);
      expect(compareVersions(higher, lower)).toBeGreaterThan(0);
    }
  });

  it('compares numeric prerelease identifiers numerically, not as strings', () => {
    expect(compareVersions(v('0.1.0-alpha.10'), v('0.1.0-alpha.9'))).toBeGreaterThan(0);
  });

  it('treats equal versions as equal regardless of build metadata', () => {
    expect(compareVersions(v('v1.2.3+a'), v('1.2.3+b'))).toBe(0);
  });
});

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
    expect(isNewerVersion('1.1.0-beta.1', '1.1.0')).toBe(false);
  });

  it('returns false when either version fails to parse', () => {
    expect(isNewerVersion('garbage', '1.1.0')).toBe(false);
    expect(isNewerVersion('1.1.0', 'garbage')).toBe(false);
  });
});
