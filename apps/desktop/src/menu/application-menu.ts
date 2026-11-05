import { Menu, shell, type MenuItemConstructorOptions } from 'electron';
import * as fs from 'fs';
import { getDesktopSettingsPath } from '../config/desktop-settings';
import { getPortableAppRoot } from '../config/portable-root';
import { getMainWindow } from '../window/window-registry';
import { applyZoom, type ZoomAction } from '../window/zoom';

const PRODUCT_NAME = 'Next CUBRID Admin';

export type MenuLanguage = 'en' | 'ko';

/**
 * In-app actions the native menu shares with the renderer's header menu. Must
 * match MENU_ACTIONS in apps/web-manager/src/features/layout/menuActions.js.
 * A click sends the id over `desktop:menu-action`; the renderer runs it.
 */
export const MENU_ACTION_IDS = [
  'add-host',
  'edit-host',
  'export-hosts',
  'import-hosts',
  'service-dashboard',
  'cms-account-management',
  'edit-cubrid-config',
  'edit-broker-config',
  'edit-cm-config',
  'check-for-updates',
  'server-version',
  'about',
] as const;

export type MenuActionId = (typeof MENU_ACTION_IDS)[number];
export type MenuActionState = Record<MenuActionId, boolean>;

// Item keys match the renderer's cmLabels keys where the header has the same
// item, so both menus read the same; the rest are native-only.
export const MENU_LABELS = {
  en: {
    file: 'File',
    addHost: 'Add Host',
    editHost: 'Edit Host',
    exportHost: 'Export Host',
    importHost: 'Import Host',
    quit: 'Quit',
    hostServiceManagement: 'Host Service Management',
    serviceDashboard: 'Service Dashboard',
    cmsAccountManagement: 'CMS Account Management',
    configParam: 'Edit Config Files',
    editCubridConfig: 'Edit Cubrid Config',
    editBrokerConfig: 'Edit Broker Config',
    editCmConfig: 'Edit CM Config',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    view: 'View',
    reload: 'Reload',
    forceReload: 'Force Reload',
    toggleDevTools: 'Developer Tools',
    fullScreen: 'Full Screen',
    resetZoom: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    front: 'Bring All to Front',
    help: 'Help',
    reportBug: 'Report Bug',
    cubridOnlineForum: 'CUBRID Online Forum',
    cubridToolsDevelopment: 'CUBRID tools developments',
    checkForUpdates: 'Check for Updates',
    serverVersion: 'Host Engine Version',
    aboutCubridAdmin: 'About CUBRID Admin',
    openSettingsFileLocation: 'Open Settings File Location',
  },
  ko: {
    file: '파일',
    addHost: '호스트 추가',
    editHost: '호스트 편집',
    exportHost: '호스트 내보내기',
    importHost: '호스트 가져오기',
    quit: '종료',
    hostServiceManagement: '호스트 서비스 관리',
    serviceDashboard: '서비스 대시보드',
    cmsAccountManagement: 'CMS 계정 관리',
    configParam: '설정 파일 편집',
    editCubridConfig: 'CUBRID 설정 편집',
    editBrokerConfig: '브로커 설정 편집',
    editCmConfig: 'CM 설정 편집',
    edit: '편집',
    undo: '실행 취소',
    redo: '다시 실행',
    cut: '잘라내기',
    copy: '복사',
    paste: '붙여넣기',
    selectAll: '모두 선택',
    view: '보기',
    reload: '새로고침',
    forceReload: '강력 새로고침',
    toggleDevTools: '개발자 도구',
    fullScreen: '전체 화면',
    resetZoom: '실제 크기',
    zoomIn: '확대',
    zoomOut: '축소',
    window: '창',
    minimize: '최소화',
    zoom: '확대/축소',
    front: '모두 앞으로 가져오기',
    help: '도움말',
    reportBug: '버그 보고',
    cubridOnlineForum: 'CUBRID 온라인 포럼',
    cubridToolsDevelopment: 'CUBRID 도구 개발',
    checkForUpdates: '업데이트 확인',
    serverVersion: '호스트 엔진 버전',
    aboutCubridAdmin: 'CUBRID Admin 정보',
    openSettingsFileLocation: '설정 파일 위치 열기',
  },
} satisfies Record<MenuLanguage, Record<string, string>>;

// Until the renderer reports, no dashboard is shown, so every in-app action
// is disabled.
const ALL_ACTIONS_DISABLED = Object.fromEntries(
  MENU_ACTION_IDS.map((id) => [id, false])
) as MenuActionState;

let currentLanguage: MenuLanguage = 'en';
let currentState: MenuActionState = ALL_ACTIONS_DISABLED;
let installed = false;

/** The language the menus are shown in (the renderer's UI language). */
export function getMenuLanguage(): MenuLanguage {
  return currentLanguage;
}

export function normalizeMenuLanguage(value: unknown): MenuLanguage {
  return value === 'ko' ? 'ko' : 'en';
}

/** Keeps only known ids; anything missing or not `true` is disabled. */
export function normalizeMenuActionState(value: unknown): MenuActionState {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    MENU_ACTION_IDS.map((id) => [id, source[id] === true])
  ) as MenuActionState;
}

// Re-reads what the window shows (its tab, the host list), not the whole page.
function sendRefreshView(): void {
  const window = getMainWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send('desktop:refresh-view');
  }
}

function sendMenuAction(id: MenuActionId): void {
  const window = getMainWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send('desktop:menu-action', id);
  }
}

function zoomWindow(action: ZoomAction): void {
  const window = getMainWindow();
  if (window && !window.isDestroyed()) {
    applyZoom(window.webContents, action);
  }
}

