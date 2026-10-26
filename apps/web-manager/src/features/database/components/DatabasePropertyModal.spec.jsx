import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../../host/hostApi', () => ({ hostApi: { getHostConfig: vi.fn(), setHostConfig: vi.fn() } }));
vi.mock('../../broker/brokerApi', () => ({ brokerApi: { getBrokerList: vi.fn() } }));
vi.mock('../databaseSlice', () => ({ closeDatabasePropertyModal: () => ({ type: 'close' }) }));
import { hostApi } from '../../host/hostApi';
import { brokerApi } from '../../broker/brokerApi';
import { ToastProvider } from '../../../infrastructure/context/ToastContext';
import DatabasePropertyModal from './DatabasePropertyModal';

let container;
let root;
let dispatch;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  hostApi.getHostConfig.mockResolvedValue({ conflist: [{ confdata: [
    '[common]', 'max_clients=123', 'data_buffer_size=512M',
    'sort_buffer_pages=16', 'log_buffer_size=4G',
  ] }] });
  brokerApi.getBrokerList.mockResolvedValue({ result: [] });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const state = {
    databaseUI: { isDatabasePropertyModalOpen: true },
    database: { selectedDatabase: 'demodb' },
    host: { selectedHostUid: 'host', authorizedHosts: ['host'] },
    user: { preferences: { uiLocale: 'en' } },
  };
  const store = configureStore({ reducer: () => state });
  dispatch = vi.spyOn(store, 'dispatch');
  await act(async () => root.render(
    <Provider store={store}><ToastProvider><DatabasePropertyModal /></ToastProvider></Provider>
  ));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const control = id => container.querySelector(`[data-testid="database-property-${id}"]`);
const radio = (type, mode) => container.querySelector(`input[name="${type}-buffer-mode"][value="${mode}"]`);
const input = (type, mode) => radio(type, mode).closest('label').parentElement.querySelector('input[type="number"]');
const unitControl = type => radio(type, 'size').closest('label').parentElement.querySelector('[role="combobox"]');
const click = async element => act(async () => element.click());
const fill = async (element, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
});
async function selectUnit(type, unit) {
  await click(unitControl(type));
  await act(async () => {
    const option = Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent === unit);
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
}

it('detects buffer unit edits and clears the change when the unit is restored', async () => {
  expect(input('data', 'size').value).toBe('512');
  expect(control('modified-count')).toBeNull();
  expect(control('apply-btn').disabled).toBe(true);
  await selectUnit('data', 'GB');
  expect(control('modified-count').textContent).toBe('1 modified');
  expect(control('apply-btn').disabled).toBe(false);
  await selectUnit('data', 'MB');
  expect(control('modified-count')).toBeNull();
  expect(control('apply-btn').disabled).toBe(true);
});

it('detects mode changes followed by value entry and clears them on reversion', async () => {
  await click(radio('data', 'pages'));
  await fill(input('data', 'pages'), '25000');
  expect(control('modified-count')).not.toBeNull();
  expect(control('apply-btn').disabled).toBe(false);
  await click(radio('data', 'size'));
  expect(control('modified-count')).toBeNull();
  expect(control('apply-btn').disabled).toBe(true);
});

it('Apply stays on the form view and re-baselines modified/reset state to the applied values', async () => {
  hostApi.setHostConfig.mockResolvedValue({});
  await selectUnit('data', 'GB');
  expect(control('modified-count').textContent).toBe('1 modified');
  await click(control('apply-btn'));

  // Modal stays open on the form view (no success screen), the backend call
  // fired with the reconciled config, and a success toast was shown.
  expect(hostApi.setHostConfig).toHaveBeenCalledTimes(1);
  expect(control('apply-btn')).not.toBeNull();
  expect(container.textContent).toContain('demodb configuration was saved.');

  // The just-applied values are now the baseline: modified count clears and
  // Apply disables again, even though nothing was reverted.
  expect(control('modified-count')).toBeNull();
  expect(control('apply-btn').disabled).toBe(true);

  // A subsequent edit+Reset targets the newly-applied baseline (GB), not the
  // original pre-session one (MB) fetched at mount.
  await selectUnit('data', 'TB');
  expect(control('modified-count').textContent).toBe('1 modified');
  await click(control('reset-btn'));
  expect(unitControl('data').textContent).toContain('GB');
  expect(control('modified-count')).toBeNull();
});

it('Reset restores loaded values, modes, and units across buffer groups', async () => {
  await fill(input('data', 'size'), '1024');
  await selectUnit('data', 'GB');
  await click(radio('sort', 'size'));
  await fill(input('sort', 'size'), '2');
  await selectUnit('log', 'MB');
  await click(control('reset-btn'));
  expect(input('data', 'size').value).toBe('512');
  expect(radio('data', 'size').checked).toBe(true);
  expect(unitControl('data').textContent).toContain('MB');
  expect(input('sort', 'pages').value).toBe('16');
  expect(radio('sort', 'pages').checked).toBe(true);
  expect(input('sort', 'size').value).toBe('');
  expect(input('log', 'size').value).toBe('4');
  expect(unitControl('log').textContent).toContain('GB');
  expect(control('modified-count')).toBeNull();
  expect(control('apply-btn').disabled).toBe(true);
  expect(hostApi.setHostConfig).not.toHaveBeenCalled();
});

const discardControl = id => container.querySelector(`[data-testid="database-property-discard-${id}"]`);
const escape = async () => act(async () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});

