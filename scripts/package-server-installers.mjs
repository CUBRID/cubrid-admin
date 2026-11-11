#!/usr/bin/env node
/**
 * Builds the server installers from the executables in dist/executables
 * (npm run package:server), into dist/server-installers:
 *
 *   CUBRID-Admin-server-<version>-linux-x64.rpm      (and arm64) needs rpmbuild; skipped without it
 *   CUBRID-Admin-server-<version>-linux-x64.deb      (and arm64) needs dpkg-deb; skipped without it
 *   CUBRID-Admin-server-<version>-windows-x64-setup.exe
 *
 * Sources: packaging/server/linux (rpm spec, deb control files, systemd unit,
 * the setup script both packages run) and packaging/server/windows (NSIS
 * script, WinSW service settings). Neither Linux package depends on other
 * packages, so the rpm installs on the Red Hat family and SUSE alike.
 * NSIS comes from electron-builder's download cache; the Windows service
 * wrapper is WinSW v2.12.0, downloaded once and checked against its SHA-256.
 *
 * CWM_PACKAGE_RELEASE sets the rpm Release (default 1).
 */

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import productVersionModule from './product-version.cjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const EXECUTABLES = path.join(ROOT, 'dist', 'executables');
const OUT = path.join(ROOT, 'dist', 'server-installers');
const WORK = path.join(OUT, '.work');
const PACKAGING = path.join(ROOT, 'packaging', 'server');
const CONF_SAMPLE = path.join(ROOT, 'cwm.conf.sample');
const CONF_REFERENCE = path.join(ROOT, 'cwm.conf.reference.md');

// One entry per Linux executable in dist/executables; a missing one is skipped.
// el7: an executable for glibc 2.17 (RHEL/CentOS 7), packed as an rpm only.
const LINUX = [
  { exe: 'cubrid-admin-linux', rpmArch: 'x86_64', debArch: 'amd64', platform: 'linux-x64' },
  { exe: 'cubrid-admin-linux-arm64', rpmArch: 'aarch64', debArch: 'arm64', platform: 'linux-arm64' },
  { exe: 'cubrid-admin-linux-el7', rpmArch: 'x86_64', platform: 'linux-x64-el7' },
];
const LINUX_FILES = path.join(PACKAGING, 'linux');

