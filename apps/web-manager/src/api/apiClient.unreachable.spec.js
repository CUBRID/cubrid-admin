import { beforeEach, expect, it, vi } from 'vitest';

// The store the interceptor reaches for: records what it dispatches and
// says which hosts are connected.
const bridge = vi.hoisted(() => ({ dispatched: [], host: { authorizedHosts: [] } }));
vi.mock('../app/store', () => ({
  store: {
    dispatch: (action) => { bridge.dispatched.push(action); return action; },
    getState: () => ({ host: bridge.host }),
  },
}));

// getHostUidFromUrl takes a first path segment longer than 15 characters.
const HOST = 'host-1-aaaaaaaaaaaaaaaa';
const OTHER = 'host-2-bbbbbbbbbbbbbbbb';

const noResponse = (reason) => ({ data: { type: '/errors/cms/no_response', ...(reason ? { reason } : {}) }, message: 'no response' });
const failWith = (status, data) => (config) => Promise.reject(Object.assign(new Error(String(status)), {
  config,
  response: { status, data, headers: {}, config },
}));
const succeed = (config) => Promise.resolve({ status: 200, data: { data: { ok: true } }, headers: {}, config });

let apiClient;
let clearReconnectingHost;
let CMS_NO_RESPONSE_SAME_MOMENT_MS;

const unreachableDispatches = () => bridge.dispatched.filter((a) => a.type === 'host/hostUnreachable');
const get = (path, adapter) => {
  apiClient.defaults.adapter = adapter;
  return apiClient.get(path).catch(() => undefined);
};

beforeEach(async () => {
  vi.resetModules();
  bridge.dispatched.length = 0;
  bridge.host = { authorizedHosts: [HOST] };
  ({ default: apiClient, clearReconnectingHost, CMS_NO_RESPONSE_SAME_MOMENT_MS } = await import('./apiClient'));
});

it('puts a host whose CMS refused the connection in the reconnect window, once', async () => {
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNREFUSED')));
  expect(unreachableDispatches().map((a) => a.payload)).toEqual([HOST]);

  // Every later failure while the window is up stays quiet: no storm, no second window.
  await get(`/${HOST}/broker/list`, failWith(500, noResponse('ECONNREFUSED')));
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('EHOSTUNREACH')));
  expect(unreachableDispatches()).toHaveLength(1);

  // Closing the window (Reconnect or Disconnect) lets a new failure open it again.
  clearReconnectingHost(HOST);
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNREFUSED')));
  expect(unreachableDispatches()).toHaveLength(2);
});

// Timeouts are counted by moment (see isHostUnreachableError); the clock is
// moved by hand between them.
const atTime = (ms) => vi.setSystemTime(new Date(ms));

it('does not disconnect a busy host whose requests of one refresh time out together', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  atTime(1_000_000);
  // One refresh: host stat, start-info, brokers and the environment, all stalled.
  await Promise.all([
    get(`/${HOST}/resource-monitoring/get-host-stat`, failWith(500, noResponse('ECONNABORTED'))),
    get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED'))),
    get(`/${HOST}/broker/list`, failWith(500, noResponse('ETIMEDOUT'))),
    get(`/${HOST}/cms-config/env`, failWith(500, noResponse('ECONNRESET'))),
  ]);
  expect(unreachableDispatches()).toHaveLength(0);
  // The next refresh, 3 s later, is the same stall.
  atTime(1_003_000);
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED')));
  expect(unreachableDispatches()).toHaveLength(0);
  vi.useRealTimers();
});

it('treats three timeouts at separate moments as unreachable; a reset connection counts the same way', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  atTime(1_000_000);
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED')));
  atTime(1_000_000 + CMS_NO_RESPONSE_SAME_MOMENT_MS + 1000);
  await get(`/${HOST}/broker/list`, failWith(500, noResponse('ECONNRESET')));
  expect(unreachableDispatches()).toHaveLength(0);
  atTime(1_000_000 + 2 * (CMS_NO_RESPONSE_SAME_MOMENT_MS + 1000));
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED')));
  expect(unreachableDispatches().map((a) => a.payload)).toEqual([HOST]);
  vi.useRealTimers();
});

it('starts counting over after a success', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  atTime(1_000_000);
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED')));
  atTime(1_020_000);
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED')));
  await get(`/${HOST}/broker/list`, succeed);
  atTime(1_040_000);
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED')));
  atTime(1_060_000);
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED')));
  expect(unreachableDispatches()).toHaveLength(0);
  vi.useRealTimers();
});

it('does not count a deadline with no socket code, a log read, or the host connect', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  for (let i = 0; i < 4; i++) {
    atTime(1_000_000 + i * 60_000);
    await get(`/${HOST}/database/start-info`, failWith(500, noResponse()));
    await get(`/${HOST}/log/view`, failWith(500, noResponse('ECONNABORTED')));
    await get(`/${HOST}/cms-auth/connect`, failWith(500, noResponse('ECONNABORTED')));
  }
  expect(unreachableDispatches()).toHaveLength(0);
  vi.useRealTimers();
});

it('leaves a host login, a host that is not connected, and other errors alone', async () => {
  await get(`/${HOST}/cms-auth/login`, failWith(500, noResponse('ECONNREFUSED')));
  await get(`/${OTHER}/database/start-info`, failWith(500, noResponse('ECONNREFUSED')));
  await get(`/${HOST}/database/start-info`, failWith(500, { data: { type: '/errors/cms/request_failed' }, message: 'failed' }));
  await get(`/${HOST}/database/start-info`, failWith(404, { data: { type: '/errors/database/no_such_database' }, message: 'none' }));
  expect(unreachableDispatches()).toHaveLength(0);
});

it('treats a TLS failure to the host as unreachable too', async () => {
  await get(`/${HOST}/database/start-info`, failWith(502, { data: { type: '/errors/cms/tls_error' }, message: 'tls' }));
  expect(unreachableDispatches().map((a) => a.payload)).toEqual([HOST]);
});
