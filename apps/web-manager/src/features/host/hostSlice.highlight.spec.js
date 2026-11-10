import { describe, expect, it } from 'vitest';
import reducer, { fetchHosts, setHighlightedHost, setSelectedGroup, setSelectedHost } from './hostSlice';

describe('the host list highlight', () => {
  it('moves to a clicked host that is not connected, while the selected host stays', () => {
    let state = reducer(undefined, setSelectedHost('a'));
    state = reducer(state, setHighlightedHost('b'));
    expect(state.selectedHostUid).toBe('a');
    expect(state.highlightedHostUid).toBe('b');
  });

  it('follows a change of the selected host', () => {
    let state = reducer(undefined, setSelectedHost('a'));
    state = reducer(state, setHighlightedHost('b'));
    state = reducer(state, setSelectedHost('c'));
    expect(state.highlightedHostUid).toBe('c');
  });

  it('comes back to the selected host when it is chosen again (its tab, a click)', () => {
    let state = reducer(undefined, setSelectedHost('a'));
    state = reducer(state, setHighlightedHost('b'));
    state = reducer(state, setSelectedHost('a'));
    expect(state.highlightedHostUid).toBe('a');
  });

  it('stays where it is when a group click keeps the same host', () => {
    let state = reducer(undefined, setSelectedHost('a'));
    state = reducer(state, setHighlightedHost('b'));
    state = reducer(state, setSelectedGroup({ groupId: 'g1', hostUid: 'a' }));
    expect(state.highlightedHostUid).toBe('b');
  });

  it('goes back to the selected host when the highlighted one is deleted', () => {
    const groups = (...uids) => ({ g1: { name: 'G', hosts: Object.fromEntries(uids.map((uid) => [uid, { uid, alias: uid, address: uid, port: 8001, id: 'admin' }])) } });
    let state = reducer(undefined, fetchHosts.fulfilled(groups('a', 'b'), 'req', undefined));
    state = reducer(state, setSelectedHost('a'));
    state = reducer(state, setHighlightedHost('b'));
    state = reducer(state, fetchHosts.fulfilled(groups('a'), 'req', undefined));
    expect(state.highlightedHostUid).toBe('a');
  });
});
