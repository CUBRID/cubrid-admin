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
    expect(store.getState().broker.brokers).toHaveLength(2);
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
  it('clears state.brokers on failure (documents existing shared behavior relied on elsewhere)', async () => {
    brokerApi.getBrokerList.mockResolvedValueOnce({ result: [rawBroker('broker1')] });
    brokerApi.getBrokerStatus.mockResolvedValue({ asinfo: [] });
    const store = makeStore();
    await store.dispatch(fetchBrokerList({ hostUid: 'host1' })).unwrap();
    expect(store.getState().broker.brokers).toHaveLength(1);

    brokerApi.getBrokerList.mockRejectedValueOnce(new Error('network down'));
    await store.dispatch(fetchBrokerList({ hostUid: 'host1' }));

    expect(store.getState().broker.brokers).toEqual([]);
  });
});
