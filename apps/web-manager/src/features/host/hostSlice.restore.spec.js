import { describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import reducer, { fetchHosts, loadHosts, revokeHostLogin } from './hostSlice';
import { hostApi } from './hostApi';

vi.mock('./hostApi', () => ({ hostApi: { getHosts: vi.fn(), getHaInfo: vi.fn() } }));

const host = (uid, cmsSessionExpiresAt) => ({ uid, id: 'admin', alias: uid, address: '10.0.0.1', port: 8001, cmsSessionExpiresAt });
const groups = (...hosts) => ({ g: { name: 'G', hosts: Object.fromEntries(hosts.map((h) => [h.uid, h])) } });
const fetched = (payload) => fetchHosts.fulfilled(payload, 'req');

describe('restoring host connections on reload', () => {
  it('restores only hosts whose CMS session has not expired', () => {
    const now = Date.now();
    const state = reducer(undefined, fetched(groups(
      host('live', now + 60_000),
      host('expired', now - 1),
      host('never', null),
    )));

    expect(state.authorizedHosts).toEqual(['live']);
  });

  it('does not bring back a host disconnected later in the same tab', () => {
    const live = host('live', Date.now() + 60_000);
    let state = reducer(undefined, fetched(groups(live)));
    state = reducer(state, revokeHostLogin('live'));
    state = reducer(state, fetched(groups(live)));

    expect(state.authorizedHosts).toEqual([]);
  });
});

describe('loadHosts', () => {
  it('fetches HA info for the hosts it restored, since they skip the login that fills it', async () => {
    const now = Date.now();
    hostApi.getHosts.mockResolvedValue({ host_groups: groups(host('live', now + 60_000), host('expired', now - 1)) });
    hostApi.getHaInfo.mockResolvedValue({ success: true, isHA: true, currentNodeType: 'master', haNodes: [] });
    const store = configureStore({ reducer: { host: reducer } });

    await store.dispatch(loadHosts());

    expect(hostApi.getHaInfo.mock.calls).toEqual([['live']]);
    expect(store.getState().host.haInfo.live).toEqual(expect.objectContaining({ isHA: true, currentNodeType: 'master' }));
  });
});
