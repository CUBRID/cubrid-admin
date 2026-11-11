import { PackageType } from './types';

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

/**
 * Release file names, as scripts/archive-packages.mjs writes them, e.g.:
 *   CUBRID-Admin-desktop-0.1.0.0001-macos-arm64.zip
 *   CUBRID-Admin-desktop-0.1.0.0001-windows-x64.zip
 *   CUBRID-Admin-server-0.1.0.0001-linux-x64.tar.gz
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
