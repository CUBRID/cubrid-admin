import { describe, expect, it } from 'vitest';
import { getCM } from '../../constants/useCM';
import { desktopErrorText } from './desktopErrorText';

const KO = getCM('ko');
const EN = getCM('en');
// What ipcRenderer.invoke rejects with when the main process throws.
const fromMain = (message) => new Error(`Error invoking remote method 'desktop:set-workspace-root': Error: ${message}`);

describe('desktopErrorText', () => {
  it('words the desktop app\'s own errors from their codes', () => {
    expect(desktopErrorText(fromMain('WORKSPACE_IN_APP_BUNDLE'), KO, KO.workspaceSaveFailedMsg)).toBe('워크스페이스는 앱 번들 안에 둘 수 없습니다.');
    expect(desktopErrorText(fromMain('WORKSPACE_IN_APP_BUNDLE'), EN, EN.workspaceSaveFailedMsg)).toBe('Workspace cannot be inside the application bundle.');
    expect(desktopErrorText(fromMain("WORKSPACE_NOT_WRITABLE: EACCES: permission denied, mkdir '/x'"), KO, KO.workspaceSaveFailedMsg))
      .toBe("워크스페이스 폴더에 쓸 수 없습니다. (EACCES: permission denied, mkdir '/x')");
  });

  it('keeps any other error after the general sentence, without Electron\'s wrapper', () => {
    expect(desktopErrorText(fromMain('API server did not become ready'), KO, KO.workspaceSaveFailedMsg))
      .toBe('워크스페이스를 저장하지 못했습니다. (API server did not become ready)');
    expect(desktopErrorText(fromMain('API server did not become ready'), EN, EN.workspaceSaveFailedMsg)).toBe('API server did not become ready');
    expect(desktopErrorText(undefined, KO, KO.workspaceSaveFailedMsg)).toBe('워크스페이스를 저장하지 못했습니다.');
  });
});
