import { findAssetForPackageType, ReleaseAsset } from './match-asset';
import { DEFAULT_UPDATE_REPO } from './repo';
import { CheckForUpdateOptions, UpdateCheckResult } from './types';
import { compareVersions, isPrereleaseVersion, parseVersion } from './version';

const DEFAULT_TIMEOUT_MS = 5000;
// GitHub lists releases newest-created first, not by version, so every page
// is read until a short page ends the list. 100 is GitHub's maximum page
// size; the page cap (1000 releases) only bounds a runaway loop.
const RELEASES_PAGE_SIZE = 100;
const MAX_RELEASE_PAGES = 10;

interface GithubRelease {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets?: ReleaseAsset[];
}

/**
 * Picks the highest-versioned published release from the repo's releases.
 * Prereleases (flagged on GitHub, or carrying a semver prerelease tag like
 * "-alpha.1") are only candidates when the running version is itself a
 * prerelease — a stable install is never offered an alpha.
 *
 * Deliberately not `/releases/latest`: that endpoint skips prereleases
 * entirely and orders by date rather than version.
 */
function pickLatestRelease(releases: GithubRelease[], currentVersion: string): GithubRelease | null {
  const allowPrerelease = isPrereleaseVersion(currentVersion);
  let best: { release: GithubRelease; version: NonNullable<ReturnType<typeof parseVersion>> } | null = null;

  for (const release of releases) {
    if (release.draft || typeof release.tag_name !== 'string') {
      continue;
    }
    const version = parseVersion(release.tag_name);
    if (!version) {
      continue;
    }
    const isPrerelease = release.prerelease || version.prerelease.length > 0;
    if (isPrerelease && !allowPrerelease) {
      continue;
    }
    if (!best || compareVersions(version, best.version) > 0) {
      best = { release, version };
    }
  }

  return best?.release ?? null;
}

/**
 * Checks GitHub Releases for a newer release than `currentVersion`.
 * Never throws — network/parse/rate-limit failures resolve to a
 * `{ status: 'error' }` result so callers (desktop app, server) can fail
 * silently rather than block startup or surface noise to the user.
 */
export async function checkForUpdate(options: CheckForUpdateOptions): Promise<UpdateCheckResult> {
  const {
    currentVersion,
    packageType,
    repo = DEFAULT_UPDATE_REPO,
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const current = parseVersion(currentVersion);
  if (!current) {
    return { status: 'error', reason: 'parse-error' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const releases: GithubRelease[] = [];
    for (let page = 1; page <= MAX_RELEASE_PAGES; page++) {
      const response = await fetchImpl(
        `https://api.github.com/repos/${repo}/releases?per_page=${RELEASES_PAGE_SIZE}&page=${page}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'cubrid-admin-update-check',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          signal: controller.signal,
        }
      );

      // Any failed page fails the whole check: a partial list could hide
      // the newest release and report a false "up to date".
      if (response.status === 404) {
        return { status: 'error', reason: 'no-release' };
      }
      if (response.status === 403 || response.status === 429) {
        return { status: 'error', reason: 'rate-limited' };
      }
      if (!response.ok) {
        return { status: 'error', reason: 'network' };
      }

      let pageReleases: unknown;
      try {
        pageReleases = await response.json();
      } catch {
        return { status: 'error', reason: 'parse-error' };
      }
      if (!Array.isArray(pageReleases)) {
        return { status: 'error', reason: 'parse-error' };
      }

      releases.push(...(pageReleases as GithubRelease[]));
      if (pageReleases.length < RELEASES_PAGE_SIZE) {
        break;
      }
    }

    const latest = pickLatestRelease(releases, currentVersion);
    if (!latest) {
      return { status: 'error', reason: 'no-release' };
    }

    const latestVersion = parseVersion(latest.tag_name);
    if (!latestVersion || compareVersions(latestVersion, current) <= 0) {
      return { status: 'up-to-date' };
    }

    const asset = findAssetForPackageType(latest.assets ?? [], packageType);

    return {
      status: 'update-available',
      latestVersion: latest.tag_name.replace(/^v/i, ''),
      downloadUrl: asset?.browser_download_url ?? latest.html_url,
      releaseNotesUrl: latest.html_url,
    };
  } catch {
    return { status: 'error', reason: 'network' };
  } finally {
    clearTimeout(timeout);
  }
}
