import { expect, it, vi } from 'vitest';
vi.mock('../features/host/hostSlice', () => ({ setSelectedHost: (payload) => ({ type: 'host/setSelectedHost', payload }) }));
vi.mock('../features/layout/layoutSlice', () => ({ setActiveMainTab: (payload) => ({ type: 'layout/setActiveMainTab', payload }) }));
import { chooseTab, hostUidOfTab } from './tabSelection';

it('chooses the host of the tab already shown when it is clicked again, so the host list highlights it', () => {
  const dispatch = vi.fn();
  chooseTab(dispatch, 'host:a', 'host:a');
  expect(dispatch.mock.calls.map(([action]) => [action.type, action.payload])).toEqual([
    ['host/setSelectedHost', 'a'],
    ['layout/setActiveMainTab', 'host:a'],
  ]);

  // Another tab: App's effect selects its host once it is active.
  dispatch.mockClear();
  chooseTab(dispatch, 'host:b', 'host:a');
  expect(dispatch.mock.calls.map(([action]) => action.type)).toEqual(['layout/setActiveMainTab']);

  expect(hostUidOfTab('db:a:demodb')).toBe('a');
  expect(hostUidOfTab('service_dashboard')).toBeNull();
});
