// @vitest-environment node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findOutsideUrls } from '../../scripts/check-offline-assets.mjs';

describe('check:offline (apps/web-manager/scripts/check-offline-assets.mjs)', () => {
  let dir;
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-offline-'));
    write('index.html', '<html><head><script type="module" src="/assets/index-abc.js"></script></head></html>');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('passes a build that only refers to itself, this machine and allowed text', () => {
    write('assets/index-abc.js', 'const api="https://localhost:8080";window.open("https://www.cubrid.org/");const ns="http://www.w3.org/2000/svg";');
    write('assets/MonacoSqlEditor-x1.js', 'var d={paths:{vs:"https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs"}};');
    expect(findOutsideUrls(dir)).toEqual([]);
  });

  it('catches a CDN script tag in the HTML', () => {
    write('index.html', '<html><head><script src="https://cdn.jsdelivr.net/npm/some-lib@1/dist/lib.min.js"></script></head></html>');
    expect(findOutsideUrls(dir)).toEqual([{ file: 'index.html', url: 'https://cdn.jsdelivr.net/npm/some-lib@1/dist/lib.min.js' }]);
  });

  it('catches Google Fonts in HTML and a font url() in CSS', () => {
    write('index.html', '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"/>');
    write('assets/index.css', '@font-face{src:url(https://fonts.gstatic.com/s/inter.woff2)}');
    expect(findOutsideUrls(dir).map((found) => found.file).sort()).toEqual(['assets/index.css', 'index.html']);
  });

  it('allows the Monaco loader default only in the Monaco chunk, and no other CDN URL', () => {
    write('assets/index-abc.js', 'load("https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs");');
    write('assets/MonacoSqlEditor-x1.js', 'load("https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs/loader.js");');
    expect(findOutsideUrls(dir)).toHaveLength(2);
  });

  it('catches a worker or fetch from another host in JS', () => {
    write('assets/index-abc.js', 'new Worker("https://unpkg.com/x/worker.js");fetch("https://example.com/data.json");');
    expect(findOutsideUrls(dir).map((found) => found.url)).toEqual(['https://unpkg.com/x/worker.js', 'https://example.com/data.json']);
  });

  it('does not let a look-alike host through an allowed prefix', () => {
    write('assets/index-abc.js', 'load("https://www.cubrid.org.evil.example/x.js");open("https://www.cubrid.org");open("https://www.cubrid.org/docs");');
    expect(findOutsideUrls(dir).map((found) => found.url)).toEqual(['https://www.cubrid.org.evil.example/x.js']);
  });

  it('catches protocol-relative URLs in HTML and CSS', () => {
    write('index.html', '<script src="//cdn.example.com/lib.js"></script><link href="//fonts.example.com/a.css" rel="stylesheet">');
    write('assets/index.css', "@import '//cdn.example.com/x.css';@font-face{src:url(//fonts.example.com/f.woff2)}.a{background:url(//localhost/ok.png)}");
    expect(findOutsideUrls(dir).map((found) => found.url).sort()).toEqual(['//cdn.example.com/lib.js', '//cdn.example.com/x.css', '//fonts.example.com/a.css', '//fonts.example.com/f.woff2']);
  });
});
