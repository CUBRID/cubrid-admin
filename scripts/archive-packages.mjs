#!/usr/bin/env node
/**
 * Packs the built server executables and desktop apps into release files
 * named with the product version (major.minor.patch.commit_num):
 *
 *   dist/release/CUBRID-Admin-server-0.1.0.0001-linux-x64.tar.gz
 *   dist/release/CUBRID-Admin-desktop-0.1.0.0001-macos-arm64.zip
 *   dist/release/SHA256SUMS.txt
 *
 * Run after `npm run package:server` and/or `npm run package:electron*`.
 * Run from the same commit. Only what was built is packed.
 *
 * Needs `tar` and `zip` on PATH.
 */

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import productVersionModule from './product-version.cjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXECUTABLES = path.join(ROOT, 'dist', 'executables');
const PORTABLE = path.join(ROOT, 'dist', 'portable');
const OUT = path.join(ROOT, 'dist', 'release');
const STAGE = path.join(OUT, '.stage');
const PRODUCT = 'CUBRID-Admin';

const SERVER = [
  { exe: 'cubrid-admin-linux', platform: 'linux-x64', kind: 'tar.gz' },
  { exe: 'cubrid-admin-macos', platform: 'macos-x64', kind: 'tar.gz' },
  { exe: 'cubrid-admin.exe', platform: 'windows-x64', kind: 'zip' },
];

// electron-builder's output folder for each target (dir target).
const DESKTOP = [
  { dir: 'mac-arm64', platform: 'macos-arm64', kind: 'zip' },
  { dir: 'mac', platform: 'macos-x64', kind: 'zip' },
  { dir: 'win-unpacked', platform: 'windows-x64', kind: 'zip' },
  { dir: 'win-arm64-unpacked', platform: 'windows-arm64', kind: 'zip' },
  { dir: 'linux-unpacked', platform: 'linux-x64', kind: 'tar.gz' },
  { dir: 'linux-arm64-unpacked', platform: 'linux-arm64', kind: 'tar.gz' },
];

function pack(name, kind) {
  const file = path.join(OUT, `${name}.${kind}`);
  fs.rmSync(file, { force: true });
  if (kind === 'zip') {
    execFileSync('zip', ['-qry', '-X', file, name], { cwd: STAGE, stdio: 'inherit' });
  } else {
    execFileSync('tar', ['-czf', file, name], { cwd: STAGE, stdio: 'inherit', env: { ...process.env, COPYFILE_DISABLE: '1' } });
  }
  return path.basename(file);
}

// The desktop app's own node_modules must be complete: a linked node_modules
// at packaging time left out indirect dependencies and the app did not start.
// The file name must carry the version the app itself shows.
function assertDesktopApp(dir, version) {
  const candidates = [
    path.join(dir, 'CUBRID Admin.app', 'Contents', 'Resources', 'app'),
    path.join(dir, 'resources', 'app'),
  ];
  const appDir = candidates.find((candidate) => fs.existsSync(candidate));
  if (!appDir || !fs.existsSync(path.join(appDir, 'node_modules', 'tslib', 'package.json'))) {
    throw new Error(`Incomplete desktop app in ${dir}: node_modules/tslib is missing (run npm ci, then package again).`);
  }
  const versionFile = path.join(appDir, 'dist', 'apps', 'desktop', 'product-version.json');
  const built = fs.existsSync(versionFile) ? JSON.parse(fs.readFileSync(versionFile, 'utf8')).version : 'none';
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
  written.push(pack(name, kind));
}

for (const { dir, platform, kind } of DESKTOP) {
  const source = path.join(PORTABLE, dir);
  if (!fs.existsSync(source)) {
    continue;
  }
  assertDesktopApp(source, version);
  const name = `${PRODUCT}-desktop-${version}-${platform}`;
  // Moved, not copied (the apps are large), and moved back after packing.
  const staged = path.join(STAGE, name);
  fs.renameSync(source, staged);
  try {
    written.push(pack(name, kind));
  } finally {
    fs.renameSync(staged, source);
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
console.log(`Version ${version}\n${written.map((file) => `dist/release/${file}`).join('\n')}`);
