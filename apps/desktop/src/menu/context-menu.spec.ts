import type { BrowserWindow, ContextMenuParams, MenuItemConstructorOptions } from 'electron';

const popup = jest.fn();
const buildFromTemplate = jest.fn((template: MenuItemConstructorOptions[]) => ({ popup, template }));

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp'), isPackaged: false },
  Menu: { buildFromTemplate: (template: MenuItemConstructorOptions[]) => buildFromTemplate(template), setApplicationMenu: jest.fn() },
  shell: { openExternal: jest.fn(), openPath: jest.fn(), showItemInFolder: jest.fn() },
}));
jest.mock('../window/window-registry', () => ({ getMainWindow: () => null }));

import { installApplicationMenu } from './application-menu';
import { buildContextMenuTemplate, installContextMenu } from './context-menu';

const flags = (overrides: Partial<ContextMenuParams['editFlags']> = {}): ContextMenuParams['editFlags'] => ({
  canUndo: true, canRedo: false, canCut: true, canCopy: true, canPaste: true, canDelete: true, canSelectAll: true,
  canEditRichly: false, ...overrides,
});
const labels = (items: MenuItemConstructorOptions[]) => items.filter((i) => i.type !== 'separator').map((i) => i.label);

beforeEach(() => jest.clearAllMocks());

it('offers the OS editing items in a text field, enabled as the field reports', () => {
  const items = buildContextMenuTemplate({ isEditable: true, selectionText: '', editFlags: flags() }, 'en');
  expect(labels(items)).toEqual(['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Select All']);
  expect(items.map((i) => i.role).filter(Boolean)).toEqual(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']);
  expect(items.find((i) => i.role === 'redo')?.enabled).toBe(false);
  expect(items.find((i) => i.role === 'paste')?.enabled).toBe(true);
});

it('offers Copy on selected text outside a field, and nothing elsewhere', () => {
  expect(labels(buildContextMenuTemplate({ isEditable: false, selectionText: 'demodb', editFlags: flags() }, 'ko'))).toEqual(['복사']);
  expect(buildContextMenuTemplate({ isEditable: false, selectionText: '  ', editFlags: flags() }, 'en')).toEqual([]);
});

it('shows the menu in the application menu\'s language and skips places with nothing to offer', () => {
  const listeners: Record<string, (...args: unknown[]) => void> = {};
  const window = { webContents: { on: (event: string, listener: (...args: unknown[]) => void) => { listeners[event] = listener; } } };
  installApplicationMenu('ko');
  installContextMenu(window as unknown as BrowserWindow);
  const built = () => buildFromTemplate.mock.calls.length;
  const before = built();

  listeners['context-menu']({}, { isEditable: true, selectionText: '', editFlags: flags() });
  expect(built()).toBe(before + 1);
  expect(labels(buildFromTemplate.mock.calls.at(-1)?.[0] ?? [])).toEqual(['실행 취소', '다시 실행', '잘라내기', '복사', '붙여넣기', '모두 선택']);
  expect(popup).toHaveBeenCalledWith({ window });

  listeners['context-menu']({}, { isEditable: false, selectionText: '', editFlags: flags() });
  expect(built()).toBe(before + 1);
});
