// electron-builder settings. The version comes from scripts/product-version.cjs:
// the app's package.json "version" stays major.minor.patch (semver), and
// buildVersion (macOS CFBundleVersion, Windows FileVersion) is
// major.minor.patch.commit_num, numbers only (e.g. 0.1.0.0001).
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { productVersion } = require('../../scripts/product-version.cjs');

const { base, commitNum, version } = productVersion();

const BOTH_ARCHS = ['x64', 'arm64'];
const targets = (...names) => names.map((target) => ({ target, arch: BOTH_ARCHS }));
// Release file names (scripts/archive-packages.mjs collects them into dist/release):
// CUBRID-Admin-desktop-<version>-<os>-<arch>[-setup|-portable].<ext>. Linux packages
// get the Linux arch name (x86_64, aarch64, amd64); the archive script renames them to x64 and arm64.
const fileName = (os, form = '') => `CUBRID-Admin-desktop-${version}-${os}-\${arch}${form}.\${ext}`;

// The Linux deb is packed with `ar`. macOS's own ar writes an empty archive, so
// on macOS GNU ar (brew install binutils, kept out of PATH by Homebrew) is put
// first on PATH as `ar` only; without it only the deb is left out.
function hasGnuAr() {
  if (process.platform === 'darwin') {
    const gnuAr = ['/opt/homebrew/opt/binutils/bin/ar', '/usr/local/opt/binutils/bin/ar'].find((file) => fs.existsSync(file));
    if (gnuAr) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-gnu-ar-'));
      fs.symlinkSync(gnuAr, path.join(dir, 'ar'));
      process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
    }
  }
  try {
    if (/GNU ar/.test(execFileSync('ar', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))) {
      return true;
    }
  } catch {
    // not GNU ar
  }
  console.log('  • GNU ar not found: the Linux deb package is skipped (on macOS: brew install binutils)');
  return false;
}

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
  // main, preload, update-check and tslib are packed in resources/app.asar;
  // web-manager and api-server stay outside it (extraResources).
  asar: true,
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
    // Linux rpm and deb need a project URL.
    homepage: 'https://github.com/CUBRID/cubrid-admin',
    license: 'BSD-3-Clause',
    version: base,
    main: 'dist/apps/desktop/main.js',
  },
  extraResources: [
    { from: 'dist/apps/web-manager', to: 'web-manager' },
    // The api-server bundles its dependencies into main.js: no node_modules.
    { from: 'dist/apps/api-server', to: 'api-server', filter: ['**/*', '!node_modules/**', '!**/*.map'] },
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
  // Installers: rpm (Red Hat family and SUSE) and deb (Debian family). Portable: AppImage.
  linux: {
    target: targets(...(hasRpmbuild() ? ['rpm'] : []), ...(hasGnuAr() ? ['deb'] : []), 'AppImage'),
    // rpm and deb need a maintainer; without it electron-builder asks for an author email.
    maintainer: 'CUBRID Corporation',
    artifactName: fileName('linux'),
  },
  // No package dependencies in the rpm: electron-builder's default names (gtk3,
  // libXScrnSaver, ...) are Red Hat names and would stop the install on SUSE.
  // The deb keeps electron-builder's defaults, which are the same on Debian and Ubuntu.
  rpm: { depends: [] },
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
