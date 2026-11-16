#!/usr/bin/env node
/**
 * Collects the release files, named with the product version
 * (major.minor.patch.commit_num), into dist/release:
 *
 *   server portable (executable + conf/), packed here:
 *     CUBRID-Admin-server-0.1.0.0001-linux-x64.tar.gz           also linux-arm64, linux-x64-el7, macos-x64, macos-arm64
 *     CUBRID-Admin-server-0.1.0.0001-windows-x64.zip
 *   server installers, built by scripts/package-server-installers.mjs:
 *     CUBRID-Admin-server-0.1.0.0001-linux-x64.rpm              also linux-arm64 (only with rpmbuild)
 *     CUBRID-Admin-server-0.1.0.0001-linux-x64.deb              also linux-arm64 (only with dpkg-deb)
 *     CUBRID-Admin-server-0.1.0.0001-windows-x64-setup.exe
 *   desktop, built by electron-builder under these names (apps/desktop/electron-builder.config.cjs):
 *     CUBRID-Admin-desktop-0.1.0.0001-macos-arm64.dmg            installer
 *     CUBRID-Admin-desktop-0.1.0.0001-macos-arm64.zip            portable (.app)
 *     CUBRID-Admin-desktop-0.1.0.0001-windows-x64-setup.exe      installer
 *     CUBRID-Admin-desktop-0.1.0.0001-windows-x64-portable.exe   portable
 *     CUBRID-Admin-desktop-0.1.0.0001-linux-x64.rpm              installer (only with rpmbuild)
 *     CUBRID-Admin-desktop-0.1.0.0001-linux-x64.deb              installer (only with GNU ar)
 *     CUBRID-Admin-desktop-0.1.0.0001-linux-x64.AppImage         portable
 *   SHA256SUMS.txt over all of them.
 *
 * Run after `npm run package:server` and/or `npm run package:electron*`
 * (the desktop last), then checks that every file carries the same code
 * (scripts/check-release-contents.mjs).
 * Run from the same commit. Only what was built is collected.
 *
 * Needs `tar` and `zip` on PATH (server packages).
 */

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import asar from '@electron/asar';
import productVersionModule from './product-version.cjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXECUTABLES = path.join(ROOT, 'dist', 'executables');
const PORTABLE = path.join(ROOT, 'dist', 'portable');
const SERVER_INSTALLERS = path.join(ROOT, 'dist', 'server-installers');
const OUT = path.join(ROOT, 'dist', 'release');
const STAGE = path.join(OUT, '.stage');
const PRODUCT = 'CUBRID-Admin';

const SERVER = [
  { exe: 'cubrid-admin-linux', platform: 'linux-x64', kind: 'tar.gz' },
  { exe: 'cubrid-admin-linux-el7', platform: 'linux-x64-el7', kind: 'tar.gz' },
  { exe: 'cubrid-admin-linux-arm64', platform: 'linux-arm64', kind: 'tar.gz' },
  { exe: 'cubrid-admin-macos', platform: 'macos-x64', kind: 'tar.gz' },
  { exe: 'cubrid-admin-macos-arm64', platform: 'macos-arm64', kind: 'tar.gz' },
  { exe: 'cubrid-admin.exe', platform: 'windows-x64', kind: 'zip' },
];

// electron-builder's unpacked app folder for each OS and arch, and the
// release files built from it. Linux packages carry the Linux arch name
// (x86_64, aarch64, amd64) in electron-builder's file name; the release name uses x64 and arm64.
const SERVER_INSTALLER_FILES = [
  'linux-x64.rpm', 'linux-x64.deb', 'linux-arm64.rpm', 'linux-arm64.deb', 'linux-x64-el7.rpm', 'windows-x64-setup.exe',
];
// The Linux tar.gz also carries install.sh / uninstall.sh: the same layout and
// service as the rpm and deb, for a distribution that takes neither.
const LINUX_INSTALL_FILES = ['install.sh', 'uninstall.sh', 'cubrid-admin-setup.sh', 'cubrid-admin.service'];

const DESKTOP = [
  { dir: 'mac-arm64', platform: 'macos-arm64', files: ['.dmg', '.zip'] },
  { dir: 'mac', platform: 'macos-x64', files: ['.dmg', '.zip'] },
  { dir: 'win-unpacked', platform: 'windows-x64', files: ['-setup.exe', '-portable.exe'] },
  { dir: 'win-arm64-unpacked', platform: 'windows-arm64', files: ['-setup.exe', '-portable.exe'] },
  { dir: 'linux-unpacked', platform: 'linux-x64', built: ['linux-x64', 'linux-x86_64', 'linux-amd64'], files: ['.rpm', '.deb', '.AppImage'] },
  { dir: 'linux-arm64-unpacked', platform: 'linux-arm64', built: ['linux-arm64', 'linux-aarch64'], files: ['.rpm', '.deb', '.AppImage'] },
];

