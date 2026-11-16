import * as path from 'path';
import * as sea from 'node:sea';
import type * as express from 'express';

/**
 * True when the server runs as the single executable built by
 * scripts/build-server-sea.mjs (Node.js single executable application).
 * Its conf/, logs/, storage and certificates then live beside the executable,
 * and the web screens are read from the executable itself (sea.getAsset).
 * False for `node main.js` (nx serve) and the desktop app (Electron).
 */
export function isStandaloneExecutable(): boolean {
  return sea.isSea();
}

/** Asset key prefix of the web screens embedded in the executable. */
const PUBLIC_ASSET_PREFIX = 'public/';

// Each embedded file is copied out of the executable once (sea.getAsset copies
// on every call). Only files that exist are kept, so unknown paths cannot grow it.
const publicAssets = new Map<string, Buffer>();

function readPublicAsset(file: string): Buffer | null {
  const cached = publicAssets.get(file);
  if (cached) {
    return cached;
  }
  try {
    const body = Buffer.from(sea.getAsset(`${PUBLIC_ASSET_PREFIX}${file}`));
    publicAssets.set(file, body);
    return body;
  } catch {
    return null;
  }
}

/**
 * The web screens embedded in the executable, served the way
 * express.static(publicDir) and the index.html fallback serve them from disk.
 * Null when not running as the single executable or when nothing is embedded.
 */
export function embeddedPublicFiles(): {
  serveFile: express.RequestHandler;
  sendIndex: (res: express.Response) => void;
} | null {
  if (!isStandaloneExecutable()) {
    return null;
  }
  const index = readPublicAsset('index.html');
  if (!index) {
    return null;
  }
  return {
    serveFile: (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      // Asset keys use forward slashes; '..' never reaches a key. "/" and
      // unknown paths go on to the index.html fallback.
      let file: string;
      try {
        file = path.posix.normalize(decodeURIComponent(req.path)).replace(/^\/+/, '');
      } catch {
        next();
        return;
      }
      const body = file && !file.split('/').includes('..') ? readPublicAsset(file) : null;
      if (!body) {
        next();
        return;
      }
      res.type(path.posix.extname(file) || 'html');
      res.send(body);
    },
    sendIndex: (res) => {
      res.type('html');
      res.send(index);
    },
  };
}
