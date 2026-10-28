import { describe, expect, it, vi } from 'vitest';
// The real slices pull in apiClient/localStorage at import time; the map only
// needs their action creators, so fake them with the same action types.
vi.mock('./layoutSlice', () => ({
  openTab: (payload) => ({ type: 'layout/openTab', payload }),
  showStatusModal: (payload) => ({ type: 'layout/showStatusModal', payload }),
}));
vi.mock('./appBarSlice', () => ({
  setAboutCubrid: (payload) => ({ type: 'appBar/setAboutCubrid', payload }),
  openUpdateCheck: (payload) => ({ type: 'appBar/openUpdateCheck', payload }),
}));
vi.mock('../host/hostSlice', () => Object.fromEntries(
  ['openAddHostModal', 'openEditHostModal', 'openServerVersionModal', 'openImportExportModal', 'openCmsUserManagementModal']
    .map((name) => [name, (payload) => ({ type: `host/${name}`, payload })])
));

import {
  ALL_MENU_ACTIONS_DISABLED,
  NO_DASHBOARD_MENU_ACTIONS,
  MENU_ACTIONS,
  getMenuActionEnabled,
  runMenuAction,
} from './menuActions';

const CM = { noHostSelected: 'No host selected', selectHostHint: 'Select a host' };
const run = (id, selectedHostUid = 'h1') => {
  const dispatch = vi.fn();
  const handled = runMenuAction(id, { dispatch, CM, selectedHostUid });
  return { handled, actions: dispatch.mock.calls.map(([action]) => action) };
};

describe('getMenuActionEnabled', () => {
  it('gates host-bound actions on the selected and authorized host', () => {
    const none = getMenuActionEnabled({ selectedHostUid: null, authorizedHosts: [] });
    expect(none[MENU_ACTIONS.addHost]).toBe(true);
    expect(none[MENU_ACTIONS.editHost]).toBe(false);
    expect(none[MENU_ACTIONS.serverVersion]).toBe(false);
    expect(none[MENU_ACTIONS.cmsAccountManagement]).toBe(false);
    expect(none[MENU_ACTIONS.editCubridConfig]).toBe(true);

    const unauthorized = getMenuActionEnabled({ selectedHostUid: 'h1', authorizedHosts: [] });
    expect(unauthorized[MENU_ACTIONS.editHost]).toBe(true);
    expect(unauthorized[MENU_ACTIONS.cmsAccountManagement]).toBe(false);

    const authorized = getMenuActionEnabled({ selectedHostUid: 'h1', authorizedHosts: ['h1'] });
    expect(authorized[MENU_ACTIONS.cmsAccountManagement]).toBe(true);
    expect(authorized[MENU_ACTIONS.checkForUpdates]).toBe(true);
  });

  it('covers every action id, as does the all-disabled state', () => {
    const ids = Object.values(MENU_ACTIONS).sort();
    expect(Object.keys(getMenuActionEnabled({ selectedHostUid: null })).sort()).toEqual(ids);
    expect(Object.keys(ALL_MENU_ACTIONS_DISABLED).sort()).toEqual(ids);
    expect(Object.values(ALL_MENU_ACTIONS_DISABLED).every((v) => v === false)).toBe(true);
  });

  it('leaves only About and Check for Updates enabled while no dashboard is shown', () => {
    expect(Object.keys(NO_DASHBOARD_MENU_ACTIONS).sort()).toEqual(Object.values(MENU_ACTIONS).sort());
    expect(Object.entries(NO_DASHBOARD_MENU_ACTIONS).filter(([, on]) => on).map(([id]) => id).sort())
      .toEqual([MENU_ACTIONS.about, MENU_ACTIONS.checkForUpdates].sort());
  });
});

describe('runMenuAction', () => {
  it.each([
    [MENU_ACTIONS.addHost, 'host/openAddHostModal', undefined],
    [MENU_ACTIONS.editHost, 'host/openEditHostModal', 'h1'],
    [MENU_ACTIONS.exportHosts, 'host/openImportExportModal', 'export'],
    [MENU_ACTIONS.importHosts, 'host/openImportExportModal', 'import'],
    [MENU_ACTIONS.serviceDashboard, 'layout/openTab', 'service_dashboard'],
    [MENU_ACTIONS.cmsAccountManagement, 'host/openCmsUserManagementModal', undefined],
    [MENU_ACTIONS.editCubridConfig, 'layout/openTab', 'edit_config:h1:cubridconf'],
    [MENU_ACTIONS.editBrokerConfig, 'layout/openTab', 'broker_config:h1'],
    [MENU_ACTIONS.editCmConfig, 'layout/openTab', 'edit_config:h1:cmconf'],
    [MENU_ACTIONS.serverVersion, 'host/openServerVersionModal', 'h1'],
    [MENU_ACTIONS.about, 'appBar/setAboutCubrid', true],
  ])('%s dispatches %s', (id, type, payload) => {
    const { handled, actions } = run(id);
    expect(handled).toBe(true);
    expect(actions).toEqual([{ type, payload }]);
  });

  it('explains a config editor click when no host is selected', () => {
    const { actions } = run(MENU_ACTIONS.editBrokerConfig, null);
    expect(actions).toEqual([
      {
        type: 'layout/showStatusModal',
        payload: { type: 'info', title: CM.noHostSelected, message: CM.selectHostHint },
      },
    ]);
  });

  it('ignores unknown ids', () => {
    expect(run('bogus')).toEqual({ handled: false, actions: [] });
  });

  it('opens the update check', () => {
    const { handled, actions } = run(MENU_ACTIONS.checkForUpdates);
    expect(handled).toBe(true);
    expect(actions).toEqual([expect.objectContaining({ type: 'appBar/openUpdateCheck', payload: { source: 'manual' } })]);
  });
});