const WINSW = {
  url: 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe',
  sha256: '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da',
  cache: path.join(ROOT, 'node_modules', '.cache', 'winsw', 'WinSW-x64-2.12.0.exe'),
};

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function hasCommand(command) {
  try {
    execFileSync(command, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function buildRpm({ exe, rpmArch: arch, platform }, version, release) {
  const top = path.join(WORK, `rpm-${platform}`);
  const sources = path.join(top, 'SOURCES');
  fs.rmSync(top, { recursive: true, force: true });
  fs.mkdirSync(sources, { recursive: true });
  fs.mkdirSync(path.join(top, 'SPECS'));
  fs.copyFileSync(path.join(EXECUTABLES, exe), path.join(sources, 'cubrid-admin'));
  fs.copyFileSync(CONF_SAMPLE, path.join(sources, 'cwm.conf.sample'));
  fs.copyFileSync(CONF_REFERENCE, path.join(sources, 'cwm.conf.reference.md'));
  fs.copyFileSync(path.join(LINUX_FILES, 'cubrid-admin.service'), path.join(sources, 'cubrid-admin.service'));
  fs.copyFileSync(path.join(LINUX_FILES, 'cubrid-admin-setup.sh'), path.join(sources, 'cubrid-admin-setup.sh'));
  const spec = path.join(top, 'SPECS', 'cubrid-admin.spec');
  fs.writeFileSync(
    spec,
    fs.readFileSync(path.join(LINUX_FILES, 'cubrid-admin.spec.in'), 'utf8')
      .replaceAll('@VERSION@', version)
      .replaceAll('@RELEASE@', release)
  );

  execFileSync(
    'rpmbuild',
    // rpm format 4: rpmbuild 6 makes format 6 by default, which rpm 4.11
    // (RHEL/CentOS 7) cannot read ("rpmlib(LargeFiles)", "cpio: Bad magic");
    // format 4 installs on every rpm from 4.11 on.
    ['-bb', '--target', `${arch}-linux`, '--define', `_topdir ${top}`, '--define', '_rpmformat 4', spec],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );
  const built = path.join(top, 'RPMS', arch, `cubrid-admin-${version}-${release}.${arch}.rpm`);
  const file = `CUBRID-Admin-server-${version}-${platform}.rpm`;
  fs.copyFileSync(built, path.join(OUT, file));
  return file;
}

function folderSizeKb(dir) {
  let bytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) bytes += fs.statSync(path.join(entry.parentPath, entry.name)).size;
  }
  return Math.ceil(bytes / 1024);
}

// Same layout as the rpm; dpkg-deb --root-owner-group makes every file root:root.
function buildDeb({ exe, debArch: arch, platform }, version, release) {
  const root = path.join(WORK, `deb-${arch}`);
  fs.rmSync(root, { recursive: true, force: true });
  const program = path.join(root, 'opt', 'cubrid-admin');
  const units = path.join(root, 'usr', 'lib', 'systemd', 'system');
  const control = path.join(root, 'DEBIAN');
  for (const dir of [program, units, control]) fs.mkdirSync(dir, { recursive: true });
  const put = (from, to, mode) => {
    fs.copyFileSync(from, to);
    fs.chmodSync(to, mode);
  };
  put(path.join(EXECUTABLES, exe), path.join(program, 'cubrid-admin'), 0o755);
  put(path.join(LINUX_FILES, 'cubrid-admin-setup.sh'), path.join(program, 'cubrid-admin-setup.sh'), 0o755);
  put(CONF_SAMPLE, path.join(program, 'cwm.conf.sample'), 0o644);
  put(CONF_REFERENCE, path.join(program, 'cwm.conf.reference.md'), 0o644);
  put(path.join(LINUX_FILES, 'cubrid-admin.service'), path.join(units, 'cubrid-admin.service'), 0o644);
  for (const script of ['preinst', 'postinst', 'prerm', 'postrm']) {
    put(path.join(LINUX_FILES, 'deb', script), path.join(control, script), 0o755);
  }
  const sizeKb = folderSizeKb(path.join(root, 'opt')) + folderSizeKb(path.join(root, 'usr'));
  fs.writeFileSync(
    path.join(control, 'control'),
    fs.readFileSync(path.join(LINUX_FILES, 'deb', 'control.in'), 'utf8')
      .replaceAll('@VERSION@', version)
      .replaceAll('@RELEASE@', release)
      .replaceAll('@ARCH@', arch)
      .replaceAll('@SIZE_KB@', String(sizeKb))
  );
  const file = `CUBRID-Admin-server-${version}-${platform}.deb`;
  execFileSync('dpkg-deb', ['--root-owner-group', '-Zxz', '--build', root, path.join(OUT, file)], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return file;
}

async function winswExecutable() {
  if (!fs.existsSync(WINSW.cache) || sha256(WINSW.cache) !== WINSW.sha256) {
    const response = await fetch(WINSW.url);
    if (!response.ok) {
      throw new Error(`Cannot download WinSW: HTTP ${response.status} ${WINSW.url}`);
    }
    fs.mkdirSync(path.dirname(WINSW.cache), { recursive: true });
    fs.writeFileSync(WINSW.cache, Buffer.from(await response.arrayBuffer()));
  }
  const actual = sha256(WINSW.cache);
  if (actual !== WINSW.sha256) {
    throw new Error(`WinSW checksum mismatch: expected ${WINSW.sha256}, got ${actual}`);
  }
  return WINSW.cache;
}

// The makensis electron-builder uses for the desktop setup (the same NSIS
// version: the desktop config sets no toolsets.nsis either). This is not a
// public API of app-builder-lib; it moved in 26.x, so fail clearly if it moves again.
async function makensisCommand() {
  let getMakeNsisPath;
  try {
    ({ getMakeNsisPath } = require('app-builder-lib/out/toolsets/windows'));
  } catch {
    // reported below
  }
  if (typeof getMakeNsisPath !== 'function') {
    const version = require('app-builder-lib/package.json').version;
    throw new Error(
      `app-builder-lib ${version} has no getMakeNsisPath in out/toolsets/windows: update makensisCommand() in scripts/package-server-installers.mjs.`
    );
  }
  const makensis = await getMakeNsisPath(undefined, undefined);
  return { binary: makensis.path, env: { ...process.env, ...(makensis.env ?? {}) } };
}

async function buildWindowsSetup(version) {
  const exe = path.join(EXECUTABLES, 'cubrid-admin.exe');
  if (!fs.existsSync(exe)) {
    console.log('  • skipped windows-x64 setup: dist/executables/cubrid-admin.exe is missing');
    return null;
  }
  const files = path.join(WORK, 'windows');
  fs.rmSync(files, { recursive: true, force: true });
  fs.mkdirSync(files, { recursive: true });
  fs.copyFileSync(exe, path.join(files, 'cubrid-admin.exe'));
  fs.copyFileSync(await winswExecutable(), path.join(files, 'cubrid-admin-service.exe'));
  fs.copyFileSync(path.join(PACKAGING, 'windows', 'cubrid-admin-service.xml'), path.join(files, 'cubrid-admin-service.xml'));
  fs.copyFileSync(CONF_SAMPLE, path.join(files, 'cwm.conf.sample'));
  fs.copyFileSync(CONF_REFERENCE, path.join(files, 'cwm.conf.reference.md'));

  const file = `CUBRID-Admin-server-${version}-windows-x64-setup.exe`;
  // VIProductVersion takes four numbers: 0.1.0.0001 -> 0.1.0.1.
  const numeric = version.split('.').map(Number).join('.');
  const { binary, env } = await makensisCommand();
  execFileSync(
    binary,
    [
      '-V2',
      `-DVERSION=${version}`,
      `-DVERSION4=${numeric}`,
      `-DYEAR=${new Date().getFullYear()}`,
      `-DSRCDIR=${files}`,
      `-DOUTFILE=${path.join(OUT, file)}`,
      path.join(PACKAGING, 'windows', 'installer.nsi'),
    ],
    { stdio: 'inherit', env }
  );
  return file;
}

let version;
try {
  version = productVersionModule.productVersion().version;
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const release = (process.env.CWM_PACKAGE_RELEASE ?? '1').trim() || '1';

fs.mkdirSync(OUT, { recursive: true });
const written = [];

const canRpm = hasCommand('rpmbuild');
const canDeb = hasCommand('dpkg-deb');
if (!canRpm) console.log('  • rpmbuild not found: the Linux server rpm packages are skipped (install rpm to build them)');
if (!canDeb) console.log('  • dpkg-deb not found: the Linux server deb packages are skipped (install dpkg to build them)');
for (const target of LINUX) {
  if (!fs.existsSync(path.join(EXECUTABLES, target.exe))) {
    console.log(`  • skipped ${target.platform} rpm and deb: dist/executables/${target.exe} is missing`);
    continue;
  }
  if (canRpm) written.push(buildRpm(target, version, release));
  if (canDeb && target.debArch) written.push(buildDeb(target, version, release));
}

const setup = await buildWindowsSetup(version);
if (setup) written.push(setup);

fs.rmSync(WORK, { recursive: true, force: true });
console.log(`Server installers ${version}\n${written.map((file) => `dist/server-installers/${file}`).join('\n') || '(none)'}`);
