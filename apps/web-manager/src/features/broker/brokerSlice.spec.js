import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./brokerApi', () => ({
  brokerApi: {
    getBrokerList: vi.fn(),
    getBrokerStatus: vi.fn(),
  },
}));

import { brokerApi } from './brokerApi';
import reducer, { fetchBrokerList } from './brokerSlice';

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

    expect(store.getState().broker.brokers).toEqual(
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

    const { brokers } = store.getState().broker;
    expect(brokers).toHaveLength(1);
    expect(brokers[0]).toEqual(expect.objectContaining({ name: 'newer', pid: '2' }));
  });
});
