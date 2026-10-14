import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./brokerApi', () => ({
  brokerApi: {
    getBrokerList: vi.fn(),
    getBrokerStatus: vi.fn(),
  },
}));

import { brokerApi } from './brokerApi';
import reducer, { fetchBrokerList } from './brokerSlice';

beforeEach(() => vi.resetAllMocks());

const makeStore = () => configureStore({ reducer: { broker: reducer } });

const rawBroker = (name) => ({
  name,
  state: 'ON',
  pid: '123',
  port: '30000',
  jq: '2',
  auto: 'ON',
  sqll: 'ERROR',
  long_tran_time: '1',
  long_query_time: '1',
});

describe('fetchBrokerList skipStatusEnrichment', () => {
  it('skips the per-broker getBrokerStatus call and returns the plain list fields', async () => {
    brokerApi.getBrokerList.mockResolvedValue({ result: [rawBroker('query_editor'), rawBroker('broker1')] });
    const store = makeStore();

    const result = await store.dispatch(fetchBrokerList({ hostUid: 'host1', skipStatusEnrichment: true })).unwrap();

    expect(brokerApi.getBrokerStatus).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
    // Basic Information's fields must all already be present without enrichment.
    expect(result[0]).toMatchObject({
      name: 'query_editor',
      pid: '123',
      port: '30000',
      jq: '2',
      auto: 'ON',
      sqll: 'ERROR',
      long_tran_time: '1',
      long_query_time: '1',
    });
    expect(store.getState().broker.brokersByHost.host1).toHaveLength(2);
  });

  it('still enriches with per-broker status when the flag is not set (default, unchanged behavior)', async () => {
    brokerApi.getBrokerList.mockResolvedValue({ result: [rawBroker('broker1')] });
    brokerApi.getBrokerStatus.mockResolvedValue({ asinfo: [{ as_id: '1', as_num_query: '10', as_num_tran: '2' }] });
    const store = makeStore();

    await store.dispatch(fetchBrokerList({ hostUid: 'host1' })).unwrap();

    expect(brokerApi.getBrokerStatus).toHaveBeenCalledTimes(1);
    expect(brokerApi.getBrokerStatus).toHaveBeenCalledWith('host1', 'broker1');
  });

  it('skipping enrichment still issues only a single list call, unaffected by broker count', async () => {
    brokerApi.getBrokerList.mockResolvedValue({
      result: [rawBroker('b1'), rawBroker('b2'), rawBroker('b3')],
    });
    const store = makeStore();

    await store.dispatch(fetchBrokerList({ hostUid: 'host1', skipStatusEnrichment: true })).unwrap();

    expect(brokerApi.getBrokerList).toHaveBeenCalledTimes(1);
    expect(brokerApi.getBrokerStatus).not.toHaveBeenCalled();
  });
});

describe('fetchBrokerList.rejected', () => {
  it('clears brokersByHost[hostUid] on failure (documents existing shared behavior relied on elsewhere)', async () => {
    brokerApi.getBrokerList.mockResolvedValueOnce({ result: [rawBroker('broker1')] });
    brokerApi.getBrokerStatus.mockResolvedValue({ asinfo: [] });
    const store = makeStore();
    await store.dispatch(fetchBrokerList({ hostUid: 'host1' })).unwrap();
    expect(store.getState().broker.brokersByHost.host1).toHaveLength(1);

    brokerApi.getBrokerList.mockRejectedValueOnce(new Error('network down'));
    await store.dispatch(fetchBrokerList({ hostUid: 'host1' }));

    expect(store.getState().broker.brokersByHost.host1).toEqual([]);
  });
});

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

describe('fetchBrokerList stale-response guard is scoped per host', () => {
  // The guard discards a response whose requestId no longer matches the
  // latest one dispatched for that SAME host — but it used to be keyed by a
  // single shared id for every host. A request for ANY host would then mark
  // every other host's in-flight request as superseded the instant it was
  // dispatched, discarding that other host's own, perfectly current
  // response as if it were stale.
  it("does not let a request for one host discard another host's in-flight response", async () => {
    const hostA = deferred();
    const hostB = deferred();
    brokerApi.getBrokerList.mockImplementation((hostUid) => (hostUid === 'hostA' ? hostA.promise : hostB.promise));
    const store = configureStore({ reducer: { broker: reducer } });

    const dispatchA = store.dispatch(fetchBrokerList({ hostUid: 'hostA', skipStatusEnrichment: true }));
    // hostB's request starts while hostA's is still in flight — with a
    // single shared requestId, this would mark hostA's own request stale.
    store.dispatch(fetchBrokerList({ hostUid: 'hostB', skipStatusEnrichment: true }));

    hostA.resolve({ result: [{ name: 'broker1', pid: '123' }] });
    await dispatchA;

    expect(store.getState().broker.brokersByHost.hostA).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'broker1', pid: '123' })])
    );
  });

  it('still discards a genuinely superseded response for the SAME host', async () => {
    const first = deferred();
    const second = deferred();
    let call = 0;
    brokerApi.getBrokerList.mockImplementation(() => (++call === 1 ? first.promise : second.promise));
    const store = configureStore({ reducer: { broker: reducer } });

    const dispatchFirst = store.dispatch(fetchBrokerList({ hostUid: 'hostA', skipStatusEnrichment: true }));
    const dispatchSecond = store.dispatch(fetchBrokerList({ hostUid: 'hostA', skipStatusEnrichment: true }));

    second.resolve({ result: [{ name: 'newer', pid: '2' }] });
    await dispatchSecond;
    first.resolve({ result: [{ name: 'stale', pid: '1' }] });
    await dispatchFirst;

    const brokers = store.getState().broker.brokersByHost.hostA;
    expect(brokers).toHaveLength(1);
    expect(brokers[0]).toEqual(expect.objectContaining({ name: 'newer', pid: '2' }));
  });
});

