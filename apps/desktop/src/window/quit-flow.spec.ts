import type { BrowserWindow } from 'electron';

jest.mock('electron', () => ({ app: { getPath: jest.fn(() => '/tmp'), isPackaged: false }, Menu: { buildFromTemplate: jest.fn(), setApplicationMenu: jest.fn() }, shell: {} }));

import { EventEmitter } from 'events';
import { confirmQuit, createQuitFlow, whenSessionEnds } from './quit-flow';

const window = {} as BrowserWindow;

describe('confirmQuit', () => {
  it('asks in the menu language, with no detail, and quits only on the first button', () => {
    const show = jest.fn().mockReturnValue(0);
    expect(confirmQuit(window, { language: 'ko', showMessageBoxSync: show })).toBe(true);
    const options = show.mock.calls[0][1];
    expect(options).toMatchObject({ message: '종료하시겠습니까?', buttons: ['종료', '취소'], cancelId: 1, title: 'CUBRID Admin' });
    expect(options.detail).toBeUndefined();
  });

  it('stays on Cancel or Esc', () => {
    const show = jest.fn().mockReturnValue(1);
    expect(confirmQuit(window, { language: 'en', showMessageBoxSync: show })).toBe(false);
    expect(show.mock.calls[0][1]).toMatchObject({ message: 'Do you want to quit?', buttons: ['Quit', 'Cancel'] });
  });
});

describe('createQuitFlow', () => {
  const setup = (answers: { quit?: boolean; quitUnsaved?: boolean; leaveUnsaved?: boolean } = {}) => {
    let unsaved = false;
    const questions = {
      quit: jest.fn(() => answers.quit ?? true),
      quitWithUnsavedChanges: jest.fn(() => answers.quitUnsaved ?? true),
      leaveWithUnsavedChanges: jest.fn(() => answers.leaveUnsaved ?? true),
    };
    const flow = createQuitFlow(questions, () => unsaved);
    const asked = () => questions.quit.mock.calls.length
      + questions.quitWithUnsavedChanges.mock.calls.length
      + questions.leaveWithUnsavedChanges.mock.calls.length;
    return { flow, questions, asked, setUnsaved: (v: boolean) => { unsaved = v; } };
  };

  it('asks once on a quit with nothing unsaved, and closes on yes', () => {
    const { flow, questions, asked } = setup();
    expect(flow.onWindowClose()).toBe(true);
    // window-all-closed quits next, closing again: not asked twice.
    expect(flow.onWindowClose()).toBe(true);
    expect(questions.quit).toHaveBeenCalledTimes(1);
    expect(asked()).toBe(1);
  });

  it('keeps the window on Cancel and leaves nothing behind: the next quit asks again', () => {
    const { flow, questions } = setup({ quit: false });
    expect(flow.onWindowClose()).toBe(false);
    expect(flow.onWindowClose()).toBe(false);
    expect(questions.quit).toHaveBeenCalledTimes(2);
  });

  it('asks the unsaved-changes question instead, and does not ask again when the page refuses to unload', () => {
    const { flow, questions, asked, setUnsaved } = setup();
    setUnsaved(true);
    expect(flow.onWindowClose()).toBe(true);
    expect(flow.onPreventUnload()).toBe(true);
    expect(questions.quitWithUnsavedChanges).toHaveBeenCalledTimes(1);
    expect(questions.quit).not.toHaveBeenCalled();
    expect(asked()).toBe(1);
  });

  it('keeps the window when the unsaved-changes question is cancelled', () => {
    const { flow, questions, setUnsaved } = setup({ quitUnsaved: false });
    setUnsaved(true);
    expect(flow.onWindowClose()).toBe(false);
    expect(flow.onWindowClose()).toBe(false);
    expect(questions.quitWithUnsavedChanges).toHaveBeenCalledTimes(2);
  });

  it('still asks about changes the page did not report, and a stay cancels the quit', () => {
    const { flow, questions } = setup({ quitUnsaved: false });
    expect(flow.onWindowClose()).toBe(true);
    expect(flow.onPreventUnload()).toBe(false);
    expect(questions.quitWithUnsavedChanges).toHaveBeenCalledTimes(1);
    // The next quit starts over with its question.
    expect(flow.onWindowClose()).toBe(true);
    expect(questions.quit).toHaveBeenCalledTimes(2);
  });

  it('asks nothing on SIGINT/SIGTERM or a window closed before start-up', () => {
    const { flow, asked } = setup();
    flow.quitWithoutAsking();
    expect(flow.onWindowClose()).toBe(true);
    expect(asked()).toBe(0);
  });

  it('asks nothing on SIGINT/SIGTERM with unsaved changes either, and the page unloads', () => {
    const { flow, asked, setUnsaved } = setup();
    setUnsaved(true);
    flow.quitWithoutAsking();
    expect(flow.onWindowClose()).toBe(true);
    expect(flow.onPreventUnload()).toBe(true);
    expect(asked()).toBe(0);
  });

  it('asks to leave the page on a reload with unsaved changes', () => {
    const { flow, questions } = setup({ leaveUnsaved: false });
    expect(flow.onPreventUnload()).toBe(false);
    expect(questions.leaveWithUnsavedChanges).toHaveBeenCalledTimes(1);
  });
});

describe('whenSessionEnds', () => {
  const setup = () => {
    const questions = { quit: jest.fn(() => true), quitWithUnsavedChanges: jest.fn(() => true), leaveWithUnsavedChanges: jest.fn(() => true) };
    const flow = createQuitFlow(questions, () => true);
    const powerMonitor = new EventEmitter();
    const win = new EventEmitter();
    whenSessionEnds(flow, powerMonitor as never, win as never);
    const asked = () => questions.quit.mock.calls.length + questions.quitWithUnsavedChanges.mock.calls.length
      + questions.leaveWithUnsavedChanges.mock.calls.length;
    return { flow, powerMonitor, win, asked };
  };

  it.each([
    ['macOS or Linux shutting down or logging out', 'powerMonitor', 'shutdown'],
    ['Windows ending the session', 'win', 'session-end'],
  ] as const)('%s: the quit that follows asks nothing, unsaved changes included', (_name, source, event) => {
    const s = setup();
    s[source].emit(event);
    expect(s.flow.onWindowClose()).toBe(true);
    expect(s.flow.onPreventUnload()).toBe(true);
    expect(s.asked()).toBe(0);
  });

  it('asks as before when neither came', () => {
    const s = setup();
    s.flow.onWindowClose();
    expect(s.asked()).toBe(1);
  });
});
