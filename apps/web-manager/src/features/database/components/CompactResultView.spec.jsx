import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import CompactResultView from './CompactResultView';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const store = configureStore({ reducer: { user: () => ({ preferences: { uiLocale: 'ko' } }) } });
const log = [{
  line: [
    'Pass 1', 'Class dba.t1', 'Total objects: 120', 'Failed objects: 0', 'Modified objects: 3', 'Big objects: 0',
    'Class dba.t2', 'Total objects: 8', 'Failed objects: 2', 'Modified objects: 0', 'Big objects: 1',
    'Pass 2', 'Class dba.t1', 'Reclaiming of OIDs and pages skipped.',
    'Pass 3', 'Class dba.t1', 'Heap compact succeeded...',
  ],
}];

let container;
let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});

const render = (props) => act(async () => {
  root.render(<Provider store={store}><CompactResultView {...props} /></Provider>);
});
const q = (id) => container.querySelector(`[data-testid="${id}"]`);
const rows = () => [...container.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.replace('error', '').trim()));

describe('CompactResultView', () => {
  it('shows pass 1 counts per class and points out classes with failed objects', async () => {
    await render({ log });
    expect(rows()).toEqual([['dba.t1', '120', '0', '3', '0'], ['dba.t2', '8', '2', '0', '1']]);
    expect(q('compact-result-failed').textContent).toContain('처리하지 못한 객체가 있는 클래스가 1개 있습니다.');
    expect(container.querySelectorAll('tbody tr')[1].querySelector('.text-rose-600')).not.toBeNull();
  });

  it('gives each class result of passes 2 and 3 in the UI language', async () => {
    await render({ log });
    await act(async () => q('compact-result-pass-2').click());
    expect(rows()).toEqual([['dba.t1', 'OID와 페이지 회수를 건너뛰었습니다.']]);
    await act(async () => q('compact-result-pass-3').click());
    expect(rows()).toEqual([['dba.t1', '힙 공간 정리에 성공했습니다.']]);
  });

  it('keeps the raw output one click away, and shows it when nothing could be read', async () => {
    await render({ log });
    expect(q('compact-result-raw')).toBeNull();
    await act(async () => q('compact-result-raw-toggle').click());
    expect(q('compact-result-raw').textContent).toContain('Heap compact succeeded...');

    await render({ log: [{ line: ['Some other output'] }] });
    expect(q('compact-result-raw').textContent).toBe('Some other output');
  });

  it('shows nothing for an empty log', async () => {
    await render({ log: null });
    expect(q('compact-result')).toBeNull();
  });
});
