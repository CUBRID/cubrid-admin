import { Menu, shell, type MenuItemConstructorOptions } from 'electron';
import * as fs from 'fs';
import { getDesktopSettingsPath } from '../config/desktop-settings';
import { getPortableAppRoot } from '../config/portable-root';

const PRODUCT_NAME = 'Next CUBRID Admin';

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
 * Builds and installs the native application menu, replacing Electron's
 * unbranded default (File/Edit/View/Window/Help with generic items like
 * "About Electron").
 *
 * CmdOrCtrl+W is reserved by main.ts's `before-input-event` handler to close
 * the active tab, not the window. No item below may bind that accelerator —
 * this rules out the `close` role and Electron's full `windowMenu`/`fileMenu`
 * convenience roles, since their built-in default templates both include a
 * CmdOrCtrl+W-bound "Close" item that would otherwise fight the tab handler.
 */
export function installApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
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
      label: '파일',
      submenu: [
        {
          label: '창 닫기',
          click: (_item, window) => window?.close(),
        },
        ...(isMac
          ? []
          : [{ type: 'separator' as const }, { role: 'quit' as const, label: '종료' }]),
      ],
    },
    {
      label: '편집',
      submenu: [
        { role: 'undo' as const, label: '실행 취소' },
        { role: 'redo' as const, label: '다시 실행' },
        { type: 'separator' as const },
        { role: 'cut' as const, label: '잘라내기' },
        { role: 'copy' as const, label: '복사' },
        { role: 'paste' as const, label: '붙여넣기' },
        { role: 'selectAll' as const, label: '모두 선택' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { role: 'reload' as const, label: '새로고침' },
        { role: 'forceReload' as const, label: '강력 새로고침' },
        { type: 'separator' as const },
        { role: 'resetZoom' as const, label: '실제 크기' },
        { role: 'zoomIn' as const, label: '확대' },
        { role: 'zoomOut' as const, label: '축소' },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const, label: '전체 화면' },
        { type: 'separator' as const },
        { role: 'toggleDevTools' as const, label: '개발자 도구' },
      ],
    },
    {
      label: '창',
      submenu: [
        { role: 'minimize' as const, label: '최소화' },
        { role: 'zoom' as const, label: '확대/축소' },
      ],
    },
    {
      label: '도움말',
      submenu: [
        { label: 'CUBRID 홈페이지', click: () => shell.openExternal('https://www.cubrid.org/') },
        {
          label: '버그 보고',
          click: () => shell.openExternal('http://jira.cubrid.org/secure/Dashboard.jspa'),
        },
        {
          label: 'CUBRID 온라인 포럼',
          click: () => shell.openExternal('https://www.reddit.com/r/CUBRID/'),
        },
        {
          label: 'CUBRID 도구 개발',
          click: () => shell.openExternal('https://github.com/CUBRID/cubrid-manager'),
        },
        { type: 'separator' as const },
        { label: '설정 파일 위치 열기', click: () => revealSettingsFile() },
        ...(isMac
          ? []
          : [
              { type: 'separator' as const },
              { role: 'about' as const, label: `${PRODUCT_NAME} 정보` },
            ]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
