import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import reducer, { loginToHost } from './hostSlice';
import { hostApi } from './hostApi';

vi.mock('./hostApi', () => ({
  hostApi: { loginToHost: vi.fn(), connectHost: vi.fn(), getHaInfo: vi.fn() },
}));

const makeStore = () => configureStore({ reducer: { host: reducer } });
const changes = { id: 'admin', address: '10.0.0.1', port: 8002, alias: 'Prod' };

beforeEach(() => vi.resetAllMocks());

// The host edit dialog's Connect & Save: the server saves the changed
// settings only if the login with them succeeds.
describe('loginToHost with changed settings', () => {
  it('sends the changes to connect instead of logging in with the stored settings', async () => {
    hostApi.connectHost.mockResolvedValue({ success: true, isHA: false });
    const store = makeStore();

    await store.dispatch(loginToHost({ hostUid: 'h1', changes })).unwrap();

    expect(hostApi.connectHost).toHaveBeenCalledWith('h1', changes);
    expect(hostApi.loginToHost).not.toHaveBeenCalled();
    expect(store.getState().host.authorizedHosts).toEqual(['h1']);
  });

  it('records a failure against that host', async () => {
    hostApi.connectHost.mockRejectedValue({ response: { data: { message: 'Incorrect or missing password' } } });
    const store = makeStore();

    await store.dispatch(loginToHost({ hostUid: 'h1', changes }));

    const { hostAuthErrors, loginErrorHostUid, error } = store.getState().host;
    expect(hostAuthErrors).toEqual({ h1: 'Incorrect or missing password' });
    expect(loginErrorHostUid).toBe('h1');
    expect(error).toBe('Incorrect or missing password');
  });

  it('reads the HA details again when the server could not read them in time', async () => {
    hostApi.connectHost.mockResolvedValue({ success: true, isHA: false, haInfoUnavailable: true });
    hostApi.getHaInfo.mockResolvedValue({ success: true, isHA: true, currentNodeType: 'master', haNodes: [] });
    const store = makeStore();

    await store.dispatch(loginToHost({ hostUid: 'h1', changes })).unwrap();
    await vi.waitFor(() => expect(store.getState().host.haInfo.h1?.isHA).toBe(true));

    expect(hostApi.getHaInfo).toHaveBeenCalledWith('h1');
  });

  it('still logs in with the stored settings when given just a host uid', async () => {
    hostApi.loginToHost.mockResolvedValue({ success: true, isHA: false });

    await makeStore().dispatch(loginToHost('h1')).unwrap();

    expect(hostApi.loginToHost).toHaveBeenCalledWith('h1');
    expect(hostApi.connectHost).not.toHaveBeenCalled();
  });
});
