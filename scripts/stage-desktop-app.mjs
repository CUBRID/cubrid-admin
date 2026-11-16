#!/usr/bin/env node
/**
 * Builds the folder electron-builder packs as the desktop app (resources/app):
 *
 *   dist/apps/desktop-app/
 *     package.json            name, main and the runtime dependencies only
 *     dist/apps/desktop/      main and preload process (from nx run desktop:build)
 *     dist/libs/update-check/ loaded by the main process through a relative path
 *     node_modules/           the packages in apps/desktop/package.json "dependencies"
 *                             and what they depend on, copied from the root node_modules
 *
 * Packing the repository root instead put the whole root dependency set
 * (about 30,000 files, macOS-only .node files included) into every package.
 *
 * Fails when the built code requires a package that is not listed in
 * apps/desktop/package.json "dependencies".
 */

import fs from 'fs';
import { builtinModules } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'apps', 'desktop-app');
const BUILT = ['dist/apps/desktop', 'dist/libs/update-check'];
// Provided by Electron itself at runtime.
const PROVIDED = new Set(['electron', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const packageNameOf = (specifier) =>
  specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];

function listJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

/** Bare package names the built code requires at runtime. */
function requiredPackages() {
  const names = new Set();
  for (const dir of BUILT) {
    for (const file of listJsFiles(path.join(ROOT, dir))) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) {
        const specifier = match[1];
        if (!specifier.startsWith('.') && !path.isAbsolute(specifier) && !PROVIDED.has(specifier) && !PROVIDED.has(packageNameOf(specifier))) {
          names.add(packageNameOf(specifier));
        }
      }
    }
  }
  return names;
}

/** Copies a package from the root node_modules and, in turn, its own dependencies. */
function copyPackage(name, copied) {
  if (copied.has(name)) return;
  const source = path.join(ROOT, 'node_modules', name);
  if (!fs.existsSync(path.join(source, 'package.json'))) {
    throw new Error(`${name} is not installed in node_modules (run npm ci).`);
  }
  const pkg = readJson(path.join(source, 'package.json'));
  copied.set(name, pkg.version);
  fs.cpSync(source, path.join(OUT, 'node_modules', name), { recursive: true, dereference: true });
  for (const dependency of Object.keys(pkg.dependencies ?? {})) {
    copyPackage(dependency, copied);
  }
}

for (const dir of BUILT) {
  if (!fs.existsSync(path.join(ROOT, dir))) {
    console.error(`${dir} is missing: build the desktop app first (nx run desktop:build).`);
    process.exit(1);
  }
}

const declared = readJson(path.join(ROOT, 'apps', 'desktop', 'package.json')).dependencies ?? {};
const missing = [...requiredPackages()].filter((name) => !(name in declared));
if (missing.length > 0) {
  console.error(`The desktop app requires ${missing.join(', ')} at runtime; add ${missing.length === 1 ? 'it' : 'them'} to apps/desktop/package.json "dependencies".`);
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
for (const dir of BUILT) {
  fs.cpSync(path.join(ROOT, dir), path.join(OUT, dir), { recursive: true });
}

const copied = new Map();
for (const name of Object.keys(declared)) {
  copyPackage(name, copied);
}

// Exact installed versions, so electron-builder's dependency listing matches node_modules.
fs.writeFileSync(
  path.join(OUT, 'package.json'),
  JSON.stringify(
    {
      name: 'cubrid-admin-desktop',
      private: true,
      main: 'dist/apps/desktop/main.js',
      dependencies: Object.fromEntries([...copied].filter(([name]) => name in declared)),
    },
    null,
    2
  ) + '\n'
);

console.log(`dist/apps/desktop-app: ${[...copied].map(([name, version]) => `${name}@${version}`).join(', ') || 'no dependencies'}`);
