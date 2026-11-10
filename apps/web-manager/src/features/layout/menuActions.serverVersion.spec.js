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
import { MENU_ACTIONS, engineVersionHostUid, getMenuActionEnabled, runMenuAction } from './menuActions';

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
