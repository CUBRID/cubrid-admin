import axios from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The app session expiry path logs out through the store; stand-ins here.
const dispatched = vi.hoisted(() => []);
vi.mock('../app/store', () => ({ store: { dispatch: (a) => dispatched.push(a) } }));
vi.mock('../features/auth/authSlice', () => ({ logout: () => ({ type: 'auth/logout' }) }));

import apiClient, { ACCESS_TOKEN_REFRESH_TIMEOUT_MS } from './apiClient';

// Every app API call answers 401 (an expired access JWT), as after a night
// left open.
const expired = (config) => Promise.reject(Object.assign(new Error('401'), {
  config,
  response: { status: 401, data: { type: '/errors/auth/invalid_token', code: 'INVALID_TOKEN' }, headers: {}, config },
}));

let postSpy;
beforeEach(() => {
  dispatched.length = 0;
  localStorage.setItem('token', 'old');
  localStorage.setItem('refreshToken', 'r1');
  apiClient.defaults.adapter = expired;
  postSpy = vi.spyOn(axios, 'post');
});
afterEach(() => {
  postSpy.mockRestore();
  localStorage.clear();
});

it('gives the token refresh a time limit', async () => {
  postSpy.mockRejectedValue(new Error('timeout of 15000ms exceeded'));
  await apiClient.get('/user').catch(() => undefined);

  expect(postSpy).toHaveBeenCalledWith(
    expect.stringMatching(/\/auth\/refresh$/),
    { refreshToken: 'r1' },
    expect.objectContaining({ timeout: ACCESS_TOKEN_REFRESH_TIMEOUT_MS }),
  );
  expect(ACCESS_TOKEN_REFRESH_TIMEOUT_MS).toBe(15000);
});

it('releases the requests waiting on a refresh that fails, and the next 401 refreshes again', async () => {
  // The refresh ends the way axios ends one past its time limit.
  let failRefresh;
  postSpy.mockReturnValueOnce(new Promise((_, reject) => { failRefresh = reject; }));
  const first = apiClient.get('/a').catch((e) => e);
  const waiting = apiClient.get('/b').catch((e) => e);
  await vi.waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1));

  failRefresh(new Error(`timeout of ${ACCESS_TOKEN_REFRESH_TIMEOUT_MS}ms exceeded`));
  await expect(first).resolves.toBeInstanceOf(Error);
  await expect(waiting).resolves.toBeInstanceOf(Error);
  expect(dispatched.map((a) => a.type)).toContain('auth/logout');

  // Nothing is left stuck: a later 401 starts a new refresh.
  localStorage.setItem('refreshToken', 'r2');
  postSpy.mockResolvedValueOnce({ data: { data: { token: 'new', refreshToken: 'r3' } } });
  await apiClient.get('/c').catch(() => undefined);
  expect(postSpy).toHaveBeenCalledTimes(2);
});
