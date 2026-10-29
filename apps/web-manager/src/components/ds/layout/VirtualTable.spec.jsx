import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualTable } from './VirtualTable';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const columns = [
  { header: 'OID', accessor: 'oid', width: '140px' },
  { header: 'Holders', accessor: 'holders', render: (value) => value.join(', ') },
];

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

describe('VirtualTable', () => {
  it('puts only the rows in view in the DOM', async () => {
    const data = Array.from({ length: 10000 }, (_, i) => ({ oid: `0|600|${i}`, holders: ['1: X_LOCK'] }));
    await act(async () => root.render(<VirtualTable columns={columns} data={data} testId="vt" />));

    const rows = container.querySelectorAll('[role="listitem"]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(100);
    expect(rows[0].textContent).toBe('0|600|01: X_LOCK');
    expect(rows[0].getAttribute('aria-setsize')).toBe('10000');
  });

  it('shows the empty message without rows', async () => {
    await act(async () => root.render(<VirtualTable columns={columns} data={[]} emptyMessage="No locks" />));
    expect(container.textContent).toContain('No locks');
    expect(container.querySelector('[role="listitem"]')).toBeNull();
  });
});
