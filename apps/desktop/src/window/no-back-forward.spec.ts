import type { WebContents } from 'electron';
import { EventEmitter } from 'events';
import { keepNoBackForwardHistory } from './no-back-forward';

// A window's history: entries and the current index, as Chromium keeps them.
function fakeWebContents() {
  const emitter = new EventEmitter();
  let entries = ['#/desktop/workspace'];
  let index = 0;
  const navigationHistory = {
    canGoBack: () => index > 0,
    canGoForward: () => index < entries.length - 1,
    goBack: () => { if (index > 0) index -= 1; },
    goForward: () => { if (index < entries.length - 1) index += 1; },
    clear: jest.fn(() => { entries = [entries[index]]; index = 0; }),
  };
  const contents = Object.assign(emitter, { navigationHistory, isDestroyed: () => false }) as unknown as WebContents;
  const go = (url: string, inPage = true, isMainFrame = true) => {
    entries = [...entries.slice(0, index + 1), url];
    index = entries.length - 1;
    if (inPage) emitter.emit('did-navigate-in-page', {}, url, isMainFrame);
    else emitter.emit('did-navigate', {}, url);
  };
  const current = () => entries[index];
  return { contents, navigationHistory, go, current };
}

describe('keepNoBackForwardHistory', () => {
  it('leaves nothing to go back or forward to after in-app moves', () => {
    const w = fakeWebContents();
    keepNoBackForwardHistory(w.contents);
    w.go('#/home');
    w.go('#/desktop/workspace');
    w.go('#/home');
    expect(w.navigationHistory.canGoBack()).toBe(false);
    w.navigationHistory.goBack();
    expect(w.current()).toBe('#/home');
    w.navigationHistory.goForward();
    expect(w.current()).toBe('#/home');
  });

  it('also after a full page load', () => {
    const w = fakeWebContents();
    keepNoBackForwardHistory(w.contents);
    w.go('#/home', false);
    expect(w.navigationHistory.canGoBack()).toBe(false);
  });

  it('leaves the history alone for a frame inside the page', () => {
    const w = fakeWebContents();
    keepNoBackForwardHistory(w.contents);
    w.go('#/home', true, false);
    expect(w.navigationHistory.clear).not.toHaveBeenCalled();
  });
});
