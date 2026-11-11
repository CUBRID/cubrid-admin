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

  it('matches release files named with major.minor.patch.commit_num', () => {
    const released: ReleaseAsset[] = [
      { name: 'CUBRID-Admin-desktop-0.1.0.0001-macos-arm64.zip', browser_download_url: 'mac-arm64' },
      { name: 'CUBRID-Admin-desktop-0.1.0.0001-macos-x64.zip', browser_download_url: 'mac-x64' },
      { name: 'CUBRID-Admin-desktop-0.1.0.0001-windows-x64.zip', browser_download_url: 'win-x64' },
      { name: 'CUBRID-Admin-desktop-0.1.0.0001-linux-x64.tar.gz', browser_download_url: 'linux-x64' },
      { name: 'CUBRID-Admin-server-0.1.0.0001-linux-x64.tar.gz', browser_download_url: 'server' },
    ];
    expect(findAssetForPackageType(released, 'desktop-mac-arm64')?.browser_download_url).toBe('mac-arm64');
    expect(findAssetForPackageType(released, 'desktop-mac-x64')?.browser_download_url).toBe('mac-x64');
    expect(findAssetForPackageType(released, 'desktop-win-x64')?.browser_download_url).toBe('win-x64');
    expect(findAssetForPackageType(released, 'desktop-linux-x64')?.browser_download_url).toBe('linux-x64');
    expect(findAssetForPackageType(released, 'server')?.browser_download_url).toBe('server');
  });

  it('returns undefined when no asset matches', () => {
    expect(findAssetForPackageType(assets, 'desktop-win-x64')).toBeUndefined();
  });
});
