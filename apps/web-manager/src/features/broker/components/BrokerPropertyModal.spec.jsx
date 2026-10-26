import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../brokerSlice', () => ({
  closeBrokerPropertyModal: vi.fn(() => ({ type: 'close' })),
  fetchBrokerConfig: vi.fn(() => ({ type: 'noop' })),
}));
vi.mock('../../host/hostSlice', () => ({ fetchHostEnv: vi.fn(() => ({ type: 'noop' })) }));
vi.mock('../../layout/layoutSlice', () => ({ openTab: vi.fn(tabId => ({ type: 'openTab', payload: tabId })) }));
import { closeBrokerPropertyModal } from '../brokerSlice';
import { openTab } from '../../layout/layoutSlice';
import BrokerPropertyModal from './BrokerPropertyModal';

// A trimmed-down stand-in for BROKER_PARAM_SCHEMA — just the shapes this
// modal's read-only rendering depends on: a commonOnly+required key
// (MASTER_SHM_ID, only ever shown in [broker]/common mode), an
// instanceOnly+required key (BROKER_PORT, only shown per-broker), and a
// crossField pair (MIN/MAX_NUM_APPL_SERVER).
const BROKER_PARAM_SCHEMA = [
  { key: 'MASTER_SHM_ID', category: 'common', guard: { kind: 'int', min: 1 }, default: '', commonOnly: true, required: true },
  { key: 'BROKER_PORT', category: 'common', guard: { kind: 'int', min: 1, max: 65535 }, default: '', instanceOnly: true, required: true },
  { key: 'MIN_NUM_APPL_SERVER', category: 'common', guard: { kind: 'int', min: 1 }, default: '5' },
  { key: 'MAX_NUM_APPL_SERVER', category: 'common', guard: { kind: 'int', min: 1, max: 4096 }, default: '40', crossField: { comparedToKey: 'MIN_NUM_APPL_SERVER', rule: 'gte' } },
];

let container;
let root;
function buildState({ brokerName, confdata }) {
  return {
    broker: {
      propertyModal: { isOpen: true, brokerName, hostUid: 'host' },
      brokerConfig: { host: { data: { conflist: [{ confdata }] }, loading: false } },
    },
    host: { hostEnvs: { host: { paramSchemas: { broker: BROKER_PARAM_SCHEMA } } } },
    user: { preferences: { uiLocale: 'en' } },
  };
}
async function render(state) {
  const store = configureStore({ reducer: () => state });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Provider store={store}><BrokerPropertyModal /></Provider>));
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const control = id => container.querySelector(`[data-testid="broker-property-${id}"]`);
const click = async element => act(async () => element.click());

it('per-broker mode: shows loaded values as read-only text — no inputs or selects', async () => {
  await render(buildState({
    brokerName: 'broker1',
    confdata: ['[%broker1]', 'BROKER_PORT=30000', 'MIN_NUM_APPL_SERVER=10'],
  }));
  expect(container.textContent).toContain('BROKER_PORT');
  expect(container.textContent).toContain('30000');
  expect(container.querySelector('input')).toBeNull();
  expect(container.querySelector('select')).toBeNull();
  expect(container.querySelector('[role="combobox"]')).toBeNull();
  // MASTER_SHM_ID is commonOnly — never shown in per-broker mode.
  expect(container.textContent).not.toContain('MASTER_SHM_ID');
});

it('per-broker mode: no Apply/Reset — only Cancel and Edit in Text Editor', async () => {
  await render(buildState({ brokerName: 'broker1', confdata: ['[%broker1]', 'BROKER_PORT=30000'] }));
  expect(control('open-editor-btn')).not.toBeNull();
  expect(container.textContent).not.toContain('Apply');
  expect(container.textContent).not.toContain('Reset');
});

it('Edit in Text Editor opens the broker_config tab for this host and closes the modal', async () => {
  await render(buildState({ brokerName: 'broker1', confdata: ['[%broker1]', 'BROKER_PORT=30000'] }));
  await click(control('open-editor-btn'));
  expect(openTab).toHaveBeenCalledWith('broker_config:host');
  expect(closeBrokerPropertyModal).toHaveBeenCalledTimes(1);
});

it('common mode ([broker] section): shows only commonOnly keys, read-only', async () => {
  await render(buildState({ brokerName: undefined, confdata: ['[broker]', 'MASTER_SHM_ID=1'] }));
  expect(container.textContent).toContain('MASTER_SHM_ID');
  expect(container.textContent).toContain('1');
  // BROKER_PORT is instanceOnly — never shown in common mode.
  expect(container.textContent).not.toContain('BROKER_PORT');
  expect(container.querySelector('input')).toBeNull();
  expect(container.querySelector('select')).toBeNull();
});

it('surfaces a stored crossField violation as a passive "invalid" diagnostic, not a blocked Apply', async () => {
  // MAX_NUM_APPL_SERVER (5) < MIN_NUM_APPL_SERVER (10) — already-stored violation.
  await render(buildState({
    brokerName: 'broker1',
    confdata: ['[%broker1]', 'BROKER_PORT=30000', 'MIN_NUM_APPL_SERVER=10', 'MAX_NUM_APPL_SERVER=5'],
  }));
  expect(control('guard-error-count')).not.toBeNull();
  expect(container.textContent).toContain('1 invalid');
});

it.each([
  ['broker1', 'broker1 · Broker Properties', 'Properties of the selected broker "broker1" ([%broker1] section).'],
  [null, 'Broker Common Properties', 'Properties shared by every broker on this host ([broker] section).'],
])('title/subtitle for brokerName=%s use the read-only scope wording', async (brokerName, title, subtitle) => {
  await render(buildState({ brokerName, confdata: ['[broker]', 'MASTER_SHM_ID=30001', '[%broker1]', 'BROKER_PORT=30000'] }));
  const text = document.body.textContent;
  expect(text).toContain(title);
  expect(text).toContain(subtitle);
  expect(text).not.toMatch(/Editing \[/);
});
