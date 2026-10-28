import { ResolvedParamSchemaEntry, VersionedParamSchemaEntry } from './param-schema-entry';

/**
 * Pulls the leading "major.minor[.patch[.build]]" numeric run out of a
 * version string. Master-schema `minVersion`/`maxVersion` values are
 * already clean ("11.1"), but a real host's CUBRIDVER (from `getenv`) is
 * a full banner, e.g. `"CUBRID 11.4.5 (11.4.5.1907-7077e91) (64bit debug
 * build for Linux) (Sep 15 2026 16:22:27)"` — confirmed against a live
 * host, not just the shorter form docs/mocks use. Naively splitting that
 * whole string on "." would compare "CUBRID 11" against "4" and so on.
 */
function extractVersionNumber(version: string): string {
  return version.match(/\d+(?:\.\d+)*/)?.[0] ?? '0';
}

/**
 * Compares two "major.minor[.patch[.build]]" engine version strings
 * numerically, component by component (missing components treated as 0).
 * Returns <0, 0, or >0, matching Array.prototype.sort comparator semantics.
 */
export function compareEngineVersions(a: string, b: string): number {
  const partsA = extractVersionNumber(a).split('.').map(Number);
  const partsB = extractVersionNumber(b).split('.').map(Number);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Filters the master, version-aware schema down to what a host running
 * `engineVersion` (e.g. "11.4.5.1908", CUBRIDVER from `getenv`) actually
 * supports, and strips the version-range fields the client has no use
 * for. An entry applies when `engineVersion` falls within
 * [minVersion, maxVersion] (either bound omitted = unbounded on that side).
 */
export function resolveParamSchema(
  entries: VersionedParamSchemaEntry[],
  engineVersion: string
): ResolvedParamSchemaEntry[] {
  return entries
    .filter(({ minVersion, maxVersion }) => {
      if (minVersion && compareEngineVersions(engineVersion, minVersion) < 0) return false;
      if (maxVersion && compareEngineVersions(engineVersion, maxVersion) > 0) return false;
      return true;
    })
    .map(({ minVersion, maxVersion, ...resolved }) => resolved);
}
