import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../../host/hostApi', () => ({ hostApi: { getHostConfig: vi.fn(), setHostConfig: vi.fn() } }));
vi.mock('../../layout/layoutSlice', () => ({
  setTabDirty: payload => ({ type: 'dirty', payload }),
  showStatusModal: payload => ({ type: 'status', payload }),
}));
import { hostApi } from '../../host/hostApi';
import CubridConfigEditor from './CubridConfigEditor';

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
const config = text => ({ conflist: [{ confdata: text.split('\n') }] });
let container;
let root;
let store;
let state;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  state = {
    host: { hosts: [], hostEnvs: {} },
    layout: { refreshCounter: 0, refreshTabId: null },
    user: { preferences: { uiLocale: 'en' } },
  };
  store = configureStore({
    reducer: (current = state, action) => {
      if (action.type !== 'test/refresh') return current;
      return {
        ...current,
        layout: {
          refreshCounter: current.layout.refreshCounter + 1,
          refreshTabId: action.payload,
        },
      };
    },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
const render = async (hostUid = 'host') => act(async () => {
  root.render(<StrictMode><Provider store={store}><CubridConfigEditor hostUid={hostUid} confname="cubridconf" /></Provider></StrictMode>);
});
const element = id => container.querySelector(`[data-testid="cubrid-config-${id}"]`);

it('coalesces StrictMode loads, waits for content, and undo restores the loaded configuration', async () => {
  const read = deferred();
  hostApi.getHostConfig.mockReturnValue(read.promise);
  await render();
  expect(hostApi.getHostConfig).toHaveBeenCalledTimes(1);
  expect(element('textarea').readOnly).toBe(true);
  expect(element('refresh-btn').disabled).toBe(true);
  const original = '[service]\nserver=demodb';
  await act(async () => read.resolve(config(original)));
  expect(element('textarea').readOnly).toBe(false);
  expect(element('textarea').value).toBe(original);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(element('textarea'), `${original}\n# edit`);
    element('textarea').dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(element('save-btn').disabled).toBe(false);
  await act(async () => element('undo-btn').click());
  expect(element('textarea').value).toBe(original);
  expect(element('save-btn').disabled).toBe(true);
  expect(hostApi.setHostConfig).not.toHaveBeenCalled();
});

it('does not make an invalid response editable and allows a fresh read on retry', async () => {
  hostApi.getHostConfig.mockResolvedValueOnce({}).mockResolvedValue(config('[service]'));
  await render();
  expect(element('textarea').readOnly).toBe(true);
  expect(element('refresh-btn').disabled).toBe(false);
  await act(async () => element('refresh-btn').click());
  expect(hostApi.getHostConfig).toHaveBeenCalledTimes(2);
  expect(element('textarea').readOnly).toBe(false);
});

it('ignores an old host response after the editor target changes', async () => {
  const old = deferred();
  hostApi.getHostConfig.mockReturnValueOnce(old.promise).mockResolvedValue(config('server=newhost'));
  await render();
  await render('newhost');
  expect(element('textarea').value).toBe('server=newhost');
  await act(async () => old.resolve(config('server=oldhost')));
  expect(element('textarea').value).toBe('server=newhost');
});

it('reloads when the global refresh targets this config tab', async () => {
  hostApi.getHostConfig.mockResolvedValue(config('server=demodb'));
  await render();
  expect(hostApi.getHostConfig).toHaveBeenCalledTimes(1);

  await act(async () => store.dispatch({
    type: 'test/refresh',
    payload: 'edit_config:host:cubridconf',
  }));

  expect(hostApi.getHostConfig).toHaveBeenCalledTimes(2);
});
