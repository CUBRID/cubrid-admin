import { beforeEach, expect, it, vi } from 'vitest';

// The store the interceptor reaches for: records what it dispatches and
// applies the not-responding flag, so the next response sees it.
const bridge = vi.hoisted(() => ({ dispatched: [], host: { authorizedHosts: [] } }));
vi.mock('../app/store', () => ({
  store: {
    dispatch: (action) => {
      bridge.dispatched.push(action);
      if (action.type === 'host/hostNotResponding') bridge.host.hostNotResponding = { ...bridge.host.hostNotResponding, [action.payload]: true };
      if (action.type === 'host/hostResponding') delete bridge.host.hostNotResponding[action.payload];
      return action;
    },
    getState: () => ({ host: bridge.host }),
  },
}));

const HOST = 'host-1-aaaaaaaaaaaaaaaa';
const OTHER = 'host-2-bbbbbbbbbbbbbbbb';

const noResponse = (reason) => ({ data: { type: '/errors/cms/no_response', ...(reason ? { reason } : {}) }, message: 'no response' });
const failWith = (status, data) => (config) => Promise.reject(Object.assign(new Error(String(status)), {
  config,
  response: { status, data, headers: {}, config },
}));
const succeed = (config) => Promise.resolve({ status: 200, data: { data: { ok: true } }, headers: {}, config });

let apiClient;
let sent;
const types = () => bridge.dispatched.map((a) => `${a.type.replace('host/', '')}:${a.payload === HOST ? 'HOST' : a.payload}`);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const get = async (path, adapter) => {
  apiClient.defaults.adapter = (config) => { sent += 1; return adapter(config); };
  await apiClient.get(path).catch(() => undefined);
  await flush();
};

beforeEach(async () => {
  vi.resetModules();
  bridge.dispatched.length = 0;
  bridge.host = { authorizedHosts: [HOST], hostNotResponding: {} };
  sent = 0;
  ({ default: apiClient } = await import('./apiClient'));
});

it('marks a connected host not responding when CMS does not answer, and clears it on the next answer', async () => {
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNRESET')));
  expect(types()).toEqual(['hostNotResponding:HOST']);
  await get(`/${HOST}/broker/list`, succeed);
  expect(types()).toEqual(['hostNotResponding:HOST', 'hostResponding:HOST']);
  // One request each: the flag sends nothing of its own.
  expect(sent).toBe(2);
});

it('does not move when several screens report the same failure, or succeed while it is clear', async () => {
  await Promise.all([
    get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED'))),
    get(`/${HOST}/broker/list`, failWith(500, noResponse('ECONNABORTED'))),
    get(`/${HOST}/resource-monitoring/get-host-stat`, failWith(500, noResponse())),
  ]);
  expect(types()).toEqual(['hostNotResponding:HOST']);
  await get(`/${HOST}/broker/list`, succeed);
  await get(`/${HOST}/database/start-info`, succeed);
  expect(types()).toEqual(['hostNotResponding:HOST', 'hostResponding:HOST']);
});

it('leaves a refused connection to the reconnect window instead', async () => {
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNREFUSED')));
  expect(types()).toEqual(['hostUnreachable:HOST']);
});

it('ignores a log read, a host login, a host not connected and other errors', async () => {
  await get(`/${HOST}/log/view`, failWith(500, noResponse('ECONNABORTED')));
  await get(`/${HOST}/cms-auth/login`, failWith(500, noResponse('ECONNABORTED')));
  await get(`/${OTHER}/database/start-info`, failWith(500, noResponse('ECONNABORTED')));
  await get(`/${HOST}/database/start-info`, failWith(500, { data: { type: '/errors/cms/request_failed' } }));
  expect(types()).toEqual([]);
});

it('is not cleared by a request the server answers without CMS', async () => {
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED')));
  await get(`/host/${HOST}`, succeed);
  await get(`/${HOST}/database/users/logout/demodb`, succeed);
  expect(types()).toEqual(['hostNotResponding:HOST']);
});

it('is not cleared by a job the server accepted (202) without asking CMS yet', async () => {
  await get(`/${HOST}/database/start-info`, failWith(500, noResponse('ECONNABORTED')));
  apiClient.defaults.adapter = (config) => Promise.resolve({ status: 202, data: { data: { jobId: 'j1' } }, headers: {}, config });
  await apiClient.post(`/${HOST}/database/unload`, {}, { validateStatus: (s) => s === 202 }).catch(() => undefined);
  await flush();
  expect(types()).toEqual(['hostNotResponding:HOST']);
});
