import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

vi.mock('./brokerApi', () => ({
  brokerApi: { startBroker: vi.fn(), stopBroker: vi.fn(), getBrokerList: vi.fn() },
}));
import { brokerApi } from './brokerApi';
import brokerReducer from './brokerSlice';
import layoutReducer from '../layout/layoutSlice';
import { runMultiBrokerAction, splitBrokersByAction } from './brokerMultiActions';

beforeEach(() => {
  vi.resetAllMocks();
  brokerApi.getBrokerList.mockResolvedValue([]);
});

const store = () => configureStore({ reducer: { broker: brokerReducer, layout: layoutReducer } });

describe('splitBrokersByAction', () => {
  const brokers = [{ name: 'a', state: 'ON' }, { name: 'b', state: 'OFF' }];
  it.each([['start', ['b']], ['stop', ['a']], ['restart', ['a']]])('%s applies to %j', (action, expected) => {
    expect(splitBrokersByAction(action, brokers).targets.map((b) => b.name)).toEqual(expected);
  });
});

describe('runMultiBrokerAction', () => {
  it('restarts each broker as stop then start, skipping the start when its stop failed', async () => {
    brokerApi.stopBroker.mockImplementation(async (_host, name) => {
      if (name === 'b') throw { response: { data: { message: 'stop failed' } } };
      return {};
    });
    brokerApi.startBroker.mockResolvedValue({});
    const s = store();

    const result = await runMultiBrokerAction(s.dispatch, { hostUid: 'h1', action: 'restart', names: ['a', 'b'] });

    expect(brokerApi.startBroker.mock.calls.map(([, name]) => name)).toEqual(['a']);
    expect(result.succeeded).toEqual(['a']);
    expect(result.failed).toEqual([{ dbname: 'b', error: expect.any(String), phase: 'stop' }]);
    expect(brokerApi.getBrokerList).toHaveBeenCalledTimes(1);
  });

  it('keeps going after one start fails', async () => {
    brokerApi.startBroker.mockRejectedValueOnce({ response: { data: { message: 'x' } } }).mockResolvedValue({});
    const s = store();

    const result = await runMultiBrokerAction(s.dispatch, { hostUid: 'h1', action: 'start', names: ['a', 'b'] });

    expect(result.succeeded).toEqual(['b']);
    expect(result.failed.map((f) => f.dbname)).toEqual(['a']);
    expect(brokerApi.stopBroker).not.toHaveBeenCalled();
  });
});
