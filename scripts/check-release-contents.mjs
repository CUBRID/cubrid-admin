#!/usr/bin/env node
/**
 * Checks that every release file carries the same code, so one functional
 * test run stands for all of them:
 *
 *   desktop: resources/web-manager (every file) and resources/api-server/main.js
 *            must match the build output, dist/apps/web-manager and
 *            dist/apps/api-server/main.js;
 *   server:  the executable inside each package must be the one in
 *            dist/executables (it carries the API and the web screens).
 *
 * Opened on this machine: zip, tar.gz, dmg (macOS only), deb (dpkg-deb), rpm
 * (rpm2cpio + cpio). Not opened: AppImage, Windows setup / portable exe; those
 * are checked through the folder electron-builder packed them from
 * (dist/portable/*-unpacked) and, for the server setup, its input executable.
 *
 * Run by scripts/archive-packages.mjs after it collects the release files.
 * Exits 1 when anything differs.
 */

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = path.join(ROOT, 'dist', 'release');
const PORTABLE = path.join(ROOT, 'dist', 'portable');
const EXECUTABLES = path.join(ROOT, 'dist', 'executables');

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const fileHash = (file) => sha256(fs.readFileSync(file));

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

/** One hash for a folder: every file's relative path and content. */
function treeHash(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = listFiles(dir);
  return { hash: sha256(files.map((file) => `${file}\0${fileHash(path.join(dir, file))}\n`).join('')).slice(0, 12), count: files.length };
}

