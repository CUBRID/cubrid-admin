import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CMS_MAX_CONCURRENT_REQUESTS_PER_HOST as KEY, cmsMaxConcurrentFromEnv, parseCmsMaxConcurrent } from './cms-concurrency';
import { loadRuntimeEnv } from './load-runtime-env';
import { startLogConfigWatcher } from '../util/logging/watch-log-config';
import type { ConfigService } from './config.service';
import { topSqlLimitsFromEnv } from './topsql-limits';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  jest.useRealTimers();
});

describe('parseCmsMaxConcurrent', () => {
  it.each([
    [undefined, 4, false], ['', 4, false], ['1', 1, false], [' 8 ', 8, false], ['16', 16, false],
    ['0', 4, true], ['17', 4, true], ['-2', 4, true], ['2.5', 4, true], ['four', 4, true],
  ])('%p -> %p', (raw, value, invalid) => {
    expect(parseCmsMaxConcurrent(raw)).toEqual({ value, invalid });
  });
});

describe('cwm.conf settings applied live (CMS_MAX_CONCURRENT_REQUESTS_PER_HOST, TOPSQL_MAX_LOG_*)', () => {
  const writeConf = (dir: string, conf: Record<string, string>) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'cwm.conf'), JSON.stringify(conf));
    return path.join(dir, 'cwm.conf');
  };

  it('the desktop server takes it from the workspace cwm.conf', () => {
    const confPath = writeConf(fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-conf-')), { [KEY]: '2', PORT: '9999' });
    delete process.env[KEY];
    delete process.env.PORT;
    process.env.CWM_DESKTOP = '1';
    process.env.CWM_CONF_PATH = confPath;
    loadRuntimeEnv();
    expect(cmsMaxConcurrentFromEnv()).toBe(2);
    // Nothing else is taken from it on the desktop.
    expect(process.env.PORT).toBeUndefined();
  });

  it('applies an edit without a restart, and goes back to the default when removed', () => {
    jest.useFakeTimers();
    const confPath = writeConf(fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-conf-')), { [KEY]: '1' });
    process.env.CWM_CONF_PATH = confPath;
    process.env[KEY] = '1';
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const stop = startLogConfigWatcher({ reloadLogSettingsFromEnv: jest.fn() } as unknown as ConfigService, logger);

    fs.writeFileSync(confPath, JSON.stringify({ [KEY]: '6', TOPSQL_MAX_LOG_LINES: '500000', TOPSQL_MAX_LOG_MB: '48' }));
    jest.advanceTimersByTime(5000);
    expect(cmsMaxConcurrentFromEnv()).toBe(6);
    expect(topSqlLimitsFromEnv()).toMatchObject({ maxLines: 500_000, maxMiB: 48, timeoutMs: 90_000 });

    fs.writeFileSync(confPath, JSON.stringify({}));
    jest.advanceTimersByTime(5000);
    expect(process.env[KEY]).toBeUndefined();
    expect(cmsMaxConcurrentFromEnv()).toBe(4);
    expect(topSqlLimitsFromEnv()).toMatchObject({ maxLines: 200_000, maxMiB: 16 });
    stop();
  });
});
