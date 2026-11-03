import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoadDatabaseModal from './LoadDatabaseModal';
import { CM } from '../../../constants/cmLabels';

const mocks = vi.hoisted(() => ({ submitLoad: vi.fn(), getUnloadInfo: vi.fn() }));
vi.mock('../../../api/apiClient', () => ({ default: { defaults: { headers: { common: {} } } } }));
vi.mock('../databaseApi', () => ({ databaseApi: { getUnloadInfo: mocks.getUnloadInfo } }));
vi.mock('../databaseJobApi', () => ({ databaseJobApi: { submitLoad: mocks.submitLoad } }));
vi.mock('../../../infrastructure/hooks/useCmsJob', () => ({
  useCmsJob: () => ({ runJob: submit => submit(), background: () => {}, wasBackgrounded: () => false }),
}));

let root, container;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  mocks.getUnloadInfo.mockResolvedValue({ database: [{ dbname: 'testdb', object: '/server/dump_objects;2026-10-29' }] });
  mocks.submitLoad.mockResolvedValue({ result: {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
const click = element => act(async () => element.click());
const field = name => container.querySelector(`input[aria-label="${CM[name]}"]`);
const checkbox = name => [...container.querySelectorAll('label')]
  .find(label => label.textContent.trim() === CM[name])?.querySelector('input[type="checkbox"]');
const type = (element, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
});
const render = async () => {
  const fixed = {
    user: { preferences: { uiLocale: 'en' } },
    host: { selectedHostUid: 'host-1' },
    databaseUI: { isLoadDatabaseModalOpen: true },
    database: { selectedDatabase: 'testdb', activeDatabasesByHost: {}, loggedInDatabases: ['host-1:testdb'] },
  };
  const store = configureStore({ reducer: Object.fromEntries(Object.entries(fixed).map(([key, value]) => [key, () => value])) });
  await act(async () => root.render(<Provider store={store}><LoadDatabaseModal /></Provider>));
  await click(container.querySelector('tbody input[type="checkbox"]'));
};
const runButton = () => container.querySelector('[data-testid="load-database-run-btn"]');

describe('load count limits', () => {
  it('sets integer input constraints without duplicate range hints', async () => {
    await render();
    for (const name of ['estimatedInstances', 'insertionCountPeriodicCommit']) {
      expect(field(name).min).toBe('1');
      expect(field(name).max).toBe('2147483647');
      expect(field(name).step).toBe('1');
    }
    expect(container.textContent).not.toContain(CM.loadCountRange(1, 2147483647));
  });

  it.each(['estimatedInstances', 'insertionCountPeriodicCommit'])('rejects overflow and invalid values for %s', async name => {
    await render();
    if (name === 'estimatedInstances') await click(checkbox(name));
    for (const value of ['2147483648', '0', '-1', '1.5', '1e3']) {
      await type(field(name), value);
      expect(runButton().disabled).toBe(true);
      expect(container.textContent.split(CM.loadCountRange(1, 2147483647))).toHaveLength(2);
      await click(runButton());
      await act(async () => field(name).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
      expect(mocks.submitLoad).not.toHaveBeenCalled();
    }
  });

  it.each(['1', '2147483647'])('submits the boundary value %s unchanged', async value => {
    await render();
    await click(checkbox('estimatedInstances'));
    await type(field('estimatedInstances'), value);
    await type(field('insertionCountPeriodicCommit'), value);
    expect(runButton().disabled).toBe(false);
    await click(runButton());
    expect(mocks.submitLoad).toHaveBeenCalledWith('host-1', 'testdb', expect.objectContaining({ estimated: value, period: value }));
  });

  it('ignores disabled count fields and sends none', async () => {
    await render();
    await click(checkbox('estimatedInstances'));
    await type(field('estimatedInstances'), '2147483648');
    await type(field('insertionCountPeriodicCommit'), '2147483648');
    expect(runButton().disabled).toBe(true);
    await click(checkbox('estimatedInstances'));
    await click(checkbox('insertionCountPeriodicCommit'));
    expect(runButton().disabled).toBe(false);
    await click(runButton());
    expect(mocks.submitLoad).toHaveBeenCalledWith('host-1', 'testdb', expect.objectContaining({ estimated: 'none', period: 'none' }));
  });
});
