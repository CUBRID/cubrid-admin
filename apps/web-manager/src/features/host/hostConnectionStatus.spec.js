import { describe, expect, it } from 'vitest';
import {
  HOST_CONNECTED, HOST_DISCONNECTED, HOST_LOGGING_IN, HOST_LOGIN_FAILED, HOST_NOT_LOGGED_IN, HOST_NOT_RESPONDING,
  hostConnectionStatus, hostConnectionStatusText,
} from './hostConnectionStatus';
import { getCM } from '../../constants/useCM';

const base = { authorizedHosts: [], reconnectQueue: [], hostAuthErrors: {}, isLoggingIntoHost: false, selectedHostUid: null };

describe('hostConnectionStatus', () => {
  it('is connected for a logged-in host', () => {
    expect(hostConnectionStatus('h1', { ...base, authorizedHosts: ['h1'] })).toBe(HOST_CONNECTED);
  });

  it('is disconnected while waiting to reconnect, though still in authorizedHosts', () => {
    expect(hostConnectionStatus('h1', { ...base, authorizedHosts: ['h1'], reconnectQueue: ['h1'] })).toBe(HOST_DISCONNECTED);
  });

  it('is not responding for a connected host whose CMS did not answer, but disconnected once in the reconnect window', () => {
    expect(hostConnectionStatus('h1', { ...base, authorizedHosts: ['h1'], hostNotResponding: { h1: true } })).toBe(HOST_NOT_RESPONDING);
    expect(hostConnectionStatus('h1', { ...base, authorizedHosts: ['h1'], hostNotResponding: { h1: true }, reconnectQueue: ['h1'] })).toBe(HOST_DISCONNECTED);
    expect(hostConnectionStatus('h1', { ...base, hostNotResponding: { h1: true } })).toBe(HOST_NOT_LOGGED_IN);
  });

  it('is logging in only for the selected host while a login runs', () => {
    const state = { ...base, isLoggingIntoHost: true, selectedHostUid: 'h1' };
    expect(hostConnectionStatus('h1', state)).toBe(HOST_LOGGING_IN);
    expect(hostConnectionStatus('h2', state)).toBe(HOST_NOT_LOGGED_IN);
  });

  it('is login failed when the last login left an error', () => {
    expect(hostConnectionStatus('h1', { ...base, hostAuthErrors: { h1: 'Incorrect password' } })).toBe(HOST_LOGIN_FAILED);
  });

  it('is not logged in otherwise, and for a missing slice', () => {
    expect(hostConnectionStatus('h1', base)).toBe(HOST_NOT_LOGGED_IN);
    expect(hostConnectionStatus('h1', {})).toBe(HOST_NOT_LOGGED_IN);
    expect(hostConnectionStatus(null, base)).toBe(HOST_NOT_LOGGED_IN);
  });
});

describe('hostConnectionStatusText', () => {
  const state = { ...base, hostAuthErrors: { h1: 'Incorrect password' } };
  it('says each status in English and Korean', () => {
    const EN = getCM('en');
    const KO = getCM('ko');
    expect(hostConnectionStatusText(HOST_CONNECTED, 'h1', state, EN)).toBe('Connected');
    expect(hostConnectionStatusText(HOST_NOT_LOGGED_IN, 'h1', state, EN)).toBe('Not logged in');
    expect(hostConnectionStatusText(HOST_LOGIN_FAILED, 'h1', state, EN)).toBe('Login failed: Incorrect password');
    expect(hostConnectionStatusText(HOST_DISCONNECTED, 'h1', state, EN)).toBe('Disconnected');
    expect(hostConnectionStatusText(HOST_LOGGING_IN, 'h1', state, EN)).toBe(EN.hostLoginInProgressHint);
    expect(hostConnectionStatusText(HOST_CONNECTED, 'h1', state, KO)).toBe('연결됨');
    expect(hostConnectionStatusText(HOST_NOT_LOGGED_IN, 'h1', state, KO)).toBe('로그인 안 함');
    expect(hostConnectionStatusText(HOST_LOGIN_FAILED, 'h1', state, KO)).toBe('로그인 실패: Incorrect password');
    expect(hostConnectionStatusText(HOST_DISCONNECTED, 'h1', state, KO)).toBe('연결 끊김');
    expect(hostConnectionStatusText(HOST_NOT_RESPONDING, 'h1', state, EN)).toBe('Not responding');
    expect(hostConnectionStatusText(HOST_NOT_RESPONDING, 'h1', state, KO)).toBe('응답 없음');
  });
});
