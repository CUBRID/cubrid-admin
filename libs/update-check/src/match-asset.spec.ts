import { findAssetForPackageType, ReleaseAsset } from './match-asset';

const assets: ReleaseAsset[] = [
  { name: 'cubrid-admin-desktop-1.4.2-mac-arm64.zip', browser_download_url: 'A' },
  { name: 'cubrid-admin-desktop-1.4.2-mac-x64.zip', browser_download_url: 'B' },
  { name: 'cubrid-webmanager-server-1.4.2.tar.gz', browser_download_url: 'C' },
];

describe('findAssetForPackageType', () => {
  it('matches the mac arm64 desktop asset', () => {
    expect(findAssetForPackageType(assets, 'desktop-mac-arm64')?.browser_download_url).toBe('A');
  });

  it('matches the mac x64 desktop asset', () => {
    expect(findAssetForPackageType(assets, 'desktop-mac-x64')?.browser_download_url).toBe('B');
  });

  it('matches the server tarball', () => {
    expect(findAssetForPackageType(assets, 'server')?.browser_download_url).toBe('C');
  });

  it('returns undefined when no asset matches', () => {
    expect(findAssetForPackageType(assets, 'desktop-win-x64')).toBeUndefined();
  });
});
