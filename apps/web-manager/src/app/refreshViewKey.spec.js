import { describe, expect, it } from 'vitest';
import { isRefreshViewKey } from './refreshViewKey';

describe('isRefreshViewKey', () => {
  it('takes F5 and Ctrl/Cmd+R, also with the Korean input on', () => {
    expect(isRefreshViewKey({ key: 'F5', code: 'F5' })).toBe(true);
    expect(isRefreshViewKey({ key: 'r', code: 'KeyR', ctrlKey: true })).toBe(true);
    expect(isRefreshViewKey({ key: 'r', code: 'KeyR', metaKey: true })).toBe(true);
    expect(isRefreshViewKey({ key: 'ㄱ', code: 'KeyR', ctrlKey: true })).toBe(true);
  });

  it('leaves Shift+Ctrl/Cmd+R (whole page reload) and other keys alone', () => {
    expect(isRefreshViewKey({ key: 'R', code: 'KeyR', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(isRefreshViewKey({ key: 'r', code: 'KeyR' })).toBe(false);
    expect(isRefreshViewKey({ key: 'ㄱ', code: 'KeyT', ctrlKey: true })).toBe(false);
  });
});
