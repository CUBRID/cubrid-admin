import { findAssetForPackageType, ReleaseAsset } from './match-asset';
import { CheckForUpdateOptions, UpdateCheckResult } from './types';
import { isNewerVersion } from './version';

const DEFAULT_REPO = 'cubrid/cubrid-webmanager';
const DEFAULT_TIMEOUT_MS = 5000;

interface GithubLatestReleaseResponse {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
}

/**
 * Checks the GitHub Releases API for a newer release than `currentVersion`.
 * Never throws — network/parse/rate-limit failures resolve to a
 * `{ status: 'error' }` result so callers (desktop app, server) can fail
 * silently rather than block startup or surface noise to the user.
 */
export async function checkForUpdate(options: CheckForUpdateOptions): Promise<UpdateCheckResult> {
  const {
    currentVersion,
    packageType,
    repo = DEFAULT_REPO,
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });

    if (response.status === 404) {
      return { status: 'error', reason: 'no-release' };
    }
    if (response.status === 403) {
      return { status: 'error', reason: 'rate-limited' };
    }
    if (!response.ok) {
      return { status: 'error', reason: 'network' };
    }

    const release = (await response.json()) as GithubLatestReleaseResponse;
    if (!release.tag_name) {
      return { status: 'error', reason: 'parse-error' };
    }

    if (!isNewerVersion(release.tag_name, currentVersion)) {
      return { status: 'up-to-date' };
    }

    const asset = findAssetForPackageType(release.assets ?? [], packageType);

    return {
      status: 'update-available',
      latestVersion: release.tag_name.replace(/^v/i, ''),
      downloadUrl: asset?.browser_download_url ?? release.html_url,
      releaseNotesUrl: release.html_url,
    };
  } catch {
    return { status: 'error', reason: 'network' };
  } finally {
    clearTimeout(timeout);
  }
}
