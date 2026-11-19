import { needsWorkspaceSetup } from './desktop-settings';
import { findPreviousWorkspace } from './last-workspace';
import { getPreviousWorkspaceOffer, prepareDesktopStartup } from './legacy-settings';
import { getLegacyDataRoot } from './portable-root';

jest.mock('electron', () => ({ app: { isPackaged: false } }));
const calls: string[] = [];
jest.mock('./desktop-settings', () => ({
  ...jest.requireActual('./desktop-settings'),
  needsWorkspaceSetup: jest.fn(() => {
    calls.push('needsWorkspaceSetup');
    return true;
  }),
}));
jest.mock('./last-workspace', () => ({
  findPreviousWorkspace: jest.fn(() => {
    calls.push('findPreviousWorkspace');
    return { workspaceRoot: '/ws', settingsFolder: '/X' };
  }),
}));
jest.mock('./portable-root', () => ({
  ...jest.requireActual('./portable-root'),
  getLegacyDataRoot: jest.fn(() => {
    calls.push('legacy');
    return null;
  }),
}));

const needsSetup = needsWorkspaceSetup as jest.Mock;
const findPrevious = findPreviousWorkspace as jest.Mock;

describe('desktop startup settings', () => {
  beforeEach(() => {
    calls.length = 0;
    needsSetup.mockClear();
    findPrevious.mockClear();
  });

  it('takes over the 0.1.0 settings before anything reads the settings, then looks for the workspace used last', () => {
    const startup = prepareDesktopStartup();

    expect(calls).toEqual(['legacy', 'needsWorkspaceSetup', 'findPreviousWorkspace']);
    expect(startup).toEqual({ adopted: null, requiresSetup: true, previous: { workspaceRoot: '/ws', settingsFolder: '/X' } });
    expect(getPreviousWorkspaceOffer()).toEqual({ workspaceRoot: '/ws', settingsFolder: '/X' });
  });

  it('offers nothing once a workspace is set up', () => {
    needsSetup.mockReturnValue(false);
    expect(prepareDesktopStartup().previous).toBeNull();
    expect(findPrevious).not.toHaveBeenCalled();
    expect(getPreviousWorkspaceOffer()).toBeNull();
    needsSetup.mockReturnValue(true);
  });

  it('is not asked for the 0.1.0 place more than once per start', () => {
    prepareDesktopStartup();
    expect((getLegacyDataRoot as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    expect(calls.filter((c) => c === 'legacy')).toHaveLength(1);
  });
});