it.each(['modal-close', 'cancel-btn'])('closes unchanged properties through %s without confirmation', async trigger => {
  await click(control(trigger));
  expect(discardControl('modal')).toBeNull();
  expect(dispatch).toHaveBeenCalledWith({ type: 'close' });
});

it.each(['modal-close', 'cancel-btn'])('protects edits through %s and only closes after discard', async trigger => {
  await fill(input('data', 'size'), '1024');
  await click(control(trigger));
  expect(discardControl('modal').textContent).toContain('Discard changes?');
  expect(dispatch).not.toHaveBeenCalled();
  await click(discardControl('cancel-btn'));
  expect(discardControl('modal')).toBeNull();
  expect(input('data', 'size').value).toBe('1024');
  expect(control('modified-count').textContent).toBe('1 modified');
  await click(control(trigger));
  await click(discardControl('confirm-btn'));
  expect(dispatch).toHaveBeenCalledWith({ type: 'close' });
  expect(hostApi.setHostConfig).not.toHaveBeenCalled();
});

it('Escape prompts for edits and dismissing the prompt preserves them', async () => {
  await selectUnit('data', 'GB');
  await escape();
  expect(discardControl('modal')).not.toBeNull();
  await escape();
  expect(discardControl('modal')).toBeNull();
  expect(dispatch).not.toHaveBeenCalled();
  expect(unitControl('data').textContent).toContain('GB');
  await escape();
  await click(discardControl('modal-close'));
  expect(dispatch).not.toHaveBeenCalled();
  expect(control('modified-count').textContent).toBe('1 modified');
});

it.each(['revert', 'reset', 'apply'])('closes without prompting after %s clears unsaved changes', async action => {
  await selectUnit('data', 'GB');
  if (action === 'revert') await selectUnit('data', 'MB');
  if (action === 'reset') await click(control('reset-btn'));
  if (action === 'apply') {
    hostApi.setHostConfig.mockResolvedValue({});
    await click(control('apply-btn'));
  }
  await click(control('cancel-btn'));
  expect(discardControl('modal')).toBeNull();
  expect(dispatch).toHaveBeenCalledWith({ type: 'close' });
});

it('still protects parameter edits when Connection Information is selected', async () => {
  await fill(input('data', 'size'), '1024');
  await click(Array.from(container.querySelectorAll('button')).find(el => el.textContent.includes('Connection')));
  await click(control('cancel-btn'));
  expect(discardControl('modal')).not.toBeNull();
  await click(discardControl('cancel-btn'));
  await click(control('apply-btn'));
  expect(discardControl('modal')).not.toBeNull();
  expect(dispatch).not.toHaveBeenCalled();
});

it('protects edits made in Advanced Settings after switching back to General', async () => {
  await click(Array.from(container.querySelectorAll('button')).find(el => el.textContent.includes('Advanced Settings')));
  const field = Array.from(container.querySelectorAll('tr')).find(el => el.textContent.includes('async_commit')).querySelector('[role="combobox"]');
  await click(field);
  await act(async () => {
    const option = Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent === 'YES');
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await click(Array.from(container.querySelectorAll('button')).find(el => el.textContent.includes('General')));
  await click(control('cancel-btn'));
  expect(discardControl('modal')).not.toBeNull();
  expect(dispatch).not.toHaveBeenCalled();
});
