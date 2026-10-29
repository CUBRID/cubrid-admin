export const DEFAULT_UPDATE_REPO = 'CUBRID/cubrid-admin';

const REPO_SEGMENT = /^[A-Za-z0-9_.-]+$/;

/**
 * Returns `override` when it's a well-formed "owner/repo", otherwise the
 * official repo. Lets an operator point the check at a fork or mirror
 * without letting an arbitrary string reshape the GitHub API path.
 */
export function resolveUpdateRepo(override?: string | null): string {
  const segments = override?.trim().split('/') ?? [];
  const valid =
    segments.length === 2 &&
    segments.every((segment) => REPO_SEGMENT.test(segment) && segment !== '.' && segment !== '..');
  return valid ? segments.join('/') : DEFAULT_UPDATE_REPO;
}

const TRUSTED_DOWNLOAD_HOSTS = ['github.com', 'objects.githubusercontent.com'];

export function isTrustedDownloadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && TRUSTED_DOWNLOAD_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}
