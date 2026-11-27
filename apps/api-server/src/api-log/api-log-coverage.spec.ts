import * as fs from 'fs';
import * as path from 'path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { categoryOf, LOG_ACTION, SKIP_ACTION_LOG } from './log-action.decorator';

const SRC = path.join(__dirname, '..');

function controllerFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return controllerFiles(full);
    return e.name.endsWith('.controller.ts') ? [full] : [];
  });
}

type Route = { name: string; method: RequestMethod; action?: string; skip: boolean };

function routes(): Route[] {
  const found: Route[] = [];
  for (const file of controllerFiles(SRC)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file);
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function' || Reflect.getMetadata(PATH_METADATA, exported) === undefined) continue;
      const proto = (exported as { prototype: Record<string, unknown> }).prototype;
      for (const key of Object.getOwnPropertyNames(proto)) {
        const handler = proto[key];
        if (key === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        if (method === undefined) continue;
        found.push({
          name: `${(exported as { name: string }).name}.${key}`,
          method,
          action: Reflect.getMetadata(LOG_ACTION, handler),
          skip: Reflect.getMetadata(SKIP_ACTION_LOG, handler) === true,
        });
      }
    }
  }
  return found;
}

describe('API log coverage', () => {
  const all = routes();

  it('finds the controllers', () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it('names every route that changes something, or marks it skipped', () => {
    const unnamed = all
      .filter((r) => r.method !== RequestMethod.GET && !r.action && !r.skip)
      .map((r) => r.name);
    expect(unnamed).toEqual([]);
  });

  it('gives every name a known category', () => {
    const unknown = all.filter((r) => r.action && categoryOf(r.action) === 'other').map((r) => `${r.name}: ${r.action}`);
    expect(unknown).toEqual([]);
  });

  it('never both names and skips a route', () => {
    expect(all.filter((r) => r.action && r.skip).map((r) => r.name)).toEqual([]);
  });
});
