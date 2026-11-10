import { expect, it, vi } from 'vitest';
vi.mock('./layoutSlice', () => ({ openTab: () => ({}), showStatusModal: () => ({}) }));
vi.mock('./appBarSlice', () => ({ setAboutCubrid: () => ({}), openUpdateCheck: () => ({}) }));
vi.mock('../host/hostSlice', () => ({
  openAddHostModal: () => ({}),
  openEditHostModal: () => ({}),
  openServerVersionModal: (hostUid) => ({ type: 'open-version', payload: hostUid }),
  openImportExportModal: () => ({}),
  openCmsUserManagementModal: () => ({}),
}));
import { MENU_ACTIONS, engineVersionHostUid, getMenuActionEnabled, menuActionHost, runMenuAction } from './menuActions';

it('enables Host Engine Version only for a connected selected host', () => {
  const version = (selectedHostUid, authorizedHosts) =>
    getMenuActionEnabled({ selectedHostUid, authorizedHosts })[MENU_ACTIONS.serverVersion];
  expect(version(null, [])).toBe(false);
  expect(version('h1', [])).toBe(false);
  expect(version('h1', ['h2'])).toBe(false);
  expect(version('h1', ['h1'])).toBe(true);
});

it('turns Host Engine Version off while the host waits to reconnect', () => {
  const enabled = getMenuActionEnabled({ selectedHostUid: 'h1', authorizedHosts: ['h1'], reconnectQueue: ['h1'] });
  expect(enabled[MENU_ACTIONS.serverVersion]).toBe(false);
});

it('follows the host highlighted in the host list, not the last selected one', () => {
  const version = (highlightedHostUid) => getMenuActionEnabled({
    selectedHostUid: 'a', highlightedHostUid, authorizedHosts: ['a', 'c'],
  })[MENU_ACTIONS.serverVersion];
  // B clicked but not connected (no login, or it failed): off.
  expect(version('b')).toBe(false);
  expect(version('c')).toBe(true);
  expect(version(null)).toBe(true);
  expect(engineVersionHostUid({ selectedHostUid: 'a', highlightedHostUid: 'c' })).toBe('c');
  expect(engineVersionHostUid({ selectedHostUid: 'a', highlightedHostUid: null })).toBe('a');
});

it('opens Host Engine Version for the highlighted host', () => {
  const dispatch = vi.fn();
  runMenuAction(MENU_ACTIONS.serverVersion, { dispatch, CM: {}, selectedHostUid: 'a', highlightedHostUid: 'c' });
  expect(dispatch).toHaveBeenCalledWith({ type: 'open-version', payload: 'c' });
});

describe('menuActionHost', () => {
  const ctx = { selectedHostUid: 'a', highlightedHostUid: 'b', authorizedHosts: ['a', 'b'], reconnectQueue: [] };

  it('Host Engine Version looks at the highlighted host, other items at the selected one', () => {
    expect(menuActionHost(MENU_ACTIONS.serverVersion, ctx)).toEqual({ hostUid: 'b', connected: true });
    expect(menuActionHost(MENU_ACTIONS.cmsAccountManagement, ctx)).toEqual({ hostUid: 'a', connected: true });
  });

  it('counts the highlighted host as not connected while it is not authorized or waits to reconnect', () => {
    expect(menuActionHost(MENU_ACTIONS.serverVersion, { ...ctx, authorizedHosts: ['a'] }).connected).toBe(false);
    expect(menuActionHost(MENU_ACTIONS.serverVersion, { ...ctx, reconnectQueue: ['b'] }).connected).toBe(false);
    expect(menuActionHost(MENU_ACTIONS.serverVersion, { ...ctx, highlightedHostUid: null, selectedHostUid: null }))
      .toEqual({ hostUid: null, connected: false });
  });

  it('is what turns Host Engine Version on and off', () => {
    for (const c of [ctx, { ...ctx, authorizedHosts: ['a'] }, { ...ctx, reconnectQueue: ['b'] }]) {
      expect(getMenuActionEnabled(c)[MENU_ACTIONS.serverVersion]).toBe(menuActionHost(MENU_ACTIONS.serverVersion, c).connected);
    }
  });
});