describe('broker lists are stored per host, not in one shared array', () => {
  // Per-host dedup alone isn't enough: even a response that correctly
  // passes the per-host staleness guard (nothing else for THAT host
  // superseded it) can still be "late" relative to the user's own
  // navigation — they switched away to a different host's tab before it
  // resolved. If all hosts wrote into one shared `brokers` array, that
  // host's perfectly-valid-for-itself response would still overwrite
  // whatever the UI is currently showing for the NEW, currently-viewed
  // host. Storing each host's list in its own slot makes that physically
  // impossible instead of relying on timing.
  it("a host's slow response that resolves after the user has moved on to a different host does not affect that other host's stored list", async () => {
    const hostA = deferred();
    brokerApi.getBrokerList.mockImplementation((hostUid) => (hostUid === 'hostA' ? hostA.promise : Promise.resolve({ result: [{ name: 'hostB-broker', pid: '9' }] })));
    const store = configureStore({ reducer: { broker: reducer } });

    // hostA's request is dispatched and still in flight...
    const dispatchA = store.dispatch(fetchBrokerList({ hostUid: 'hostA', skipStatusEnrichment: true }));
    // ...the user switches to hostB (no further hostA dispatch happens —
    // hostA's in-flight request is simply never superseded by anything).
    await store.dispatch(fetchBrokerList({ hostUid: 'hostB', skipStatusEnrichment: true }));

    expect(store.getState().broker.brokersByHost.hostB).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'hostB-broker' })])
    );

    // hostA's slow response finally arrives, well after the switch.
    hostA.resolve({ result: [{ name: 'hostA-broker', pid: '1' }] });
    await dispatchA;

    // It's stored in hostA's own slot...
    expect(store.getState().broker.brokersByHost.hostA).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'hostA-broker' })])
    );
    // ...and hostB's displayed list is completely unaffected by it.
    expect(store.getState().broker.brokersByHost.hostB).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'hostB-broker' })])
    );
  });

  it("a response in flight when its host is deleted/disconnected does not resurrect that host's evicted slot", async () => {
    const hostA = deferred();
    brokerApi.getBrokerList.mockImplementation(() => hostA.promise);
    const store = configureStore({ reducer: { broker: reducer } });

    const dispatchA = store.dispatch(fetchBrokerList({ hostUid: 'hostA', skipStatusEnrichment: true }));
    // Host A is deleted/disconnected while its own fetch is still in
    // flight — nothing else for host A will ever supersede this request,
    // so the per-host dedup alone wouldn't catch it as stale.
    store.dispatch({ type: 'layout/closeHostTabs', payload: 'hostA' });
    expect(store.getState().broker.brokersByHost.hostA).toBeUndefined();

    hostA.resolve({ result: [{ name: 'hostA-broker', pid: '1' }] });
    await dispatchA;

    // The deleted host's slot must stay gone — nothing will ever clean it
    // up again once the host itself is gone.
    expect(store.getState().broker.brokersByHost.hostA).toBeUndefined();
  });

  it('clears loading when its host is deleted/disconnected mid-fetch, instead of leaving it stuck', async () => {
    const hostA = deferred();
    brokerApi.getBrokerList.mockImplementation(() => hostA.promise);
    const store = configureStore({ reducer: { broker: reducer } });

    const dispatchA = store.dispatch(fetchBrokerList('hostA'));
    expect(store.getState().broker.loadingByHost.hostA).toBe(true);

    // Host A is deleted/disconnected while its fetch is still in flight.
    // Its eventual response will be discarded (evicted requestId never
    // matches again), but that discard path returns before ever reaching
    // the loadingByHost write — nothing else is fetching FOR HOST A, so
    // nothing would otherwise clear it.
    store.dispatch({ type: 'layout/closeHostTabs', payload: 'hostA' });
    expect(store.getState().broker.loadingByHost.hostA).toBeUndefined();

    hostA.resolve({ result: [{ name: 'hostA-broker', pid: '1' }] });
    await dispatchA;

    expect(store.getState().broker.loadingByHost.hostA).toBeUndefined();
  });

  it("closing one host's tabs does not clear a different host's own in-flight loading", async () => {
    const hostA = deferred();
    const hostB = deferred();
    brokerApi.getBrokerList.mockImplementation((hostUid) => (hostUid === 'hostA' ? hostA.promise : hostB.promise));
    const store = configureStore({ reducer: { broker: reducer } });

    store.dispatch(fetchBrokerList('hostA'));
    const dispatchB = store.dispatch(fetchBrokerList('hostB'));
    expect(store.getState().broker.loadingByHost.hostB).toBe(true);

    // Host A is deleted/disconnected while host B's own, unrelated fetch is
    // still genuinely in flight — this must not touch host B's loading
    // flag (a single shared flag would have, since both would have set the
    // same one).
    store.dispatch({ type: 'layout/closeHostTabs', payload: 'hostA' });
    expect(store.getState().broker.loadingByHost.hostB).toBe(true);

    hostB.resolve({ result: [{ name: 'hostB-broker', pid: '2' }] });
    await dispatchB;
    expect(store.getState().broker.loadingByHost.hostB).toBe(false);
  });
});
