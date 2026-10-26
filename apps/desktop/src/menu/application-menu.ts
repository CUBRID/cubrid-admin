import { Menu, shell, type MenuItemConstructorOptions } from 'electron';
import * as fs from 'fs';
import { getDesktopSettingsPath } from '../config/desktop-settings';
import { getPortableAppRoot } from '../config/portable-root';

const PRODUCT_NAME = 'Next CUBRID Admin';

export type MenuLanguage = 'en' | 'ko';

// Mirrors the renderer's UI locale (LanguageToggle); English is the default
// until the renderer reports its language over `desktop:set-menu-language`.
const MENU_LABELS = {
  en: {
    file: 'File',
    closeWindow: 'Close Window',
    quit: 'Quit',
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
    resetZoom: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    toggleFullScreen: 'Toggle Full Screen',
    toggleDevTools: 'Developer Tools',
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    help: 'Help',
    cubridHomepage: 'CUBRID Homepage',
    reportBug: 'Report a Bug',
    cubridForum: 'CUBRID Online Forum',
    cubridToolsDev: 'CUBRID Tools Development',
    openSettingsFileLocation: 'Open Settings File Location',
    about: `About ${PRODUCT_NAME}`,
  },
  ko: {
    file: '파일',
    closeWindow: '창 닫기',
    quit: '종료',
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
    resetZoom: '실제 크기',
    zoomIn: '확대',
    zoomOut: '축소',
    toggleFullScreen: '전체 화면',
    toggleDevTools: '개발자 도구',
    window: '창',
    minimize: '최소화',
    zoom: '확대/축소',
    help: '도움말',
    cubridHomepage: 'CUBRID 홈페이지',
    reportBug: '버그 보고',
    cubridForum: 'CUBRID 온라인 포럼',
    cubridToolsDev: 'CUBRID 도구 개발',
    openSettingsFileLocation: '설정 파일 위치 열기',
    about: `${PRODUCT_NAME} 정보`,
  },
} satisfies Record<MenuLanguage, Record<string, string>>;

let currentLanguage: MenuLanguage | null = null;

export function normalizeMenuLanguage(value: unknown): MenuLanguage {
  return value === 'ko' ? 'ko' : 'en';
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
 * Builds the native application menu template, replacing Electron's
 * unbranded default (File/Edit/View/Window/Help with generic items like
 * "About Electron").
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
  isMac: boolean
): MenuItemConstructorOptions[] {
  const L = MENU_LABELS[language];

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
        {
          label: L.closeWindow,
          click: (_item, window) => window?.close(),
        },
        ...(isMac
          ? []
          : [{ type: 'separator' as const }, { role: 'quit' as const, label: L.quit }]),
      ],
    },
    {
      label: L.edit,
      submenu: [
        { role: 'undo' as const, label: L.undo },
        { role: 'redo' as const, label: L.redo },
        { type: 'separator' as const },
        { role: 'cut' as const, label: L.cut },
        { role: 'copy' as const, label: L.copy },
        { role: 'paste' as const, label: L.paste },
        { role: 'selectAll' as const, label: L.selectAll },
      ],
    },
    {
      label: L.view,
      submenu: [
        { role: 'reload' as const, label: L.reload },
        { role: 'forceReload' as const, label: L.forceReload },
        { type: 'separator' as const },
        { role: 'resetZoom' as const, label: L.resetZoom },
        { role: 'zoomIn' as const, label: L.zoomIn },
        { role: 'zoomOut' as const, label: L.zoomOut },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const, label: L.toggleFullScreen },
        { type: 'separator' as const },
        { role: 'toggleDevTools' as const, label: L.toggleDevTools },
      ],
    },
    {
      label: L.window,
      submenu: [
        { role: 'minimize' as const, label: L.minimize },
        { role: 'zoom' as const, label: L.zoom },
      ],
    },
    {
      label: L.help,
      submenu: [
        { label: L.cubridHomepage, click: () => shell.openExternal('https://www.cubrid.org/') },
        {
          label: L.reportBug,
          click: () => shell.openExternal('http://jira.cubrid.org/secure/Dashboard.jspa'),
        },
        {
          label: L.cubridForum,
          click: () => shell.openExternal('https://www.reddit.com/r/CUBRID/'),
        },
        {
          label: L.cubridToolsDev,
          click: () => shell.openExternal('https://github.com/CUBRID/cubrid-manager'),
        },
        { type: 'separator' as const },
        { label: L.openSettingsFileLocation, click: () => revealSettingsFile() },
        ...(isMac
          ? []
          : [{ type: 'separator' as const }, { role: 'about' as const, label: L.about }]),
      ],
    },
  ];
}

/**
 * Installs the application menu in the given language. Rebuilding is skipped
 * when the language is unchanged, since the renderer reports it on every
 * startup and preference load, not only on an actual toggle.
 */
export function installApplicationMenu(language: unknown = 'en'): void {
  const next = normalizeMenuLanguage(language);
  if (next === currentLanguage) return;

  Menu.setApplicationMenu(
    Menu.buildFromTemplate(buildApplicationMenuTemplate(next, process.platform === 'darwin'))
  );
  currentLanguage = next;
}
