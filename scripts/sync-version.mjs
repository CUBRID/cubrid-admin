#!/usr/bin/env node
/**
 * Sync the root package.json "version" (the single source of truth for the
 * product release version) into apps/desktop/package.json and the
 * extraMetadata.version line of apps/desktop/electron-builder.yml.
 *
 * Run before packaging the desktop app:
 *   node scripts/sync-version.mjs && nx run desktop:package
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const rootPackageJsonPath = path.join(ROOT, 'package.json');
const desktopPackageJsonPath = path.join(ROOT, 'apps/desktop/package.json');
const electronBuilderYmlPath = path.join(ROOT, 'apps/desktop/electron-builder.yml');

const { version } = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
if (!version) {
  console.error('Root package.json has no "version" field.');
  process.exit(1);
}

const desktopPackageJson = JSON.parse(fs.readFileSync(desktopPackageJsonPath, 'utf8'));
desktopPackageJson.version = version;
fs.writeFileSync(desktopPackageJsonPath, JSON.stringify(desktopPackageJson, null, 2) + '\n');

const electronBuilderYml = fs.readFileSync(electronBuilderYmlPath, 'utf8');
const updatedYml = electronBuilderYml.replace(/^  version: .+$/m, `  version: ${version}`);
if (updatedYml === electronBuilderYml) {
  console.error('Could not find "  version:" line in electron-builder.yml — aborting.');
  process.exit(1);
}
fs.writeFileSync(electronBuilderYmlPath, updatedYml);

console.log(`Synced version ${version} into apps/desktop/package.json and electron-builder.yml`);
