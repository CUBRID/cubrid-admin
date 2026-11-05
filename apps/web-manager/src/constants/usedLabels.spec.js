import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { CM } from './cmLabels';

// Every CM.<key> the screens use has an English label: a missing one shows
// as an empty title or "undefined". These tables are Korean-only, read with
// a fallback to the server's English text.
const KOREAN_ONLY = new Set(['serverErrors', 'cmsNotes', 'cmsNotePatterns', 'jobWarnings', 'paramIssues', 'confProblems', 'confPendingCmsNote']);

// Run from apps/web-manager (vite.config.mts), as every web test is.
const SRC = join(process.cwd(), 'src') + '/';
const sourceFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return name === 'constants' ? [] : sourceFiles(path);
  return /\.(js|jsx)$/.test(name) && !name.includes('.spec.') ? [path] : [];
});

it('has an English label for every CM key the screens use', () => {
  const missing = new Set();
  for (const file of sourceFiles(SRC)) {
    for (const [, key] of readFileSync(file, 'utf8').matchAll(/\bCM\.([A-Za-z0-9_]+)/g)) {
      if (!(key in CM) && !KOREAN_ONLY.has(key)) missing.add(`${key} (${file.slice(SRC.length)})`);
    }
  }
  expect([...missing]).toEqual([]);
});
