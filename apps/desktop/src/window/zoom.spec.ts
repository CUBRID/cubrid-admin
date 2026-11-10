import type { BrowserWindow, Input } from 'electron';
import { applyZoom, installZoomShortcuts, zoomActionForInput } from './zoom';

const key = (code: string, overrides: Partial<Input> = {}): Input =>
  ({ type: 'keyDown', key: '', code, control: true, meta: false, alt: false, shift: false, isAutoRepeat: false, ...overrides }) as Input;

describe('zoomActionForInput', () => {
  it('reads Chrome\'s zoom keys, including = without Shift and the numeric keypad', () => {
    expect(zoomActionForInput(key('Equal'))).toBe('in');
    expect(zoomActionForInput(key('Equal', { shift: true }))).toBe('in');
    expect(zoomActionForInput(key('NumpadAdd'))).toBe('in');
    expect(zoomActionForInput(key('Minus'))).toBe('out');
    expect(zoomActionForInput(key('NumpadSubtract'))).toBe('out');
    expect(zoomActionForInput(key('Digit0'))).toBe('reset');
    expect(zoomActionForInput(key('Numpad0'))).toBe('reset');
  });

  it('takes Cmd as well as Ctrl, and nothing without one of them', () => {
    expect(zoomActionForInput(key('Equal', { control: false, meta: true }))).toBe('in');
    expect(zoomActionForInput(key('Equal', { control: false }))).toBeNull();
    expect(zoomActionForInput(key('Equal', { alt: true }))).toBeNull();
    expect(zoomActionForInput(key('Equal', { type: 'keyUp' }))).toBeNull();
    expect(zoomActionForInput(key('KeyR'))).toBeNull();
  });
});

describe('applyZoom', () => {
  it('moves one menu step from the current level and resets to 0', () => {
    const webContents = { getZoomLevel: jest.fn(() => 1), setZoomLevel: jest.fn() };
    applyZoom(webContents, 'in');
    expect(webContents.setZoomLevel).toHaveBeenLastCalledWith(1.5);
    applyZoom(webContents, 'out');
    expect(webContents.setZoomLevel).toHaveBeenLastCalledWith(0.5);
    applyZoom(webContents, 'reset');
    expect(webContents.setZoomLevel).toHaveBeenLastCalledWith(0);
  });
});

describe('installZoomShortcuts', () => {
  const listeners: Record<string, (...args: unknown[]) => void> = {};
  const webContents = {
    getZoomLevel: jest.fn(() => 0),
    setZoomLevel: jest.fn(),
    on: jest.fn((event: string, listener: (...args: unknown[]) => void) => { listeners[event] = listener; }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    installZoomShortcuts({ webContents } as unknown as BrowserWindow);
  });

  it('zooms on the key and keeps it from the page and the menu', () => {
    const event = { preventDefault: jest.fn() };
    listeners['before-input-event'](event, key('Equal'));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(webContents.setZoomLevel).toHaveBeenLastCalledWith(0.5);
  });

  it('leaves other keys alone', () => {
    const event = { preventDefault: jest.fn() };
    listeners['before-input-event'](event, key('KeyC'));
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(webContents.setZoomLevel).not.toHaveBeenCalled();
  });

  it('zooms on Ctrl + mouse wheel', () => {
    listeners['zoom-changed']({}, 'in');
    expect(webContents.setZoomLevel).toHaveBeenLastCalledWith(0.5);
    listeners['zoom-changed']({}, 'out');
    expect(webContents.setZoomLevel).toHaveBeenLastCalledWith(-0.5);
  });
});
