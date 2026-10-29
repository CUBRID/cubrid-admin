import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../update/updateCheckClient', () => ({
  fetchUpdateStatus: vi.fn(),
  openUpdateUrl: vi.fn(),
  dismissUpdate: vi.fn(),
}));

import { dismissUpdate, fetchUpdateStatus, openUpdateUrl } from '../../update/updateCheckClient';
import appBarReducer, { openUpdateCheck } from '../appBarSlice';
import UpdateCheckModal from './UpdateCheckModal';

const upToDate = { currentVersion: '0.1.0-alpha.1', lastCheckedAt: null, result: { status: 'up-to-date' } };
const updateAvailable = {
  currentVersion: '0.1.0-alpha.1',
  lastCheckedAt: null,
  result: {
    status: 'update-available',
    latestVersion: '0.1.0-alpha.2',
    downloadUrl: 'https://github.com/x/download.zip',
    releaseNotesUrl: 'https://github.com/x/releases/tag/v0.1.0-alpha.2',
  },
};
const errorStatus = (reason) => ({ currentVersion: '0.1.0-alpha.1', lastCheckedAt: null, result: { status: 'error', reason } });

let container;
let root;
let store;

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const render = async (uiLocale = 'en') => {
  store = configureStore({
    reducer: combineReducers({
      appBar: appBarReducer,
      user: () => ({ preferences: { uiLocale } }),
    }),
  });
  await act(async () => {
    root.render(
      <Provider store={store}>
        <UpdateCheckModal />
      </Provider>
    );
  });
};

const open = async (payload = { source: 'manual' }) => {
  await act(async () => {
    store.dispatch(openUpdateCheck(payload));
  });
  await flush();
};

const byTestId = (id) => container.querySelector(`[data-testid="${id}"]`);

const click = async (id) => {
  await act(async () => {
    byTestId(id).click();
  });
  await flush();
};

describe('UpdateCheckModal', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.mocked(fetchUpdateStatus).mockReset();
    vi.mocked(openUpdateUrl).mockReset().mockResolvedValue(true);
    vi.mocked(dismissUpdate).mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('renders nothing while closed and never checks', async () => {
    await render();

    expect(byTestId('update-check-modal')).toBeNull();
    expect(fetchUpdateStatus).not.toHaveBeenCalled();
  });

  it('shows a loading state, then up-to-date with the current version', async () => {
    const pending = deferred();
    vi.mocked(fetchUpdateStatus).mockReturnValue(pending.promise);
    await render();
    await open();

    expect(byTestId('update-check-loading')).not.toBeNull();
    expect(byTestId('update-check-retry').disabled).toBe(true);

    await act(async () => pending.resolve(upToDate));
    await flush();

    expect(byTestId('update-check-loading')).toBeNull();
    expect(byTestId('update-check-up-to-date').textContent).toContain('You are using the latest version.');
    expect(byTestId('update-check-current-version').textContent).toContain('v0.1.0-alpha.1');
    expect(byTestId('update-check-latest-version')).toBeNull();
    expect(fetchUpdateStatus).toHaveBeenCalledTimes(1);
  });

  it('shows both versions and opens the download URL', async () => {
    vi.mocked(fetchUpdateStatus).mockResolvedValue(updateAvailable);
    await render();
    await open();

    expect(byTestId('update-check-available')).not.toBeNull();
    expect(byTestId('update-check-latest-version').textContent).toContain('v0.1.0-alpha.2');

    await click('update-check-download');
    expect(openUpdateUrl).toHaveBeenCalledWith('https://github.com/x/download.zip');
  });

  it('falls back to the release page when the download URL is refused', async () => {
    vi.mocked(fetchUpdateStatus).mockResolvedValue(updateAvailable);
    vi.mocked(openUpdateUrl).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await render();
    await open();

    await click('update-check-download');

    expect(openUpdateUrl).toHaveBeenNthCalledWith(1, 'https://github.com/x/download.zip');
    expect(openUpdateUrl).toHaveBeenNthCalledWith(2, 'https://github.com/x/releases/tag/v0.1.0-alpha.2');
  });

  it('opens the release notes', async () => {
    vi.mocked(fetchUpdateStatus).mockResolvedValue(updateAvailable);
    await render();
    await open();

    await click('update-check-release-notes');

    expect(openUpdateUrl).toHaveBeenCalledWith('https://github.com/x/releases/tag/v0.1.0-alpha.2');
  });

  it.each([
    ['network', 'Could not reach the update server (GitHub).'],
    ['no-release', 'No published release information was found.'],
    ['rate-limited', 'temporarily limiting requests'],
    ['parse-error', 'could not be read'],
  ])('explains a %s error without claiming to be up to date', async (reason, text) => {
    vi.mocked(fetchUpdateStatus).mockResolvedValue(errorStatus(reason));
    await render();
    await open();

    expect(byTestId(`update-check-error-${reason}`).textContent).toContain(text);
    expect(byTestId('update-check-up-to-date')).toBeNull();
    expect(byTestId('update-check-current-version').textContent).toContain('v0.1.0-alpha.1');
  });

  it('shows a request failure when the server/IPC call itself fails, and retries', async () => {
    vi.mocked(fetchUpdateStatus).mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce(upToDate);
    await render();
    await open();

    expect(byTestId('update-check-request-failed')).not.toBeNull();

    await click('update-check-retry');

    expect(fetchUpdateStatus).toHaveBeenCalledTimes(2);
    expect(byTestId('update-check-up-to-date')).not.toBeNull();
  });

  it('closing a manual check never dismisses the version', async () => {
    vi.mocked(fetchUpdateStatus).mockResolvedValue(updateAvailable);
    await render();
    await open();

    await click('update-check-dismiss');

    expect(byTestId('update-check-modal')).toBeNull();
    expect(dismissUpdate).not.toHaveBeenCalled();
  });

  it('shows a startup notice from its preloaded status without re-checking, and "Later" dismisses it', async () => {
    await render();
    await open({ source: 'startup', preloadedStatus: updateAvailable });

    expect(fetchUpdateStatus).not.toHaveBeenCalled();
    expect(byTestId('update-check-dismiss').textContent).toBe('Later');

    await click('update-check-dismiss');

    expect(dismissUpdate).toHaveBeenCalledWith('0.1.0-alpha.2');
    expect(byTestId('update-check-modal')).toBeNull();
  });

  it('closing a startup notice with the X also dismisses it', async () => {
    await render();
    await open({ source: 'startup', preloadedStatus: updateAvailable });

    await click('update-check-modal-close');

    expect(dismissUpdate).toHaveBeenCalledWith('0.1.0-alpha.2');
  });

  it('never lets a slow earlier check overwrite a newer one (close, reopen, stale result lands)', async () => {
    const stale = deferred();
    vi.mocked(fetchUpdateStatus).mockReturnValueOnce(stale.promise).mockResolvedValueOnce(upToDate);
    await render();
    await open();
    await click('update-check-close');

    await open();
    await act(async () => stale.resolve(updateAvailable));
    await flush();

    expect(byTestId('update-check-available')).toBeNull();
    expect(byTestId('update-check-up-to-date')).not.toBeNull();
  });

  it('renders Korean labels for the ko locale', async () => {
    vi.mocked(fetchUpdateStatus).mockResolvedValue(errorStatus('network'));
    await render('ko');
    await open();

    expect(byTestId('update-check-modal').textContent).toContain('업데이트 확인');
    expect(byTestId('update-check-error-network').textContent).toContain('폐쇄망');
    expect(byTestId('update-check-retry').textContent).toContain('다시 확인');
  });
});
