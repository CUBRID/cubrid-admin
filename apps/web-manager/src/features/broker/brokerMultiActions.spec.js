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
import { withRestartsShownOn } from './brokerRestartState';

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

  it('stops and restarts a SUSPENDED broker and does not start it', () => {
    const listed = [{ name: 's', state: 'SUSPENDED' }];
    expect(splitBrokersByAction('start', listed).targets).toEqual([]);
    expect(splitBrokersByAction('stop', listed).targets.map((b) => b.name)).toEqual(['s']);
    expect(splitBrokersByAction('restart', listed).targets.map((b) => b.name)).toEqual(['s']);
  });

  it('counts a broker listed without a state (broker service stopped) as OFF', () => {
    const listed = [{ name: 'a', port: '30000' }, { name: 'b', state: '' }];
    expect(splitBrokersByAction('start', listed).targets.map((b) => b.name)).toEqual(['a', 'b']);
    expect(splitBrokersByAction('stop', listed).targets).toEqual([]);
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

describe('a broker being restarted', () => {
  it('shows ON until the restart ends, not the OFF it passes through', async () => {
    const s = store();
    const seen = [];
    brokerApi.stopBroker.mockImplementation(async () => {
      // What a poll between the stop and the start would show.
      seen.push(withRestartsShownOn([{ name: 'a', state: 'OFF' }, { name: 'b', state: 'OFF' }], s.getState().broker.restartingBrokers, 'h1'));
      return {};
    });
    brokerApi.startBroker.mockResolvedValue({});

    await runMultiBrokerAction(s.dispatch, { hostUid: 'h1', action: 'restart', names: ['a'] });

    expect(seen[0]).toEqual([{ name: 'a', state: 'ON' }, { name: 'b', state: 'OFF' }]);
    expect(s.getState().broker.restartingBrokers).toEqual({});
    expect(withRestartsShownOn([{ name: 'a', state: 'OFF' }], s.getState().broker.restartingBrokers, 'h1')).toEqual([{ name: 'a', state: 'OFF' }]);
  });

  it('shows a broker whose start failed as OFF at once, while the next one is still restarting', async () => {
    const s = store();
    const shown = () => withRestartsShownOn([{ name: 'a', state: 'OFF' }, { name: 'b', state: 'OFF' }], s.getState().broker.restartingBrokers, 'h1');
    let duringB;
    brokerApi.stopBroker.mockImplementation(async (_hostUid, brokerName) => {
      if (brokerName === 'b') duringB = shown();
      return {};
    });
    brokerApi.startBroker.mockImplementationOnce(async () => { throw new Error('start failed'); }).mockResolvedValue({});

    const result = await runMultiBrokerAction(s.dispatch, { hostUid: 'h1', action: 'restart', names: ['a', 'b'] });

    expect(result.failed).toEqual([expect.objectContaining({ dbname: 'a', phase: 'start' })]);
    // While b restarts, a (start failed) is already shown as it is: OFF.
    expect(duringB).toEqual([{ name: 'a', state: 'OFF' }, { name: 'b', state: 'ON' }]);
    expect(s.getState().broker.restartingBrokers).toEqual({});
  });

  it('is not marked by a plain stop', async () => {
    const s = store();
    let marks;
    brokerApi.stopBroker.mockImplementation(async () => { marks = { ...s.getState().broker.restartingBrokers }; return {}; });
    await runMultiBrokerAction(s.dispatch, { hostUid: 'h1', action: 'stop', names: ['a'] });
    expect(marks).toEqual({});
  });
});
