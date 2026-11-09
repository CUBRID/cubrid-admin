import type { BrowserWindow } from 'electron';

jest.mock('electron', () => ({ app: { getPath: jest.fn(() => '/tmp'), isPackaged: false }, Menu: { buildFromTemplate: jest.fn(), setApplicationMenu: jest.fn() }, shell: {} }));

import { confirmUnloadWithUnsavedChanges } from './unsaved-changes';

const window = {} as BrowserWindow;

describe('confirmUnloadWithUnsavedChanges', () => {
  it('asks to quit, in the menu language, and quits only on the first button', () => {
    const show = jest.fn().mockReturnValue(0);
    expect(confirmUnloadWithUnsavedChanges(window, { quitting: true, language: 'ko', showMessageBoxSync: show })).toBe(true);
    expect(show).toHaveBeenCalledWith(window, expect.objectContaining({
      message: '저장하지 않은 변경이 있습니다.',
      detail: '종료할까요? 변경 내용은 사라집니다.',
      buttons: ['종료', '취소'],
      cancelId: 1,
      defaultId: 1,
    }));
  });

  it('stays when the user cancels (button 1, Esc)', () => {
    const show = jest.fn().mockReturnValue(1);
    expect(confirmUnloadWithUnsavedChanges(window, { quitting: true, language: 'en', showMessageBoxSync: show })).toBe(false);
  });

  it('asks to leave the page for a reload', () => {
    const show = jest.fn().mockReturnValue(0);
    confirmUnloadWithUnsavedChanges(window, { quitting: false, language: 'en', showMessageBoxSync: show });
    expect(show.mock.calls[0][1]).toMatchObject({ buttons: ['Leave', 'Cancel'], detail: 'Leave this page anyway? Your changes will be lost.' });
  });
});