function revealSettingsFile(): void {
  const settingsPath = getDesktopSettingsPath();
  const portableRoot = getPortableAppRoot();
  if (fs.existsSync(settingsPath)) {
    shell.showItemInFolder(settingsPath);
  } else if (fs.existsSync(portableRoot)) {
    shell.openPath(portableRoot);
  }
}

/**
 * Builds the native application menu template. File, Host Service Management
 * and the in-app Help items mirror the header menu (HeaderMenu.jsx) and run
 * the same renderer actions.
 *
 * CmdOrCtrl+W is reserved by main.ts's `before-input-event` handler to close
 * the active tab, not the window. No item below may bind that accelerator —
 * this rules out the `close` role and Electron's full `windowMenu`/`fileMenu`
 * convenience roles, since their built-in default templates both include a
 * CmdOrCtrl+W-bound "Close" item that would otherwise fight the tab handler.
 *
 * The macOS app-name menu keeps role defaults, which macOS localizes itself.
 */
export function buildApplicationMenuTemplate(
  language: MenuLanguage,
  isMac: boolean,
  state: MenuActionState = ALL_ACTIONS_DISABLED
): MenuItemConstructorOptions[] {
  const L = MENU_LABELS[language];
  const action = (id: MenuActionId, label: string): MenuItemConstructorOptions => ({
    label,
    enabled: state[id],
    click: () => sendMenuAction(id),
  });

  return [
    ...(isMac
      ? [
          {
            label: PRODUCT_NAME,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: L.file,
      submenu: [
        action('add-host', L.addHost),
        action('edit-host', L.editHost),
        action('export-hosts', L.exportHost),
        action('import-hosts', L.importHost),
        ...(isMac
          ? []
          : [{ type: 'separator' as const }, { role: 'quit' as const, label: L.quit }]),
      ],
    },
    {
      label: L.hostServiceManagement,
      submenu: [
        action('service-dashboard', L.serviceDashboard),
        { type: 'separator' },
        action('cms-account-management', L.cmsAccountManagement),
        {
          label: L.configParam,
          submenu: [
            action('edit-cubrid-config', L.editCubridConfig),
            action('edit-broker-config', L.editBrokerConfig),
            action('edit-cm-config', L.editCmConfig),
          ],
        },
      ],
    },
    {
      // These roles are not decoration: on macOS, Cmd+C/V/X/A/Z in text
      // inputs only work when the application menu provides them.
      label: L.edit,
      submenu: [
        { role: 'undo', label: L.undo },
        { role: 'redo', label: L.redo },
        { type: 'separator' },
        { role: 'cut', label: L.cut },
        { role: 'copy', label: L.copy },
        { role: 'paste', label: L.paste },
        // Not shown, but kept: on macOS Cmd+A in a text field needs it.
        { role: 'selectAll', label: L.selectAll, visible: false },
      ],
    },
    {
      label: L.view,
      submenu: [
        // CmdOrCtrl+R (and F5) refresh the view; the page's own key handler
        // does it on Windows and Linux, where the accelerator is only shown.
        // Shift+CmdOrCtrl+R (forceReload) reloads the whole window.
        { label: L.reload, accelerator: 'CmdOrCtrl+R', registerAccelerator: false, click: sendRefreshView },
        { role: 'forceReload', label: L.forceReload },
        { type: 'separator' },
        { role: 'togglefullscreen', label: L.fullScreen },
        { type: 'separator' },
        // The keys are handled before the page and the menu see them
        // (window/zoom.ts), which also covers `+` and the numeric keypad;
        // the accelerators here are what the menu shows.
        { label: L.resetZoom, accelerator: 'CmdOrCtrl+0', registerAccelerator: false, click: () => zoomWindow('reset') },
        { label: L.zoomIn, accelerator: 'CmdOrCtrl+=', registerAccelerator: false, click: () => zoomWindow('in') },
        { label: L.zoomOut, accelerator: 'CmdOrCtrl+-', registerAccelerator: false, click: () => zoomWindow('out') },
      ],
    },
    {
      label: L.help,
      submenu: [
        { label: L.help, click: () => shell.openExternal('https://www.cubrid.org/') },
        {
          label: L.reportBug,
          click: () => shell.openExternal('http://jira.cubrid.org/secure/Dashboard.jspa'),
        },
        {
          label: L.cubridOnlineForum,
          click: () => shell.openExternal('https://www.reddit.com/r/CUBRID/'),
        },
        {
          label: L.cubridToolsDevelopment,
          click: () => shell.openExternal('https://github.com/CUBRID/cubrid-manager'),
        },
        { type: 'separator' },
        action('check-for-updates', L.checkForUpdates),
        action('server-version', L.serverVersion),
        action('about', L.aboutCubridAdmin),
        { type: 'separator' },
        { label: L.openSettingsFileLocation, click: () => revealSettingsFile() },
      ],
    },
  ];
}

function rebuild(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildApplicationMenuTemplate(currentLanguage, process.platform === 'darwin', currentState)
    )
  );
  installed = true;
}

/**
 * Installs the application menu, optionally in a given language. The
 * renderer reports its language on every startup and preference load, so an
 * unchanged language does not rebuild.
 */
export function installApplicationMenu(language: unknown = currentLanguage): void {
  const next = normalizeMenuLanguage(language);
  if (installed && next === currentLanguage) return;
  currentLanguage = next;
  rebuild();
}

/** Applies the renderer's enabled flags; rebuilds only when one changed. */
export function setApplicationMenuState(state: unknown): void {
  const next = normalizeMenuActionState(state);
  if (installed && MENU_ACTION_IDS.every((id) => next[id] === currentState[id])) return;
  currentState = next;
  rebuild();
}
