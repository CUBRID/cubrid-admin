import { checkForUpdate } from './check-for-update';
import { ReleaseAsset } from './match-asset';

const assets: ReleaseAsset[] = [
  { name: 'cubrid-admin-desktop-1.4.2-mac-arm64.zip', browser_download_url: 'A' },
];

function fakeFetch(response: Partial<Response> & { status: number }): typeof fetch {
  return jest.fn().mockResolvedValue(response) as unknown as typeof fetch;
}

describe('checkForUpdate', () => {
  it('reports update-available with the matching asset url', async () => {
    const fetchImpl = fakeFetch({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v2.0.0', html_url: 'https://github.com/x/releases/v2.0.0', assets }),
    });

    const result = await checkForUpdate({
      currentVersion: '1.4.2',
      packageType: 'desktop-mac-arm64',
      fetchImpl,
    });

    expect(result).toEqual({
      status: 'update-available',
      latestVersion: '2.0.0',
      downloadUrl: 'A',
      releaseNotesUrl: 'https://github.com/x/releases/v2.0.0',
    });
  });

  it('falls back to the release page when no asset matches', async () => {
    const fetchImpl = fakeFetch({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v2.0.0', html_url: 'https://github.com/x/releases/v2.0.0', assets: [] }),
    });

    const result = await checkForUpdate({
      currentVersion: '1.4.2',
      packageType: 'server',
      fetchImpl,
    });

    expect(result).toMatchObject({ status: 'update-available', downloadUrl: 'https://github.com/x/releases/v2.0.0' });
  });

  it('reports up-to-date when current version is not older', async () => {
    const fetchImpl = fakeFetch({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v2.0.0', html_url: 'https://github.com/x/releases/v2.0.0', assets }),
    });

    const result = await checkForUpdate({ currentVersion: '2.0.0', packageType: 'server', fetchImpl });

    expect(result).toEqual({ status: 'up-to-date' });
  });

  it('reports no-release on a 404', async () => {
    const result = await checkForUpdate({
      currentVersion: '1.0.0',
      packageType: 'server',
      fetchImpl: fakeFetch({ ok: false, status: 404 }),
    });

    expect(result).toEqual({ status: 'error', reason: 'no-release' });
  });

  it('reports rate-limited on a 403', async () => {
    const result = await checkForUpdate({
      currentVersion: '1.0.0',
      packageType: 'server',
      fetchImpl: fakeFetch({ ok: false, status: 403 }),
    });

    expect(result).toEqual({ status: 'error', reason: 'rate-limited' });
  });

  it('reports a network error when fetch throws', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch;

    const result = await checkForUpdate({ currentVersion: '1.0.0', packageType: 'server', fetchImpl });

    expect(result).toEqual({ status: 'error', reason: 'network' });
  });
});
