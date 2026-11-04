import type { MenuItemConstructorOptions } from 'electron';

const send = jest.fn();
const getZoomLevel = jest.fn(() => 0);
const setZoomLevel = jest.fn();

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp'), isPackaged: false },
  Menu: { buildFromTemplate: jest.fn((template) => template), setApplicationMenu: jest.fn() },
  shell: { openExternal: jest.fn(), openPath: jest.fn(), showItemInFolder: jest.fn() },
}));
jest.mock('../window/window-registry', () => ({
  getMainWindow: () => ({ isDestroyed: () => false, webContents: { send, getZoomLevel, setZoomLevel } }),
}));

import { Menu } from 'electron';
import {
  buildApplicationMenuTemplate,
  installApplicationMenu,
  MENU_ACTION_IDS,
  normalizeMenuActionState,
  setApplicationMenuState,
  type MenuActionState,
} from './application-menu';

type Item = MenuItemConstructorOptions;

const submenu = (item: Item): Item[] => item.submenu as Item[];
const labels = (items: Item[]): (string | undefined)[] =>
  items.filter((item) => item.type !== 'separator').map((item) => item.label);
const top = (template: Item[], label: string): Item[] =>
  submenu(template.find((item) => item.label === label) as Item);
const flatten = (items: Item[]): Item[] =>
  items.flatMap((item) => [item, ...(Array.isArray(item.submenu) ? flatten(item.submenu) : [])]);
const allEnabled = normalizeMenuActionState(
  Object.fromEntries(MENU_ACTION_IDS.map((id) => [id, true]))
);

beforeEach(() => jest.clearAllMocks());

it('mirrors the header menu in English and Korean', () => {
  const en = buildApplicationMenuTemplate('en', false, allEnabled);
  expect(labels(en)).toEqual(['File', 'Host Service Management', 'Edit', 'View', 'Help']);
  expect(labels(top(en, 'File'))).toEqual(['Add Host', 'Edit Host', 'Export Host', 'Import Host', 'Quit']);
  expect(labels(top(en, 'Host Service Management'))).toEqual([
    'Service Dashboard',
    'CMS Account Management',
    'Edit Config Files',
  ]);
  expect(labels(top(en, 'Help'))).toEqual([
    'Help',
    'Report Bug',
    'CUBRID Online Forum',
    'CUBRID tools developments',
    'Check for Updates',
    'Host Engine Version',
    'About CUBRID Admin',
    'Open Settings File Location',
  ]);

  const ko = buildApplicationMenuTemplate('ko', false, allEnabled);
  expect(labels(ko)).toEqual(['파일', '호스트 서비스 관리', '편집', '보기', '도움말']);
  expect(labels(top(ko, '파일'))).toEqual([
    '호스트 추가',
    '호스트 편집',
    '호스트 내보내기',
    '호스트 가져오기',
    '종료',
  ]);
  expect(labels(top(ko, '도움말'))).toContain('설정 파일 위치 열기');
});

it('adds the macOS app menu and keeps Quit out of File there', () => {
  const mac = buildApplicationMenuTemplate('en', true, allEnabled);
  expect(mac[0].label).toBe('Next CUBRID Admin');
  expect(labels(top(mac, 'File'))).not.toContain('Quit');
  expect(labels(mac)).not.toContain('Window');
});

it('keeps the Edit roles, shows only the OS editing items, and binds no accelerator of its own', () => {
  const template = buildApplicationMenuTemplate('en', true, allEnabled);
  const edit = top(template, 'Edit');
  expect(edit.map((item) => item.role).filter(Boolean)).toEqual([
    'undo',
    'redo',
    'cut',
    'copy',
    'paste',
    'selectAll',
  ]);
  // Select All stays for its shortcut (Cmd+A in a text field on macOS) but is not shown.
  expect(labels(edit.filter((item) => item.visible !== false))).toEqual(['Undo', 'Redo', 'Cut', 'Copy', 'Paste']);
  const items = flatten(template);
  // Shown accelerators only (registerAccelerator: false): the keys are handled
  // before the menu. None takes CmdOrCtrl+W.
  const shown = items.filter((item) => 'accelerator' in item);
  expect(shown.map((item) => item.accelerator)).toEqual(['CmdOrCtrl+R', 'CmdOrCtrl+0', 'CmdOrCtrl+=', 'CmdOrCtrl+-']);
  expect(shown.every((item) => item.registerAccelerator === false)).toBe(true);
  expect(items.some((item) => item.role === 'close')).toBe(false);
});