const has = (command, args = ['--version']) => {
  try {
    execFileSync(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-contents-'));
}

/** The Electron resources folder below an extracted package, if any. */
function findResources(dir) {
  for (const candidate of [
    'CUBRID Admin.app/Contents/Resources',
    'opt/cubrid-admin-desktop/resources',
    'resources',
  ]) {
    const full = path.join(dir, candidate);
    if (fs.existsSync(path.join(full, 'web-manager'))) return full;
  }
  return null;
}

function desktopContents(resources) {
  const main = path.join(resources, 'api-server', 'main.js');
  return {
    web: treeHash(path.join(resources, 'web-manager')),
    main: fs.existsSync(main) ? fileHash(main).slice(0, 12) : null,
  };
}

/** Extracts a release file into a temp folder; null when it cannot be opened here. */
function extract(file) {
  const out = tempDir();
  const quiet = { stdio: ['ignore', 'ignore', 'ignore'] };
  if (file.endsWith('.zip')) {
    if (process.platform === 'darwin') execFileSync('ditto', ['-x', '-k', file, out], quiet);
    else execFileSync('unzip', ['-q', file, '-d', out], quiet);
  } else if (file.endsWith('.tar.gz')) {
    execFileSync('tar', ['-xzf', file, '-C', out], quiet);
  } else if (file.endsWith('.deb') && has('dpkg-deb')) {
    execFileSync('dpkg-deb', ['-x', file, out], quiet);
  } else if (file.endsWith('.rpm') && has('rpm2cpio') && has('cpio')) {
    execFileSync('sh', ['-c', 'rpm2cpio "$1" | (cd "$2" && cpio -idm --quiet)', 'sh', file, out], quiet);
  } else if (file.endsWith('.dmg') && process.platform === 'darwin') {
    const mount = path.join(out, 'mnt');
    fs.mkdirSync(mount);
    execFileSync('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, file], quiet);
    return { dir: mount, cleanup: () => {
      execFileSync('hdiutil', ['detach', mount], quiet);
      fs.rmSync(out, { recursive: true, force: true });
    } };
  } else {
    fs.rmSync(out, { recursive: true, force: true });
    return null;
  }
  return { dir: out, cleanup: () => fs.rmSync(out, { recursive: true, force: true }) };
}

const rows = [];
let failed = false;
const row = (name, opened, web, main, ok, note = '') => {
  if (!ok) failed = true;
  rows.push([name, opened, web, main, ok ? 'same' : 'DIFFERENT', note]);
};
const show = (contents) => contents ? `${contents.hash} (${contents.count} files)` : 'missing';

// Desktop: the build output is the reference.
const expected = {
  web: treeHash(path.join(ROOT, 'dist', 'apps', 'web-manager')),
  main: fs.existsSync(path.join(ROOT, 'dist', 'apps', 'api-server', 'main.js'))
    ? fileHash(path.join(ROOT, 'dist', 'apps', 'api-server', 'main.js')).slice(0, 12)
    : null,
};
const matches = (contents) =>
  Boolean(contents.web && expected.web && contents.web.hash === expected.web.hash && contents.main && contents.main === expected.main);

const releaseFiles = fs.existsSync(RELEASE) ? fs.readdirSync(RELEASE).filter((file) => file.startsWith('CUBRID-Admin-')).sort() : [];
const desktopFiles = releaseFiles.filter((file) => file.includes('-desktop-'));
if (desktopFiles.length > 0) {
  row('build output (reference)', '-', show(expected.web), expected.main ?? 'missing', Boolean(expected.web && expected.main));
  for (const dir of fs.existsSync(PORTABLE) ? fs.readdirSync(PORTABLE).sort() : []) {
    const resources = findResources(path.join(PORTABLE, dir));
    if (!resources) continue;
    const contents = desktopContents(resources);
    row(`dist/portable/${dir}`, 'folder', show(contents.web), contents.main ?? 'missing', matches(contents), 'packed into the files of this OS and arch');
  }
  for (const file of desktopFiles) {
    const opened = extract(path.join(RELEASE, file));
    if (!opened) {
      row(file, 'no', '-', '-', true, 'not opened here: checked through its dist/portable folder');
      continue;
    }
    try {
      const resources = findResources(opened.dir);
      const contents = resources ? desktopContents(resources) : { web: null, main: null };
      row(file, 'yes', show(contents.web), contents.main ?? 'missing', matches(contents));
    } finally {
      opened.cleanup();
    }
  }
}

// Server: each package's executable is the one in dist/executables.
const SERVER_EXE = {
  'linux-x64': 'cubrid-admin-linux',
  'linux-x64-el7': 'cubrid-admin-linux-el7',
  'linux-arm64': 'cubrid-admin-linux-arm64',
  'macos-x64': 'cubrid-admin-macos',
  'macos-arm64': 'cubrid-admin-macos-arm64',
  'windows-x64': 'cubrid-admin.exe',
};
for (const file of releaseFiles.filter((name) => name.includes('-server-'))) {
  const platform = Object.keys(SERVER_EXE)
    .sort((a, b) => b.length - a.length)
    .find((name) => file.includes(`-${name}.`) || file.includes(`-${name}-setup`));
  const exe = platform && SERVER_EXE[platform];
  const reference = exe && path.join(EXECUTABLES, exe);
  if (!reference || !fs.existsSync(reference)) {
    row(file, '-', '-', '-', false, `no dist/executables/${exe ?? '?'} to compare with`);
    continue;
  }
  const want = fileHash(reference).slice(0, 12);
  const opened = extract(path.join(RELEASE, file));
  if (!opened) {
    row(file, 'no', '-', want, true, `not opened here: built from dist/executables/${exe}`);
    continue;
  }
  try {
    // tar.gz / zip: the executable by name; rpm / deb: /opt/cubrid-admin/cubrid-admin.
    const found = listFiles(opened.dir).find((name) => path.basename(name) === exe || name === 'opt/cubrid-admin/cubrid-admin');
    const got = found ? fileHash(path.join(opened.dir, found)).slice(0, 12) : 'missing';
    row(file, 'yes', '-', got, got === want, `executable vs dist/executables/${exe}`);
  } finally {
    opened.cleanup();
  }
}

if (rows.length > 0) {
  const header = ['file', 'opened', 'web-manager', 'main.js / executable', 'result', 'note'];
  const widths = header.map((title, i) => Math.max(title.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd();
  console.log(['', 'Release contents:', line(header), ...rows.map(line)].join('\n'));
}
if (failed) {
  console.error(
    'Release contents differ: see DIFFERENT above. If every desktop file agrees with the others but not with the build ' +
      'output, dist/apps was rebuilt after the desktop packaging (package the desktop last, as the release workflow does).'
  );
  process.exit(1);
}
