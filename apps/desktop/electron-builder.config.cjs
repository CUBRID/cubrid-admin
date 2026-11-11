// electron-builder settings. The version comes from scripts/product-version.cjs:
// the app's package.json "version" stays major.minor.patch (semver), and
// buildVersion (macOS CFBundleVersion, Windows FileVersion) is
// major.minor.patch.commit_num, numbers only (e.g. 0.1.0.0001).
const { execFileSync } = require('child_process');
const path = require('path');
const { productVersion } = require('../../scripts/product-version.cjs');

const { base, commitNum, version } = productVersion();

const BOTH_ARCHS = ['x64', 'arm64'];
const targets = (...names) => names.map((target) => ({ target, arch: BOTH_ARCHS }));
// Release file names (scripts/archive-packages.mjs collects them into dist/release):
// CUBRID-Admin-desktop-<version>-<os>-<arch>[-setup|-portable].<ext>. Linux packages
// get the Linux arch name (x86_64, aarch64); the archive script renames them to x64 and arm64.
const fileName = (os, form = '') => `CUBRID-Admin-desktop-${version}-${os}-\${arch}${form}.\${ext}`;

// The Linux rpm needs rpmbuild on the build host; without it only the rpm is left out.
function hasRpmbuild() {
  try {
    execFileSync('rpmbuild', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    console.log('  • rpmbuild not found: the Linux rpm package is skipped (install rpm to build it)');
    return false;
  }
}

module.exports = {
  appId: 'com.cubrid.webmanager',
  productName: 'CUBRID Admin',
  electronVersion: '35.7.5',
  asar: false,
  buildVersion: version,
  // Windows ProductVersion: major.minor.patch.<buildNumber>.
  buildNumber: commitNum,
  directories: {
    // Only the desktop app's own runtime files and dependencies go into
    // resources/app (scripts/stage-desktop-app.mjs, run by desktop:package).
    app: 'dist/apps/desktop-app',
    output: 'dist/portable',
    // CUBRID icons: icon.png (512), icon.icns (mac), icon.ico (win) — see build-resources/README
    buildResources: 'apps/desktop/build-resources',
  },
  files: ['dist/apps/desktop/**/*', 'dist/libs/update-check/**/*', 'package.json'],
  extraMetadata: {
    name: 'cubrid-admin-desktop',
    // Electron names the app (and its userData folder) after productName:
    // ~/Library/Application Support/CUBRID Admin, %APPDATA%\CUBRID Admin, ~/.config/CUBRID Admin.
    productName: 'CUBRID Admin',
    // Windows CompanyName and FileDescription of the app and the installer / portable exe.
    author: { name: 'CUBRID Corporation' },
    description: 'CUBRID Admin',
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
  // No Apple Developer signing / notarization (see README Desktop).
  forceCodeSigning: false,
  mac: {
    notarize: false,
    gatekeeperAssess: false,
    // Skip Developer ID lookup (avoids hanging when no cert is configured).
    identity: null,
    // Installer: dmg. Portable: zip of the .app.
    target: targets('dmg', 'zip'),
    artifactName: fileName('macos'),
  },
  // Installer: nsis (per user, the user picks the folder). Portable: one exe that
  // keeps its settings beside itself (PORTABLE_EXECUTABLE_DIR).
  win: { target: targets('nsis', 'portable') },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    // One installer per arch, not one with both.
    buildUniversalInstaller: false,
    artifactName: fileName('windows', '-setup'),
  },
  portable: { buildUniversalInstaller: false, artifactName: fileName('windows', '-portable') },
  // Installer: rpm. Portable: AppImage.
  linux: {
    target: hasRpmbuild() ? targets('rpm', 'AppImage') : targets('AppImage'),
    artifactName: fileName('linux'),
  },
  // Without a Developer ID the app keeps Electron's own ad-hoc signature, which
  // no longer matches the packed bundle ("code has no resources but signature
  // indicates they must be present"), so a downloaded copy is reported as
  // damaged. Sign the whole bundle ad-hoc again. afterSign does not run when
  // signing is skipped, so this is afterPack.
  afterPack: (context) => {
    if (context.electronPlatformName !== 'darwin') {
      return;
    }
    const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    if (process.platform !== 'darwin') {
      console.log(`  • skipped ad-hoc re-sign of ${app}: codesign needs a macOS host`);
      return;
    }
    console.log(`  • ad-hoc re-sign ${app}`);
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
    execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  },
};