function pack(name, kind) {
  const file = path.join(OUT, `${name}.${kind}`);
  fs.rmSync(file, { force: true });
  if (kind === 'zip') {
    execFileSync('zip', ['-qry', '-X', file, name], { cwd: STAGE, stdio: 'inherit' });
  } else {
    // No extended attributes: macOS adds com.apple.* ones that GNU tar warns about.
    execFileSync('tar', ['--no-xattrs', '-czf', file, name], { cwd: STAGE, stdio: 'inherit', env: { ...process.env, COPYFILE_DISABLE: '1' } });
  }
  return path.basename(file);
}

// The desktop app's own node_modules must be complete: a linked node_modules
// at packaging time left out indirect dependencies and the app did not start.
// The file name must carry the version the app itself shows.
function assertDesktopApp(dir, version) {
  const candidates = [
    path.join(dir, 'CUBRID Admin.app', 'Contents', 'Resources', 'app.asar'),
    path.join(dir, 'resources', 'app.asar'),
  ];
  const archive = candidates.find((candidate) => fs.existsSync(candidate));
  if (!archive) {
    throw new Error(`No resources/app.asar in ${dir}: package again from this commit.`);
  }
  const has = (file) => {
    try {
      asar.statFile(archive, file);
      return true;
    } catch {
      return false;
    }
  };
  if (!has(path.join('node_modules', 'tslib', 'package.json'))) {
    throw new Error(`Incomplete desktop app in ${dir}: node_modules/tslib is missing (run npm ci, then package again).`);
  }
  const versionFile = path.join('dist', 'apps', 'desktop', 'product-version.json');
  const built = has(versionFile) ? JSON.parse(asar.extractFile(archive, versionFile).toString('utf8')).version : 'none';
  if (built !== version) {
    throw new Error(`The desktop app in ${dir} was built as ${built}, but this checkout is ${version}. Package again from this commit.`);
  }
}

let version;
try {
  version = productVersionModule.productVersion().version;
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
const written = [];

for (const { exe, platform, kind } of SERVER) {
  const source = path.join(EXECUTABLES, exe);
  if (!fs.existsSync(source)) {
    continue;
  }
  const name = `${PRODUCT}-server-${version}-${platform}`;
  const dir = path.join(STAGE, name);
  fs.mkdirSync(path.join(dir, 'conf'), { recursive: true });
  fs.copyFileSync(source, path.join(dir, exe));
  fs.chmodSync(path.join(dir, exe), 0o755);
  for (const conf of ['cwm.conf.sample', 'cwm.conf.reference.md']) {
    const confSource = path.join(EXECUTABLES, 'conf', conf);
    if (fs.existsSync(confSource)) {
      fs.copyFileSync(confSource, path.join(dir, 'conf', conf));
    }
  }
  if (platform.startsWith('linux-')) {
    for (const file of LINUX_INSTALL_FILES) {
      fs.copyFileSync(path.join(ROOT, 'packaging', 'server', 'linux', file), path.join(dir, file));
    }
  }
  written.push(pack(name, kind));
}

for (const suffix of SERVER_INSTALLER_FILES) {
  const file = `${PRODUCT}-server-${version}-${suffix}`;
  const source = path.join(SERVER_INSTALLERS, file);
  if (fs.existsSync(source)) {
    fs.rmSync(path.join(OUT, file), { force: true });
    fs.copyFileSync(source, path.join(OUT, file), fs.constants.COPYFILE_FICLONE);
    written.push(file);
  }
}

for (const { dir, platform, built = [platform], files } of DESKTOP) {
  const source = path.join(PORTABLE, dir);
  if (!fs.existsSync(source)) {
    continue;
  }
  assertDesktopApp(source, version);
  let collected = 0;
  for (const suffix of files) {
    const from = built
      .map((name) => path.join(PORTABLE, `${PRODUCT}-desktop-${version}-${name}${suffix}`))
      .find((file) => fs.existsSync(file));
    if (!from) {
      continue;
    }
    const file = `${PRODUCT}-desktop-${version}-${platform}${suffix}`;
    fs.rmSync(path.join(OUT, file), { force: true });
    fs.copyFileSync(from, path.join(OUT, file), fs.constants.COPYFILE_FICLONE);
    written.push(file);
    collected += 1;
  }
  if (collected === 0) {
    throw new Error(`${dir} was built, but none of its release files (${files.join(', ')}) for ${version} are in dist/portable. Package again from this commit.`);
  }
}

fs.rmSync(STAGE, { recursive: true, force: true });

if (written.length === 0) {
  console.error('Nothing to pack: build the server (package:server) or desktop (package:electron) first.');
  process.exit(1);
}

const sums = written
  .map((file) => `${createHash('sha256').update(fs.readFileSync(path.join(OUT, file))).digest('hex')}  ${file}`)
  .join('\n');
fs.writeFileSync(path.join(OUT, 'SHA256SUMS.txt'), sums + '\n');

// The same code in every release file (scripts/check-release-contents.mjs).
try {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'check-release-contents.mjs')], { stdio: 'inherit' });
} catch {
  process.exit(1);
}
console.log(`Version ${version}\n${written.map((file) => `dist/release/${file}`).join('\n')}`);
