import { beforeEach, describe, expect, it } from 'vitest';
import reducer, { fetchHosts, loginToHost, revokeHostLogin } from './hostSlice';

const ha = { isHA: true, currentNodeType: 'master', haNodes: [] };
const host = (uid, cmsSessionExpiresAt = null) => ({ uid, id: 'admin', alias: uid, address: '10.0.0.1', port: 8001, cmsSessionExpiresAt });
const groups = (...hosts) => ({ g: { name: 'G', hosts: Object.fromEntries(hosts.map((h) => [h.uid, h])) } });
const loggedIn = (uid) => loginToHost.fulfilled({ hostUid: uid, success: true, ...ha }, 'req', uid);
const loginFailed = (uid) => loginToHost.rejected(null, 'req', uid, 'Incorrect password');
const stored = () => JSON.parse(localStorage.getItem('cubrid_ha_info') || '{}');

beforeEach(() => localStorage.clear());

describe('HA role of a host that is not connected', () => {
  it('is dropped on disconnect, also from storage, and comes back with the next login', () => {
    let state = reducer(undefined, fetchHosts.fulfilled(groups(host('h1')), 'req'));
    state = reducer(state, loggedIn('h1'));
    expect(state.haInfo.h1).toEqual(expect.objectContaining({ currentNodeType: 'master' }));

    state = reducer(state, revokeHostLogin('h1'));
    expect(state.haInfo.h1).toBeUndefined();
    expect(stored().h1).toBeUndefined();

    state = reducer(state, loggedIn('h1'));
    expect(state.haInfo.h1).toEqual(expect.objectContaining({ currentNodeType: 'master' }));
    expect(stored().h1).toEqual(expect.objectContaining({ currentNodeType: 'master' }));
  });

  it('is dropped when logging in to a disconnected host fails', () => {
    let state = reducer(undefined, fetchHosts.fulfilled(groups(host('h1')), 'req'));
    state = { ...state, haInfo: { h1: ha } };
    state = reducer(state, loginFailed('h1'));
    expect(state.haInfo.h1).toBeUndefined();
  });

  it('is kept for a host that is still connected when a Reconnect fails', () => {
    let state = reducer(undefined, fetchHosts.fulfilled(groups(host('h1')), 'req'));
    state = reducer(state, loggedIn('h1'));
    state = reducer(state, loginFailed('h1'));
    expect(state.haInfo.h1).toEqual(expect.objectContaining({ currentNodeType: 'master' }));
  });

  it('is dropped on reload for hosts that do not come back connected', () => {
    const now = Date.now();
    let state = reducer(undefined, { type: 'init' });
    state = { ...state, haInfo: { live: ha, gone: ha } };
    state = reducer(state, fetchHosts.fulfilled(groups(host('live', now + 60_000), host('gone', now - 1)), 'req'));
    expect(Object.keys(state.haInfo)).toEqual(['live']);
    expect(Object.keys(stored())).toEqual(['live']);
  });
});
