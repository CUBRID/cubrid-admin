import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
});
import hostReducer, { hostNotResponding, hostResponding, hostUnreachable, revokeHostLogin } from './hostSlice';

const start = () => ({ ...hostReducer(undefined, { type: '@@init' }), authorizedHosts: ['h1'] });

describe('hostNotResponding', () => {
  it('sets once and keeps the same state for a repeated report', () => {
    const once = hostReducer(start(), hostNotResponding('h1'));
    expect(once.hostNotResponding).toEqual({ h1: true });
    expect(hostReducer(once, hostNotResponding('h1'))).toBe(once);
  });

  it('is cleared by an answer, a new login, the reconnect window or a disconnect, and nothing else changes', () => {
    const set = hostReducer(start(), hostNotResponding('h1'));
    expect(set.authorizedHosts).toEqual(['h1']);
    expect(hostReducer(set, hostResponding('h1')).hostNotResponding).toEqual({});
    expect(hostReducer(set, { type: 'host/loginToHost/fulfilled', payload: { hostUid: 'h1' }, meta: { arg: 'h1' } }).hostNotResponding).toEqual({});
    const unreachable = hostReducer(set, hostUnreachable('h1'));
    expect(unreachable.hostNotResponding).toEqual({});
    expect(unreachable.reconnectQueue).toEqual(['h1']);
    expect(hostReducer(set, revokeHostLogin('h1')).hostNotResponding).toEqual({});
  });
});

describe('loggingInHosts', () => {
  const pending = (arg) => ({ type: 'host/loginToHost/pending', meta: { arg } });
  it('lists each host while its own login runs, whatever is selected', () => {
    let state = { ...start(), selectedHostUid: 'h1' };
    state = hostReducer(state, pending('h2'));
    state = hostReducer(state, pending({ hostUid: 'h3', changes: { password: 'x' } }));
    expect(state.loggingInHosts).toEqual(['h2', 'h3']);
    state = hostReducer(state, { type: 'host/loginToHost/fulfilled', payload: { hostUid: 'h2' }, meta: { arg: 'h2' } });
    state = hostReducer(state, { type: 'host/loginToHost/rejected', payload: 'Incorrect password', meta: { arg: { hostUid: 'h3' } } });
    expect(state.loggingInHosts).toEqual([]);
  });
});
