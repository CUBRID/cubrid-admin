import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
// CodeMirror needs layout jsdom lacks; these tests are about loading and
// saving, so the editor is a plain textarea with the same test id.
vi.mock('../confEditor/ConfEditor', () => ({
  default: ({ value, onChange, readOnly, testId }) => (
    <textarea data-testid={testId} value={value} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../../../infrastructure/hooks/useConfirm', () => ({ useConfirm: () => confirmMock }));
vi.mock('../../broker/brokerApi', () => ({
  brokerApi: { getBrokerConfig: vi.fn(), updateBrokerConfig: vi.fn() },
}));
vi.mock('../../layout/layoutSlice', () => ({
  setTabDirty: (payload) => ({ type: 'dirty', payload }),
  showStatusModal: (payload) => ({ type: 'status', payload }),
}));
import { brokerApi } from '../../broker/brokerApi';
import { CM } from '../../../constants/cmLabels';
import BrokerConfigEditor from './BrokerConfigEditor';

const config = (text) => ({ conflist: [{ confdata: text.split('\n') }] });

let container;
let root;
let store;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  confirmMock.mockResolvedValue(true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  store = configureStore({
    reducer: (current = {
      host: { hosts: [] },
      layout: { refreshCounter: 0, refreshTabId: null },
      user: { preferences: { uiLocale: 'en' } },
      lastStatus: null,
    }, action) => (action.type === 'status' ? { ...current, lastStatus: action.payload } : current),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = async () => {
  await act(async () => {
    root.render(<Provider store={store}><BrokerConfigEditor hostUid="host" /></Provider>);
  });
  // The editor is a lazy chunk.
  await act(async () => { await vi.dynamicImportSettled(); });
};
const element = (id) => container.querySelector(`[data-testid="broker-config-${id}"]`);

// A plain `.value =` bypasses React's change handling, so Save would stay disabled.
const editTextarea = (next) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(element('textarea'), next);
  element('textarea').dispatchEvent(new Event('input', { bubbles: true }));
};

async function editAndSave() {
  brokerApi.getBrokerConfig.mockResolvedValue(config('[broker]\nMASTER_SHM_ID=30001'));
  await render();
  await act(async () => editTextarea('[broker]\nMASTER_SHM_ID=30002'));
  await act(async () => element('save-btn').click());
}

it('says the broker must be restarted before saving, not again after', async () => {
  brokerApi.updateBrokerConfig.mockResolvedValue({});
  await editAndSave();

  expect(brokerApi.updateBrokerConfig).toHaveBeenCalledWith('host', ['[broker]', 'MASTER_SHM_ID=30002'], ['[broker]', 'MASTER_SHM_ID=30001']);
  const status = store.getState().lastStatus;
  expect(status.type).toBe('success');
  expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ description: CM.brokerConfigSaveConfirmDesc }));
  expect(status.guidance).toBeUndefined();
});

it('does not mention a restart when the save fails', async () => {
  brokerApi.updateBrokerConfig.mockRejectedValue({ response: { status: 500, data: { note: 'boom' } } });
  await editAndSave();

  const status = store.getState().lastStatus;
  expect(status.type).toBe('error');
  expect(status.guidance).not.toContain(CM.brokerConfigRestartRequiredNotice);
});
