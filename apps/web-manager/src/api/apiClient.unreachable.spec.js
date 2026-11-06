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

const unreachableDispatches = () => bridge.dispatched.filter((a) => a.type === 'host/hostUnreachable');
const get = (path, adapter) => {
  apiClient.defaults.adapter = adapter;
  return apiClient.get(path).catch(() => undefined);
};

beforeEach(async () => {
  vi.resetModules();
  bridge.dispatched.length = 0;
  bridge.host = { authorizedHosts: [HOST] };
  ({ default: apiClient, clearReconnectingHost } = await import('./apiClient'));
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

it('takes three timeouts in a row for a host before treating it as unreachable, and a success starts over', async () => {
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED')));
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse()));
  expect(unreachableDispatches()).toHaveLength(0);

  await get(`/${HOST}/broker/list`, succeed);
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED')));
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED')));
  expect(unreachableDispatches()).toHaveLength(0);

  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED')));
  expect(unreachableDispatches().map((a) => a.payload)).toEqual([HOST]);
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
