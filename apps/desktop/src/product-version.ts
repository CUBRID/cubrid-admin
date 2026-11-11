import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

let cached: string | null = null;

/**
 * major.minor.patch.commit_num. app.getVersion() only carries
 * major.minor.patch (package.json must stay semver), so the desktop build
 * writes the full version next to main.js (scripts/product-version.cjs --write).
 * Without that file only major.minor.patch is shown.
 */
export function getProductVersion(): string {
  if (cached === null) {
    try {
      const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, 'product-version.json'), 'utf8'));
      cached = typeof version === 'string' && version ? version : app.getVersion();
    } catch {
      cached = app.getVersion();
    }
  }
  return cached;
}
