import { describe, expect, it } from 'vitest';
import reducer, { setHighlightedHost, setSelectedGroup, setSelectedHost } from './hostSlice';

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

  it('stays where it is when the same host is selected again (a group click keeps the host)', () => {
    let state = reducer(undefined, setSelectedHost('a'));
    state = reducer(state, setHighlightedHost('b'));
    state = reducer(state, setSelectedHost('a'));
    expect(state.highlightedHostUid).toBe('b');
    state = reducer(state, setSelectedGroup({ groupId: 'g1', hostUid: 'a' }));
    expect(state.highlightedHostUid).toBe('b');
  });
});