it('keeps only full screen and zoom in View, and no Window menu', () => {
  const view = top(buildApplicationMenuTemplate('en', false, allEnabled), 'View');
  expect(labels(view)).toEqual(['Reload', 'Force Reload', 'Full Screen', 'Actual Size', 'Zoom In', 'Zoom Out']);
  expect(view.map((item) => item.role)).toContain('togglefullscreen');
  expect(view.some((item) => item.role === 'toggleDevTools')).toBe(false);
  expect(labels(top(buildApplicationMenuTemplate('ko', false, allEnabled), '보기'))).toEqual([
    '새로고침', '강력 새로고침', '전체 화면', '실제 크기', '확대', '축소',
  ]);

  getZoomLevel.mockReturnValue(1);
  (view.find((item) => item.label === 'Zoom In')?.click as () => void)();
  expect(setZoomLevel).toHaveBeenLastCalledWith(1.5);
  (view.find((item) => item.label === 'Zoom Out')?.click as () => void)();
  expect(setZoomLevel).toHaveBeenLastCalledWith(0.5);
  (view.find((item) => item.label === 'Actual Size')?.click as () => void)();
  expect(setZoomLevel).toHaveBeenLastCalledWith(0);
});

it('refreshes the view on View > Reload and leaves the whole-window reload to Shift+CmdOrCtrl+R', () => {
  const view = top(buildApplicationMenuTemplate('en', false, allEnabled), 'View');
  expect(view.some((item) => item.role === 'reload')).toBe(false);
  expect(view.map((item) => item.role)).toContain('forceReload');

  const reload = view.find((item) => item.accelerator === 'CmdOrCtrl+R') as Item;
  expect(reload.registerAccelerator).toBe(false);
  (reload.click as () => void)();
  expect(send).toHaveBeenCalledWith('desktop:refresh-view');
});

it('disables in-app actions from the reported state', () => {
  const state: MenuActionState = { ...allEnabled, 'edit-host': false, 'server-version': false };
  const items = flatten(buildApplicationMenuTemplate('en', false, state));
  const byLabel = (label: string) => items.find((item) => item.label === label) as Item;
  expect(byLabel('Edit Host').enabled).toBe(false);
  expect(byLabel('Host Engine Version').enabled).toBe(false);
  expect(byLabel('Add Host').enabled).toBe(true);

  const defaults = flatten(buildApplicationMenuTemplate('en', false));
  expect(defaults.find((item) => item.label === 'Add Host')?.enabled).toBe(false);
});

it('sends the action id to the renderer on click', () => {
  const items = flatten(buildApplicationMenuTemplate('en', false, allEnabled));
  const editCm = items.find((item) => item.label === 'Edit CM Config') as Item;
  (editCm.click as () => void)();
  expect(send).toHaveBeenCalledWith('desktop:menu-action', 'edit-cm-config');
});

it('normalizes reported state and rebuilds only on change', () => {
  expect(normalizeMenuActionState({ 'add-host': true, 'edit-host': 'yes', bogus: true })).toEqual(
    { ...normalizeMenuActionState(null), 'add-host': true }
  );

  installApplicationMenu();
  installApplicationMenu('en');
  installApplicationMenu('fr');
  expect(Menu.setApplicationMenu).toHaveBeenCalledTimes(1);

  installApplicationMenu('ko');
  setApplicationMenuState({ 'add-host': true });
  setApplicationMenuState({ 'add-host': true });
  expect(Menu.setApplicationMenu).toHaveBeenCalledTimes(3);
});
