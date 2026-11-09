import { expect, it, vi } from 'vitest';
vi.mock('./layoutSlice', () => ({ openTab: () => ({}), showStatusModal: () => ({}) }));
vi.mock('./appBarSlice', () => ({ setAboutCubrid: () => ({}), openUpdateCheck: () => ({}) }));
vi.mock('../host/hostSlice', () => ({
  openAddHostModal: () => ({}),
  openEditHostModal: () => ({}),
  openServerVersionModal: () => ({}),
  openImportExportModal: () => ({}),
  openCmsUserManagementModal: () => ({}),
}));
import { MENU_ACTIONS, getMenuActionEnabled } from './menuActions';

it('enables Host Engine Version only for a connected selected host', () => {
  const version = (selectedHostUid, authorizedHosts) =>
    getMenuActionEnabled({ selectedHostUid, authorizedHosts })[MENU_ACTIONS.serverVersion];
  expect(version(null, [])).toBe(false);
  expect(version('h1', [])).toBe(false);
  expect(version('h1', ['h2'])).toBe(false);
  expect(version('h1', ['h1'])).toBe(true);
});
