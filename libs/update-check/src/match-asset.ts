import { PackageType } from './types';

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

/**
 * Naming convention CI is expected to produce for release assets, e.g.:
 *   cubrid-admin-desktop-1.4.2-mac-arm64.zip
 *   cubrid-admin-desktop-1.4.2-win-x64.zip
 *   cubrid-webmanager-server-1.4.2.tar.gz
 */
const ASSET_NAME_PATTERNS: Record<PackageType, RegExp> = {
  'desktop-mac-arm64': /desktop.*mac.*arm64/i,
  'desktop-mac-x64': /desktop.*mac.*x64/i,
  'desktop-win-x64': /desktop.*win(dows)?.*x64/i,
  'desktop-linux-x64': /desktop.*linux.*x64/i,
  server: /server.*\.(tar\.gz|tgz|zip)$/i,
};

export function findAssetForPackageType(
  assets: ReleaseAsset[],
  packageType: PackageType
): ReleaseAsset | undefined {
  const pattern = ASSET_NAME_PATTERNS[packageType];
  return assets.find((asset) => pattern.test(asset.name));
}
