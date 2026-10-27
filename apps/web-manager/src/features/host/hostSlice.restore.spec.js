import { describe, expect, it } from 'vitest';
import reducer, { fetchHosts, revokeHostLogin } from './hostSlice';

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
