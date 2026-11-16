#!/usr/bin/env node
/**
 * Fails when the built web screens refer to another host, so the app keeps
 * working on a closed network (no CDN scripts, fonts or workers).
 *
 *   node apps/web-manager/scripts/check-offline-assets.mjs [dist/apps/web-manager]
 *   npm run check:offline        (after the web build)
 *
 * Every http(s) URL in the built HTML, CSS, JS and web manifest must be on this
 * machine (localhost) or match ALLOWED below. HTML and CSS allow nothing else:
 * there, a URL is loaded (script src, link href, url(), @import). In JS only
 * text that is never loaded is allowed, each entry with its reason and kept
 * narrow, so a CDN script or font added later fails the check.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SCANNED = /\.(html|css|js|mjs|webmanifest)$/;
const URL_PATTERN = /https?:\/\/[^\s"'`)<>\\]+/g;
// In HTML and CSS a protocol-relative //host/path is loaded too (src="//…", url(//…), @import '//…').
const RELATIVE_PROTOCOL_PATTERN = /(?:\bsrc\s*=\s*|\bhref\s*=\s*|url\(\s*|@import\s+)["']?(\/\/[^\s"'`)<>\\]+)/g;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Allowed URLs in JS: exact or prefix, optionally only in some files. */
export const ALLOWED = [
  { prefix: 'http://www.w3.org/', anyFile: true, reason: 'XML namespace names (SVG, XHTML, XLink): identifiers, never fetched' },
  { prefix: 'https://www.cubrid.org/', reason: 'Help menu and About links the user clicks' },
  { exact: 'https://www.cubrid.org', reason: 'About link the user clicks' },
  { prefix: 'http://jira.cubrid.org/', reason: '"Report a bug" link the user clicks' },
  { prefix: 'https://www.reddit.com/r/CUBRID/', reason: 'forum link the user clicks' },
  { prefix: 'https://github.com/CUBRID/', reason: 'project and license links the user clicks' },
  { exact: 'https://github.com/CUBRID', reason: 'project link the user clicks' },
  { prefix: 'https://react.dev/errors/', reason: 'text in React error messages' },
  { prefix: 'https://reactrouter.com/', reason: 'text in React Router error messages' },
  { prefix: 'https://redux.js.org/Errors', reason: 'text in Redux error messages' },
  { prefix: 'https://redux-toolkit.js.org/Errors', reason: 'text in Redux Toolkit error messages' },
  { exact: 'https://bit.ly/3cXEKWf', reason: 'text in Immer error messages' },
  { exact: 'https://bit.ly/wb-precache', file: /^workbox-[\w-]+\.js$/, reason: 'text in a Workbox warning' },
  {
    exact: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs',
    file: /^MonacoSqlEditor-[\w-]+\.js$/,
    reason: "@monaco-editor/loader's default; unused, loader.config({ monaco }) sets the bundled Monaco before an editor is made",
  },
  ...[
    'https://code.visualstudio.com/docs/',
    'https://github.com/microsoft/',
    'https://github.com/markedjs/marked',
    'https://github.com/suren-atoyan/monaco-loader',
  ].map((prefix) => ({ prefix, file: /^MonacoSqlEditor-[\w-]+\.js$/, reason: 'text and links inside Monaco messages' })),
  { exact: 'https://microsoft.com', file: /^MonacoSqlEditor-[\w-]+\.js$/, reason: 'example link in Monaco markdown parsing' },
];

function isLocal(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname) || LOCAL_HOSTS.has(`[${new URL(url).hostname}]`);
  } catch {
    return false;
  }
}

function isAllowed(url, file) {
  if (isLocal(url)) return true;
  const name = path.basename(file);
  const isJs = /\.m?js$/.test(name);
  return ALLOWED.some((entry) => {
    if (!isJs && !entry.anyFile) return false;
    if (entry.file && !entry.file.test(name)) return false;
    return entry.exact ? url.replace(/[.,;]$/, '') === entry.exact : url.startsWith(entry.prefix);
  });
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return SCANNED.test(entry.name) ? [full] : [];
  });
}

/** [{ file, url }] for every URL to another host that is not allowed. */
export function findOutsideUrls(dir) {
  const found = [];
  for (const file of listFiles(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(URL_PATTERN)) {
      if (!isAllowed(match[0], file)) {
        found.push({ file: path.relative(dir, file), url: match[0] });
      }
    }
    if (/\.(html|css)$/.test(file)) {
      for (const match of text.matchAll(RELATIVE_PROTOCOL_PATTERN)) {
        if (!isLocal(`https:${match[1]}`)) {
          found.push({ file: path.relative(dir, file), url: match[1] });
        }
      }
    }
  }
  return found;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const dir = path.resolve(process.argv[2] ?? path.join(root, 'dist', 'apps', 'web-manager'));
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    console.error(`No web build in ${dir}: build it first (npm run build:web-manager).`);
    process.exit(1);
  }
  const found = findOutsideUrls(dir);
  if (found.length > 0) {
    console.error('The web build refers to other hosts (it must work without internet):');
    for (const { file, url } of found) console.error(`  ${file}: ${url}`);
    process.exit(1);
  }
  console.log(`check:offline: no outside URLs in ${path.relative(process.cwd(), dir) || dir}`);
}
