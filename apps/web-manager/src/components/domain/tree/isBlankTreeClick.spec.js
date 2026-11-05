import { expect, it } from 'vitest';
import { isBlankTreeClick } from './isBlankTreeClick';

it('tells a click on blank tree space from one on a row or a control', () => {
  const panel = document.createElement('div');
  panel.innerHTML = `
    <div id="pad"><details data-testid="tree-node-db1"><summary><span id="label">db1</span></summary></details></div>
    <div data-testid="host-item-h1"><span id="host">h1</span></div>
    <button id="btn"><span id="icon">x</span></button>`;
  const click = (target) => ({ target });
  expect(isBlankTreeClick(click(panel))).toBe(true);
  expect(isBlankTreeClick(click(panel.querySelector('#pad')))).toBe(true);
  expect(isBlankTreeClick(click(panel.querySelector('#label')))).toBe(false);
  expect(isBlankTreeClick(click(panel.querySelector('#host')))).toBe(false);
  expect(isBlankTreeClick(click(panel.querySelector('#icon')))).toBe(false);
});
