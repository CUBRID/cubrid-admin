/**
 * Minimal semver-ish comparison for release tags like "v1.4.2" or "1.4.2-beta.1".
 * Build metadata (anything after "+") is ignored, as semver specifies.
 * A version with a prerelease identifier is considered lower than the same
 * MAJOR.MINOR.PATCH without one.
 */
interface ParsedVersion {
  core: [number, number, number];
  prerelease: string | null;
}

export function parseVersion(raw: string): ParsedVersion | null {
  const withoutBuildMeta = raw.trim().replace(/^v/i, '').split('+')[0];
  const [corePart, prerelease = null] = withoutBuildMeta.split('-', 2) as [string, string?];

  const segments = corePart.split('.');
  if (segments.length !== 3) {
    return null;
  }

  const core = segments.map(Number) as [number, number, number];
  if (core.some((segment) => Number.isNaN(segment))) {
    return null;
  }

  return { core, prerelease };
}

/** Returns true when `latest` is strictly newer than `current`. Invalid versions compare as not-newer. */
export function isNewerVersion(latest: string, current: string): boolean {
  const parsedLatest = parseVersion(latest);
  const parsedCurrent = parseVersion(current);
  if (!parsedLatest || !parsedCurrent) {
    return false;
  }

  for (let i = 0; i < 3; i += 1) {
    if (parsedLatest.core[i] !== parsedCurrent.core[i]) {
      return parsedLatest.core[i] > parsedCurrent.core[i];
    }
  }

  if (parsedLatest.prerelease === parsedCurrent.prerelease) {
    return false;
  }
  if (parsedLatest.prerelease === null) {
    return true;
  }
  if (parsedCurrent.prerelease === null) {
    return false;
  }
  return parsedLatest.prerelease > parsedCurrent.prerelease;
}
