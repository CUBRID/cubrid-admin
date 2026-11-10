import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Radio, RadioGroup } from './Radio';

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const options = [
  { value: 'all', label: 'All' },
  { value: 'selected', label: 'Selected' },
  { value: 'none', label: 'None', disabled: true },
];

function Group({ onChange }) {
  const [value, setValue] = useState('all');
  return <RadioGroup name="scope" options={options} value={value} onChange={(v) => { setValue(v); onChange?.(v); }} />;
}

const radios = () => [...container.querySelectorAll('input[type="radio"]')];
const textOf = (label) => [...container.querySelectorAll('label:has(input) > :last-child')].find((el) => el.textContent === label);

describe('Radio', () => {
  it('selects when its text is clicked, not only its circle', async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<Group onChange={onChange} />));
    await act(async () => textOf('Selected').click());
    expect(onChange).toHaveBeenCalledWith('selected');
    expect(radios().map((r) => r.checked)).toEqual([false, true, false]);
  });

  it('has no label inside its label', async () => {
    await act(async () => root.render(<Group />));
    expect(container.querySelector('label label')).toBeNull();
  });

  it('names each radio by its text and keeps one group for the arrow keys', async () => {
    await act(async () => root.render(<Group />));
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull();
    // A wrapping <label> gives the input its accessible name.
    expect(radios().map((r) => r.closest('label')?.textContent)).toEqual(['All', 'Selected', 'None']);
    // Browsers move between radios of one name with the arrow keys.
    expect(new Set(radios().map((r) => r.name))).toEqual(new Set(['scope']));
    expect(radios().map((r) => r.tabIndex)).toEqual([0, 0, 0]);
  });

  it('does not select a disabled radio from its text', async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<Group onChange={onChange} />));
    await act(async () => textOf('None').click());
    expect(onChange).not.toHaveBeenCalled();
    expect(radios()[2].disabled).toBe(true);
    expect(radios()[2].checked).toBe(false);
  });

  it('calls onChange once for a stand-alone Radio clicked on its text', async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<Radio name="src" value={1} label="From list" onChange={onChange} />));
    await act(async () => textOf('From list').click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('1');
  });
});
