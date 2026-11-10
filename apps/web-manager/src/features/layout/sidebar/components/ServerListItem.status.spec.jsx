import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ServerListItem from './ServerListItem';
import Footer from '../../components/Footer';
import { getCM } from '../../../../constants/useCM';

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const host = { uid: 'h1', id: 'admin', alias: 'node-a', address: '10.0.0.5', port: '8001' };
const hostState = (over = {}) => ({
  hosts: [host], hostEnvs: {}, authorizedHosts: [], reconnectQueue: [], hostAuthErrors: {},
  loggingInHosts: [], selectedHostUid: 'h1', ...over,
});
const render = (ui, host, uiLocale = 'en') => act(async () => {
  const store = configureStore({ reducer: { user: () => ({ preferences: { uiLocale } }), host: () => host } });
  root.render(<Provider store={store}>{ui}</Provider>);
});
const dot = () => container.querySelector('[data-testid="host-status-dot"]');
const color = () => dot().lastElementChild.className;

const cases = [
  ['connected', hostState({ authorizedHosts: ['h1'] }), 'Connected', 'bg-emerald-500'],
  ['not logged in', hostState(), 'Not logged in', 'bg-amber-500'],
  ['logging in', hostState({ loggingInHosts: ['h1'] }), 'A host login is in progress.', 'animate-pulse'],
  ['login failed', hostState({ hostAuthErrors: { h1: 'Incorrect password' } }), 'Login failed: Incorrect password', 'bg-rose-500'],
  ['disconnected, still authorized', hostState({ authorizedHosts: ['h1'], reconnectQueue: ['h1'] }), 'Disconnected', 'bg-rose-500'],
  ['CMS not responding', hostState({ authorizedHosts: ['h1'], hostNotResponding: { h1: true } }), 'Not responding', 'bg-rose-500'],
];

describe('sidebar host dot', () => {
  it.each(cases)('%s', async (_, state, text, cls) => {
    await render(<ServerListItem host={host} isAuthorized={state.authorizedHosts.includes('h1')} onContextMenu={() => undefined} />, state);
    expect(dot().getAttribute('aria-label')).toBe(text);
    expect(dot().getAttribute('title')).toBe(text);
    expect(color()).toContain(cls);
  });

  it('stays green for a connected host whose HA role is unknown', async () => {
    const haInfo = { isHA: true, currentNodeType: 'unknown' };
    await render(<ServerListItem host={host} haInfo={haInfo} isAuthorized onContextMenu={() => undefined} />, hostState({ authorizedHosts: ['h1'] }));
    expect(color()).toContain('bg-emerald-500');
    // The orange role badge still says the role is unknown.
    expect(container.textContent).toContain(getCM('en').haUnknown);
  });

  it('blinks the host being logged in, not the selected one that is not connected', async () => {
    const state = hostState({ selectedHostUid: 'h1', hostAuthErrors: { h1: 'Incorrect password' }, loggingInHosts: ['h2'], isLoggingIntoHost: true });
    await render(<ServerListItem host={host} isAuthorized={false} onContextMenu={() => undefined} />, state);
    expect(dot().dataset.status).toBe('loginFailed');
    expect(color()).not.toContain('animate-pulse');
  });

  it('says the status in Korean', async () => {
    await render(<ServerListItem host={host} isAuthorized={false} onContextMenu={() => undefined} />, hostState(), 'ko');
    expect(dot().getAttribute('aria-label')).toBe('로그인 안 함');
  });
});

describe('footer', () => {
  it('says "Connected to" only for a connected host', async () => {
    await render(<Footer />, hostState({ authorizedHosts: ['h1'] }));
    expect(container.textContent).toContain('Connected to 10.0.0.5:8001');
  });

  it.each(cases.slice(1))('names the status instead when %s', async (_, state, text) => {
    await render(<Footer />, state);
    expect(container.textContent).not.toContain('Connected to');
    expect(container.textContent).toContain(`10.0.0.5:8001 · ${text}`);
    expect(dot().getAttribute('aria-label')).toBe(text);
  });
});
