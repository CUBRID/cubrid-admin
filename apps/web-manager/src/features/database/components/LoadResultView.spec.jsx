import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import LoadResultView from './LoadResultView';
import { LOAD_DATA_ERROR, LOAD_OK, SYNTAX_CHECK } from '../__fixtures__/loaddbOutput';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

const render = (log, uiLocale = 'ko') => act(async () => {
  const store = configureStore({ reducer: { user: () => ({ preferences: { uiLocale } }) } });
  root.render(<Provider store={store}><LoadResultView log={log} /></Provider>);
});
const q = (id) => container.querySelector(`[data-testid="${id}"]`);
const rows = () => [...container.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()));

describe('LoadResultView (real loaddb output)', () => {
  it('shows the inserted and failed counts of a load that went through', async () => {
    await render(LOAD_OK);
    expect(q('load-result-summary-inserted').textContent).toBe('삽입5');
    expect(q('load-result-summary-failed').className).not.toContain('rose');
    expect(container.querySelector('table')).toBeNull();
  });

  it('lists the failed input lines in Korean and marks them', async () => {
    await render(LOAD_DATA_ERROR);
    expect(q('load-result-summary-lines').textContent).toBe('문제가 있는 줄1');
    expect(q('load-result-summary-lines').className).toContain('rose');
    expect(rows()).toEqual([
      ['4', '"character varying" 형식에 담을 수 있는 크기를 넘는 값입니다.'],
      ['4', "'dba.t_load'의 속성 'b'에 넣을 'toolongvalue'을(를) 'character varying' 값으로 읽지 못했습니다."],
    ]);
  });

  it('keeps the engine sentences in English for the English UI', async () => {
    await render(SYNTAX_CHECK, 'en');
    expect(rows()).toEqual([['5', 'No class named t_nosuch, ignoring tuples'], ['6', 'Unknown class "dba.t_nosuch".']]);
  });

  it('opens the raw output when nothing in it could be read', async () => {
    await render(['', 'something else']);
    expect(q('load-result-raw').textContent).toBe('something else');
    expect(q('load-result-raw-toggle')).toBeNull();
  });
});
