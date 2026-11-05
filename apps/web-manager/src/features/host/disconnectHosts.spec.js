import { describe, expect, it, vi } from 'vitest';

// layoutSlice reads the OS theme at import time; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
vi.mock('./hostSlice', () => ({
  revokeHostLogin: (uid) => ({ type: 'host/revoke', payload: uid }),
  forgetHostSession: (uid) => ({ type: 'host/forgetSession', payload: uid }),
  setSelectedHost: (uid) => ({ type: 'host/select', payload: uid }),
}));
vi.mock('../database/databaseCoreSlice', () => ({ resetDatabaseState: (uid) => ({ type: 'db/reset', payload: uid }) }));
vi.mock('../broker/brokerSlice', () => ({ resetBrokerState: (uid) => ({ type: 'broker/reset', payload: uid }) }));
vi.mock('../server/globalMonitoringSlice', () => ({ clearHostSummary: (uid) => ({ type: 'summary/clear', payload: uid }) }));

import { connectedHostUids, disconnectHosts } from './disconnectHosts';

describe('logging out of selected hosts', () => {
  it('takes only the connected ones', () => {
    expect(connectedHostUids(['a', 'b', 'c'], ['c', 'a'])).toEqual(['a', 'c']);
    expect(connectedHostUids(['b'], ['a'])).toEqual([]);
  });

  it('disconnects each as the single Disconnect does, and clears the sidebar for the selected one', () => {
    const actions = [];
    disconnectHosts((a) => actions.push(a), ['a', 'c'], 'c');
    const of = (uid) => actions.filter((a) => a.payload === uid || (a.type === 'host/select' && uid === 'c')).map((a) => a.type);
    expect(of('a')).toEqual(['host/revoke', 'host/forgetSession', 'layout/closeHostTabs', 'summary/clear']);
    expect(of('c')).toEqual(['host/revoke', 'host/forgetSession', 'layout/closeHostTabs', 'host/select', 'db/reset', 'broker/reset', 'summary/clear']);
  });
});
