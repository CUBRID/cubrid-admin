#!/usr/bin/env node
/**
 * Builds the server installers from the executables in dist/executables
 * (npm run package:server), into dist/server-installers:
 *
 *   CUBRID-Admin-server-<version>-linux-x64.rpm      needs rpmbuild; skipped without it
 *   CUBRID-Admin-server-<version>-linux-arm64.rpm    needs rpmbuild; skipped without it
 *   CUBRID-Admin-server-<version>-windows-x64-setup.exe
 *
 * Sources: packaging/server/linux (rpm spec, systemd unit) and
 * packaging/server/windows (NSIS script, WinSW service settings).
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

const RPM = [
  { exe: 'cubrid-admin-linux', arch: 'x86_64', platform: 'linux-x64' },
  { exe: 'cubrid-admin-linux-arm64', arch: 'aarch64', platform: 'linux-arm64' },
];

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

function buildRpm({ exe, arch, platform }, version, release) {
  const binary = path.join(EXECUTABLES, exe);
  if (!fs.existsSync(binary)) {
    console.log(`  • skipped ${platform} rpm: dist/executables/${exe} is missing`);
    return null;
  }
  const top = path.join(WORK, `rpm-${arch}`);
  const sources = path.join(top, 'SOURCES');
  fs.rmSync(top, { recursive: true, force: true });
  fs.mkdirSync(sources, { recursive: true });
  fs.mkdirSync(path.join(top, 'SPECS'));
  fs.copyFileSync(binary, path.join(sources, 'cubrid-admin'));
  fs.copyFileSync(CONF_SAMPLE, path.join(sources, 'cwm.conf.sample'));
  fs.copyFileSync(CONF_REFERENCE, path.join(sources, 'cwm.conf.reference.md'));
  fs.copyFileSync(path.join(PACKAGING, 'linux', 'cubrid-admin.service'), path.join(sources, 'cubrid-admin.service'));
  const spec = path.join(top, 'SPECS', 'cubrid-admin.spec');
  fs.writeFileSync(
    spec,
    fs.readFileSync(path.join(PACKAGING, 'linux', 'cubrid-admin.spec.in'), 'utf8')
      .replaceAll('@VERSION@', version)
      .replaceAll('@RELEASE@', release)
  );

  execFileSync(
    'rpmbuild',
    ['-bb', '--target', `${arch}-linux`, '--define', `_topdir ${top}`, spec],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );
  const built = path.join(top, 'RPMS', arch, `cubrid-admin-${version}-${release}.${arch}.rpm`);
  const file = `CUBRID-Admin-server-${version}-${platform}.rpm`;
  fs.copyFileSync(built, path.join(OUT, file));
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

async function makensisCommand() {
  const nsisUtil = require('app-builder-lib/out/targets/nsis/nsisUtil');
  // NSIS_PATH waits for an NSIS target's options; with the defaults it gives
  // the same pinned NSIS that electron-builder uses for the desktop setup.
  nsisUtil.NsisTargetOptions.resolve({});
  const nsisDir = await nsisUtil.NSIS_PATH();
  const binary =
    process.platform === 'win32'
      ? path.join(nsisDir, 'makensis.exe')
      : path.join(nsisDir, process.platform === 'darwin' ? 'mac' : 'linux', 'makensis');
  return { binary, env: { ...process.env, NSISDIR: nsisDir } };
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

if (hasCommand('rpmbuild')) {
  for (const target of RPM) {
    const file = buildRpm(target, version, release);
    if (file) written.push(file);
  }
} else {
  console.log('  • rpmbuild not found: the Linux server rpm packages are skipped (install rpm to build them)');
}

const setup = await buildWindowsSetup(version);
if (setup) written.push(setup);

fs.rmSync(WORK, { recursive: true, force: true });
console.log(`Server installers ${version}\n${written.map((file) => `dist/server-installers/${file}`).join('\n') || '(none)'}`);
