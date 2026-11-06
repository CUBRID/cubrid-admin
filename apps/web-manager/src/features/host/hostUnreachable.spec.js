import { describe, expect, it, vi } from 'vitest';
import reducer, { closeReconnectModal, hostUnreachable, openReconnectModal, revokeHostLogin } from './hostSlice';

vi.mock('./hostApi', () => ({ hostApi: {} }));

const connected = (...uids) => ({ ...reducer(undefined, { type: '@@init' }), authorizedHosts: [...uids] });

describe('a host whose CMS could not be reached', () => {
  it('goes to the reconnect window with the reason, and stays connected until the user decides', () => {
    const state = reducer(connected('h1'), hostUnreachable('h1'));
    expect(state.reconnectQueue).toEqual(['h1']);
    expect(state.reconnectReasons).toEqual({ h1: 'unreachable' });
    expect(state.authorizedHosts).toEqual(['h1']);

    // Asked again while the window is up: nothing changes.
    expect(reducer(state, hostUnreachable('h1')).reconnectQueue).toEqual(['h1']);
  });

  it('drops the reason when the window closes or the host is disconnected', () => {
    const open = reducer(connected('h1'), hostUnreachable('h1'));
    expect(reducer(open, closeReconnectModal()).reconnectReasons).toEqual({});

    const revoked = reducer(open, revokeHostLogin('h1'));
    expect(revoked.reconnectReasons).toEqual({});
    expect(revoked.authorizedHosts).toEqual([]);
  });

  it('is told apart from a lost session, which has no reason', () => {
    const state = reducer(connected('h1', 'h2'), openReconnectModal('h2'));
    expect(state.reconnectQueue).toEqual(['h2']);
    expect(state.reconnectReasons).toEqual({});
  });
});
