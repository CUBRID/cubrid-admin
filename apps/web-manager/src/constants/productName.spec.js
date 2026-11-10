import { expect, it } from 'vitest';
import { CM } from './cmLabels';
import { CM_KO } from './cmLabels.ko';

// The product is CUBRID Admin; the old desktop tool is "legacy CUBRID Admin".
// CMS's own text ("CUBRID Manager user(...)") is matched, not shown, so the
// CMS message patterns are left out.
const text = (value) => (typeof value === 'function' ? value.toString() : JSON.stringify(value));

it.each([['English', CM], ['Korean', CM_KO]])('%s labels name the product CUBRID Admin', (_, pack) => {
  const named = Object.entries(pack)
    .filter(([key]) => key !== 'cmsNotePatterns')
    .filter(([, value]) => /Next CUBRID|CUBRID Manager/.test(text(value)))
    .map(([key]) => key);
  expect(named).toEqual([]);
});
