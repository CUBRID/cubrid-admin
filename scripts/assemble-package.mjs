#!/usr/bin/env node
/**
 * Assembles the final distribution package after the server executables are
 * built (scripts/build-server-sea.mjs). public/ (frontend static files) is
 * embedded inside each executable.
 *
 * Output: dist/executables/
 *   ├── cubrid-admin-linux | cubrid-admin-linux-el7 | cubrid-admin-linux-arm64 | cubrid-admin.exe | cubrid-admin-macos | cubrid-admin-macos-arm64   (public/ embedded)
 *   └── conf/
 *       ├── cwm.conf.sample        (rename to cwm.conf before first run)
 *       └── cwm.conf.reference.md  (full list of supported keys)
 *
 * Usage: node scripts/assemble-package.mjs <linux|linux-el7|linux-arm64|win|mac|mac-arm64|all> [...]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const EXECUTABLES_DIR = path.join(ROOT, 'dist', 'executables');
const CONF_SAMPLE = path.join(ROOT, 'cwm.conf.sample');
const CONF_REFERENCE = path.join(ROOT, 'cwm.conf.reference.md');

const PLATFORM_MAP = {
  linux: { src: 'cubrid-admin-linux',  dest: 'cubrid-admin-linux'  },
  'linux-el7': { src: 'cubrid-admin-linux-el7', dest: 'cubrid-admin-linux-el7' },
  'linux-arm64': { src: 'cubrid-admin-linux-arm64', dest: 'cubrid-admin-linux-arm64' },
  win:   { src: 'cubrid-admin.exe',    dest: 'cubrid-admin.exe'    },
  mac:   { src: 'cubrid-admin-macos',  dest: 'cubrid-admin-macos'  },
  'mac-arm64': { src: 'cubrid-admin-macos-arm64', dest: 'cubrid-admin-macos-arm64' },
};

function assemble(platform) {
  const info = PLATFORM_MAP[platform];
  if (!info) {
    console.error(`Unknown platform: ${platform}. Use linux | linux-el7 | linux-arm64 | win | mac | mac-arm64 | all`);
    process.exit(1);
  }

  const exeSrc = path.join(EXECUTABLES_DIR, info.src);
  if (!fs.existsSync(exeSrc) && skipMissingMac && info.src.startsWith('cubrid-admin-macos')) {
    console.log(`  skipped ${info.src}: it needs a macOS build machine (codesign)`);
    return;
  }
  if (!fs.existsSync(exeSrc)) {
    console.error(`Executable not found: ${exeSrc}`);
    console.error(`Build the server executables first (nx run api-server:build:exe).`);
    process.exit(1);
  }

  fs.mkdirSync(EXECUTABLES_DIR, { recursive: true });

  // set executable permission (skip on windows)
  if (platform !== 'win') {
    fs.chmodSync(exeSrc, 0o755);
  }

  // conf/cwm.conf.sample + reference doc — shared across all platforms
  const confDir = path.join(EXECUTABLES_DIR, 'conf');
  fs.mkdirSync(confDir, { recursive: true });
  if (fs.existsSync(CONF_SAMPLE)) {
    fs.copyFileSync(CONF_SAMPLE, path.join(confDir, 'cwm.conf.sample'));
  }
  if (fs.existsSync(CONF_REFERENCE)) {
    fs.copyFileSync(CONF_REFERENCE, path.join(confDir, 'cwm.conf.reference.md'));
  }

  console.log(`\ndist/executables/${info.dest}  (public/ embedded inside binary)`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/assemble-package.mjs <linux|linux-el7|linux-arm64|win|mac|mac-arm64|all> [...]');
  process.exit(1);
}

// 'all' off macOS: the SEA build leaves out the macOS executables there.
const skipMissingMac = args.includes('all') && process.platform !== 'darwin';
for (const platform of args.includes('all') ? Object.keys(PLATFORM_MAP) : args) {
  assemble(platform);
}
console.log('\nconf/cwm.conf.sample  ← rename to cwm.conf before first run');
