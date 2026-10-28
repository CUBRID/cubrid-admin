import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

// The raw editors no longer validate on the client: the server does, and a
// rejected save comes back as 400 with per-line `problems`, shown through
// the status modal. These cover that path for cubrid.conf/cm.conf
// (CubridConfigEditor) and broker.conf (BrokerConfigEditor).
vi.mock('../../host/hostApi', () => ({ hostApi: { getHostConfig: vi.fn(), setHostConfig: vi.fn() } }));
vi.mock('../../broker/brokerApi', () => ({ brokerApi: { getBrokerConfig: vi.fn(), updateBrokerConfig: vi.fn() } }));
vi.mock('../../layout/layoutSlice', () => ({
  setTabDirty: payload => ({ type: 'dirty', payload }),
  showStatusModal: payload => ({ type: 'status', payload }),
}));
import { hostApi } from '../../host/hostApi';
import { brokerApi } from '../../broker/brokerApi';
import { CM } from '../../../constants/cmLabels';
import CubridConfigEditor from './CubridConfigEditor';
import BrokerConfigEditor from './BrokerConfigEditor';

const config = text => ({ conflist: [{ confdata: text.split('\n') }] });
const rejected400 = problems => ({ response: { status: 400, data: { status: 400, note: 'Invalid configuration', data: { problems } } } });

let container;
let root;
let store;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
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

const edit = async (textarea, next) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, next);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
});
const q = id => container.querySelector(`[data-testid="${id}"]`);

async function saveCmConf(next) {
  hostApi.getHostConfig.mockResolvedValue(config('[cm]\ncm_port=8001'));
  await act(async () => root.render(<Provider store={store}><CubridConfigEditor hostUid="host" confname="cmconf" /></Provider>));
  await edit(q('cubrid-config-textarea'), next);
  await act(async () => q('cubrid-config-save-btn').click());
}

it('sends cm.conf to the server without a client-side check, even when it is invalid', async () => {
  hostApi.setHostConfig.mockResolvedValue({ success: true });
  await saveCmConf('[cm]\ncm_port=70000');
  expect(hostApi.setHostConfig).toHaveBeenCalledWith('host', { confname: 'cmconf', confdata: ['[cm]', 'cm_port=70000'] });
});

it('shows the server\'s per-line reasons when it rejects the save', async () => {
  hostApi.setHostConfig.mockRejectedValue(rejected400([
    { lineNo: 2, key: 'cm_port', message: 'cm_port — Must be <= 65535' },
  ]));
  await saveCmConf('[cm]\ncm_port=70000');
  const status = store.getState().lastStatus;
  expect(status).toMatchObject({ type: 'error', title: CM.invalidConfigValues, guidance: ['Line 2: cm_port — Must be <= 65535'] });
  // Still dirty — nothing was saved.
  expect(q('cubrid-config-save-btn').disabled).toBe(false);
});

it('shows the server\'s warnings after a successful save', async () => {
  hostApi.setHostConfig.mockResolvedValue({ success: true, warnings: ['Line 3: server_long_query_time — not read by CMS; this line has no effect.'] });
  await saveCmConf('[cm]\ncm_port=8001\nserver_long_query_time=10');
  expect(store.getState().lastStatus).toMatchObject({ type: 'success', guidance: [expect.stringContaining('server_long_query_time')] });
});

it('broker.conf: success shows the restart notice followed by any server warnings', async () => {
  brokerApi.getBrokerConfig.mockResolvedValue(config('[broker]\nMASTER_SHM_ID=30001'));
  brokerApi.updateBrokerConfig.mockResolvedValue({ success: true, warnings: ['Line 1: some warning'] });
  await act(async () => root.render(<Provider store={store}><BrokerConfigEditor hostUid="host" /></Provider>));
  await edit(q('broker-config-textarea'), '[broker]\nMASTER_SHM_ID=30002');
  await act(async () => q('broker-config-save-btn').click());
  expect(store.getState().lastStatus.guidance).toEqual([CM.brokerConfigRestartRequiredNotice, 'Line 1: some warning']);
});

it('broker.conf: a server rejection shows its reasons and no restart notice', async () => {
  brokerApi.getBrokerConfig.mockResolvedValue(config('[broker]\nMASTER_SHM_ID=30001'));
  brokerApi.updateBrokerConfig.mockRejectedValue(rejected400([
    { lineNo: 4, key: 'MAX_NUM_APPL_SERVER', message: '[%query_editor] MAX_NUM_APPL_SERVER — Must be >= MIN_NUM_APPL_SERVER (currently 8)' },
  ]));
  await act(async () => root.render(<Provider store={store}><BrokerConfigEditor hostUid="host" /></Provider>));
  await edit(q('broker-config-textarea'), '[broker]\nMASTER_SHM_ID=30002');
  await act(async () => q('broker-config-save-btn').click());
  const status = store.getState().lastStatus;
  expect(status.type).toBe('error');
  expect(status.guidance).toEqual(['Line 4: [%query_editor] MAX_NUM_APPL_SERVER — Must be >= MIN_NUM_APPL_SERVER (currently 8)']);
});
