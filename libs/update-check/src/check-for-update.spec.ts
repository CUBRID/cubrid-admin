import { checkForUpdate } from './check-for-update';
import { ReleaseAsset } from './match-asset';

const assets: ReleaseAsset[] = [
  { name: 'cubrid-admin-desktop-2.0.0-mac-arm64.zip', browser_download_url: 'https://github.com/a/mac-arm64.zip' },
  { name: 'cubrid-webmanager-server-2.0.0.tar.gz', browser_download_url: 'https://github.com/a/server.tar.gz' },
];

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/CUBRID/cubrid-admin/releases/tag/${tag}`,
  draft: false,
  prerelease: false,
  assets,
  ...extra,
});

function respondWith(body: unknown, status = 200): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('checkForUpdate', () => {
  it('queries the official repo release list with GitHub-required headers', async () => {
    const fetchImpl = respondWith([]);

    await checkForUpdate({ currentVersion: '1.0.0', packageType: 'server', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/CUBRID/cubrid-admin/releases?per_page=30');
    expect(init.headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cubrid-admin-update-check',
    });
    expect(init.signal).toBeDefined();
  });

  it('uses an explicit repo when given', async () => {
    const fetchImpl = respondWith([]);

    await checkForUpdate({ currentVersion: '1.0.0', packageType: 'server', repo: 'owner/fork', fetchImpl });

    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.github.com/repos/owner/fork/releases?per_page=30');
  });

  it('reports update-available with the asset matching the package type', async () => {
    const result = await checkForUpdate({
      currentVersion: '1.4.2',
      packageType: 'desktop-mac-arm64',
      fetchImpl: respondWith([release('v2.0.0')]),
    });

    expect(result).toEqual({
      status: 'update-available',
      latestVersion: '2.0.0',
      downloadUrl: 'https://github.com/a/mac-arm64.zip',
      releaseNotesUrl: 'https://github.com/CUBRID/cubrid-admin/releases/tag/v2.0.0',
    });
  });

  it('falls back to the release page when no asset matches', async () => {
    const result = await checkForUpdate({
      currentVersion: '1.4.2',
      packageType: 'desktop-win-x64',
      fetchImpl: respondWith([release('v2.0.0')]),
    });

    expect(result).toMatchObject({
      status: 'update-available',
      downloadUrl: 'https://github.com/CUBRID/cubrid-admin/releases/tag/v2.0.0',
    });
  });

  it('picks the highest version, not the first or most recent entry', async () => {
    const result = await checkForUpdate({
      currentVersion: '1.0.0',
      packageType: 'server',
      fetchImpl: respondWith([release('v1.2.0'), release('v1.10.0'), release('v1.9.0')]),
    });

    expect(result).toMatchObject({ status: 'update-available', latestVersion: '1.10.0' });
  });

  it('ignores drafts and unparseable tags', async () => {
    const result = await checkForUpdate({
      currentVersion: '1.0.0',
      packageType: 'server',
      fetchImpl: respondWith([release('v9.0.0', { draft: true }), release('nightly'), release('v1.1.0')]),
    });

    expect(result).toMatchObject({ status: 'update-available', latestVersion: '1.1.0' });
  });

  describe('prerelease channel', () => {
    it('never offers a prerelease to a stable install', async () => {
      const result = await checkForUpdate({
        currentVersion: '1.0.0',
        packageType: 'server',
        fetchImpl: respondWith([
          release('v2.0.0-alpha.1', { prerelease: true }),
          release('v2.0.0-beta.1'), // prerelease tag even though GitHub flag is off
        ]),
      });

      expect(result).toEqual({ status: 'error', reason: 'no-release' });
    });

    it('offers a newer prerelease to a prerelease install', async () => {
      const result = await checkForUpdate({
        currentVersion: '0.1.0-alpha.1',
        packageType: 'server',
        fetchImpl: respondWith([release('v0.1.0-alpha.2', { prerelease: true })]),
      });

      expect(result).toMatchObject({ status: 'update-available', latestVersion: '0.1.0-alpha.2' });
    });

    it('reports up-to-date when the newest prerelease is the running version', async () => {
      const result = await checkForUpdate({
        currentVersion: '0.1.0-alpha.1',
        packageType: 'server',
        fetchImpl: respondWith([release('v0.1.0-alpha.1', { prerelease: true })]),
      });

      expect(result).toEqual({ status: 'up-to-date' });
    });

    it('offers a stable release to a prerelease install of the same version', async () => {
      const result = await checkForUpdate({
        currentVersion: '0.1.0-alpha.1',
        packageType: 'server',
        fetchImpl: respondWith([release('v0.1.0-alpha.1', { prerelease: true }), release('v0.1.0')]),
      });

      expect(result).toMatchObject({ status: 'update-available', latestVersion: '0.1.0' });
    });
  });

  it('reports up-to-date when current version is not older', async () => {
    const result = await checkForUpdate({
      currentVersion: '2.0.0',
      packageType: 'server',
      fetchImpl: respondWith([release('v2.0.0'), release('v1.0.0')]),
    });

    expect(result).toEqual({ status: 'up-to-date' });
  });

  it('reports no-release for an empty release list', async () => {
    const result = await checkForUpdate({ currentVersion: '1.0.0', packageType: 'server', fetchImpl: respondWith([]) });

    expect(result).toEqual({ status: 'error', reason: 'no-release' });
  });

  it('reports no-release on a 404', async () => {
    const result = await checkForUpdate({
      currentVersion: '1.0.0',
      packageType: 'server',
      fetchImpl: respondWith({ message: 'Not Found' }, 404),
    });

    expect(result).toEqual({ status: 'error', reason: 'no-release' });
  });

  it.each([403, 429])('reports rate-limited on a %d', async (status) => {
    const result = await checkForUpdate({
      currentVersion: '1.0.0',
      packageType: 'server',
      fetchImpl: respondWith({}, status),
    });

    expect(result).toEqual({ status: 'error', reason: 'rate-limited' });
  });

  it('reports a network error on other non-OK statuses', async () => {
    const result = await checkForUpdate({
      currentVersion: '1.0.0',
      packageType: 'server',
      fetchImpl: respondWith({}, 502),
    });

    expect(result).toEqual({ status: 'error', reason: 'network' });
  });

  it('reports parse-error for a non-array body', async () => {
    const result = await checkForUpdate({
      currentVersion: '1.0.0',
      packageType: 'server',
      fetchImpl: respondWith({ unexpected: true }),
    });

    expect(result).toEqual({ status: 'error', reason: 'parse-error' });
  });

  it('reports parse-error when the body is not valid JSON', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });

    const result = await checkForUpdate({ currentVersion: '1.0.0', packageType: 'server', fetchImpl });

    expect(result).toEqual({ status: 'error', reason: 'parse-error' });
  });

  it('reports parse-error without calling GitHub when the running version is invalid', async () => {
    const fetchImpl = respondWith([]);

    const result = await checkForUpdate({ currentVersion: 'dev', packageType: 'server', fetchImpl });

    expect(result).toEqual({ status: 'error', reason: 'parse-error' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a network error when fetch throws', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('fetch failed'));

    const result = await checkForUpdate({ currentVersion: '1.0.0', packageType: 'server', fetchImpl });

    expect(result).toEqual({ status: 'error', reason: 'network' });
  });

  it('aborts and reports a network error when the request hangs past the timeout', async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
    );

    const started = Date.now();
    const result = await checkForUpdate({
      currentVersion: '1.0.0',
      packageType: 'server',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 50,
    });

    expect(result).toEqual({ status: 'error', reason: 'network' });
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
