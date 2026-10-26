/**
 * Semver 2.0.0 precedence for release tags like "v1.4.2" or "0.1.0-alpha.1".
 * Build metadata (anything after "+") is ignored, as the spec requires.
 */
interface ParsedVersion {
  core: [number, number, number];
  prerelease: string[];
}

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseVersion(raw: string): ParsedVersion | null {
  const match = SEMVER_PATTERN.exec(raw.trim().replace(/^v/i, '').split('+')[0]);
  if (!match) {
    return null;
  }

  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

export function isPrereleaseVersion(raw: string): boolean {
  return (parseVersion(raw)?.prerelease.length ?? 0) > 0;
}

function compareIdentifiers(a: string, b: string): number {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) {
    return Number(a) - Number(b);
  }
  if (aNumeric !== bNumeric) {
    return aNumeric ? -1 : 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Negative when a < b, positive when a > b, 0 when equal. Both must be valid versions. */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  for (let i = 0; i < 3; i += 1) {
    if (a.core[i] !== b.core[i]) {
      return a.core[i] - b.core[i];
    }
  }

  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return b.prerelease.length - a.prerelease.length;
  }

  const length = Math.min(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < length; i += 1) {
    const result = compareIdentifiers(a.prerelease[i], b.prerelease[i]);
    if (result !== 0) {
      return result;
    }
  }
  return a.prerelease.length - b.prerelease.length;
}

/** Returns true when `latest` is strictly newer than `current`. Invalid versions compare as not-newer. */
export function isNewerVersion(latest: string, current: string): boolean {
  const parsedLatest = parseVersion(latest);
  const parsedCurrent = parseVersion(current);
  if (!parsedLatest || !parsedCurrent) {
    return false;
  }
  return compareVersions(parsedLatest, parsedCurrent) > 0;
}
