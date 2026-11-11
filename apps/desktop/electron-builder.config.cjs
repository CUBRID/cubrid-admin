// electron-builder settings. The version comes from scripts/product-version.cjs:
// the app's package.json "version" stays major.minor.patch (semver), and
// buildVersion (macOS CFBundleVersion, Windows FileVersion) is
// major.minor.patch.commit_num, numbers only (e.g. 0.1.0.0001).
const { productVersion } = require('../../scripts/product-version.cjs');

const { base, version } = productVersion();

module.exports = {
  appId: 'com.cubrid.webmanager',
  productName: 'CUBRID Admin',
  electronVersion: '35.7.5',
  asar: false,
  buildVersion: version,
  directories: {
    output: 'dist/portable',
    // CUBRID icons: icon.png (512), icon.icns (mac), icon.ico (win) — see build-resources/README
    buildResources: 'apps/desktop/build-resources',
  },
  files: ['dist/apps/desktop/**/*', 'dist/libs/update-check/**/*', 'package.json'],
  extraMetadata: {
    name: 'cubrid-admin-desktop',
    version: base,
    main: 'dist/apps/desktop/main.js',
  },
  extraResources: [
    { from: 'dist/apps/web-manager', to: 'web-manager' },
    {
      from: 'dist/apps/api-server',
      to: 'api-server',
      filter: ['**/*', '!node_modules/**', '!**/*.map'],
    },
    { from: 'dist/apps/api-server/node_modules', to: 'api-server/node_modules' },
  ],
  // Local portable builds: no Apple Developer signing / notarization (see README Desktop).
  forceCodeSigning: false,
  mac: {
    notarize: false,
    gatekeeperAssess: false,
    // Skip Developer ID lookup (avoids hanging when no cert is configured).
    identity: null,
    target: ['dir'],
  },
  win: { target: ['dir'] },
  linux: { target: ['dir'] },
};
