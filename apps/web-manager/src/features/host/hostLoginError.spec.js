import { describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

// apiClient (imported through hostSlice) reads localStorage at load time.
vi.hoisted(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
});

vi.mock('./hostApi', () => ({ hostApi: { loginToHost: vi.fn() } }));

import reducer, { loginToHost } from './hostSlice';
import { hostApi } from './hostApi';
import { hostLoginErrorMessage } from './hostLoginError';
import { CM as CM_EN } from '../../constants/cmLabels';
import { CM_KO } from '../../constants/cmLabels.ko';

// What apiClient's interceptor leaves on a rejected request (see global-filter.ts).
const apiError = (type, message) => ({
  response: { data: { data: { type, code: type.split('/').pop().toUpperCase() }, message } },
});
const NO_RESPONSE = apiError('/errors/cms/no_response', 'No response was received from CMS.');

describe('hostLoginErrorMessage', () => {
  it('uses the label for CMS errors whose server copy is fixed English', () => {
    expect(hostLoginErrorMessage(NO_RESPONSE, CM_KO)).toBe(CM_KO.hostLoginNoResponseMsg);
    expect(hostLoginErrorMessage(NO_RESPONSE, CM_EN)).toBe(CM_EN.hostLoginNoResponseMsg);
    expect(hostLoginErrorMessage(apiError('/errors/cms/tls_error', 'Could not establish ...'), CM_KO))
      .toBe(CM_KO.hostLoginTlsErrorMsg);
  });

  it("passes the CMS's own message through", () => {
    expect(hostLoginErrorMessage(apiError('/errors/cms/request_failed', 'Incorrect password'), CM_KO))
      .toBe('Incorrect password');
  });

  it('falls back to the label when there is no server message', () => {
    expect(hostLoginErrorMessage(new Error('Network Error'), CM_KO)).toBe(CM_KO.hostLoginFailedMsg);
  });
});

describe('loginToHost', () => {
  const storeWithLocale = (uiLocale) => configureStore({
    reducer: { host: reducer, user: () => ({ preferences: { uiLocale } }) },
  });

  it('stores the failure in the UI language', async () => {
    hostApi.loginToHost.mockRejectedValueOnce(NO_RESPONSE);
    const store = storeWithLocale('ko');
    await store.dispatch(loginToHost('h1'));

    expect(store.getState().host.hostAuthErrors.h1).toBe(CM_KO.hostLoginNoResponseMsg);
    expect(store.getState().host.error).toBe(CM_KO.hostLoginNoResponseMsg);
  });

  it('clears the failure, including the modal error, once a later login succeeds', async () => {
    const store = storeWithLocale('en');
    hostApi.loginToHost.mockRejectedValueOnce(NO_RESPONSE);
    await store.dispatch(loginToHost('h1'));
    hostApi.loginToHost.mockResolvedValueOnce({ success: true, isHA: false });
    await store.dispatch(loginToHost('h1'));

    const { hostAuthErrors, error, authorizedHosts } = store.getState().host;
    expect(authorizedHosts).toEqual(['h1']);
    expect(hostAuthErrors).toEqual({});
    expect(error).toBeNull();
  });

  it('clears a failure that landed while a successful attempt was in flight', () => {
    let state = reducer(undefined, loginToHost.pending('ok', 'h1'));
    state = reducer(state, loginToHost.rejected(null, 'other', 'h1', 'No response'));
    state = reducer(state, loginToHost.fulfilled({ hostUid: 'h1', isHA: false }, 'ok', 'h1'));

    expect(state.hostAuthErrors).toEqual({});
    expect(state.error).toBeNull();
  });

  it("leaves another host's failure alone", () => {
    let state = reducer(undefined, loginToHost.rejected(null, 'a', 'h2', 'h2 failed'));
    state = reducer(state, loginToHost.pending('b', 'h1'));
    state = reducer(state, loginToHost.fulfilled({ hostUid: 'h1', isHA: false }, 'b', 'h1'));

    expect(state.hostAuthErrors).toEqual({ h2: 'h2 failed' });
    expect(state.error).toBe('h2 failed');
  });

  it("leaves another host's failure alone when both failed with the same message", () => {
    let state = reducer(undefined, loginToHost.rejected(null, 'a', 'h1', 'No response'));
    state = reducer(state, loginToHost.rejected(null, 'b', 'h2', 'No response'));
    state = reducer(state, loginToHost.pending('c', 'h1'));

    expect(state.hostAuthErrors).toEqual({ h2: 'No response' });
    expect(state.error).toBe('No response');
  });
});
