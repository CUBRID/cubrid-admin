import { expect, it } from 'vitest';
import { DEFAULT_CMS_USER_SORT, nextCmsUserSort, sortCmsUserRows, toCmsUserRow } from './cmsUserRows';

const rows = [
  { '@id': 'user_b', dbcreate: 'admin', casauth: 'none', statusmonitorauth: 'monitor' },
  { '@id': 'User_c', dbcreate: 'none', casauth: 'admin', statusmonitorauth: 'admin' },
  { '@id': 'user_a', dbcreate: 'none', casauth: 'monitor', statusmonitorauth: 'none' },
].map(toCmsUserRow);
const names = (list) => list.map((r) => r.name);

it('starts by user ID ascending, comparing the text as is (CA String.compareTo)', () => {
  expect(names(sortCmsUserRows(rows, DEFAULT_CMS_USER_SORT))).toEqual(['User_c', 'user_a', 'user_b']);
});

it('sorts by a clicked column ascending, a second click flips it, ties keep the order CMS sent', () => {
  const byDb = nextCmsUserSort(DEFAULT_CMS_USER_SORT, 'dbcreate');
  expect(byDb).toEqual({ key: 'dbcreate', direction: 'asc' });
  expect(names(sortCmsUserRows(rows, byDb))).toEqual(['user_b', 'User_c', 'user_a']);
  const flipped = nextCmsUserSort(byDb, 'dbcreate');
  expect(flipped).toEqual({ key: 'dbcreate', direction: 'desc' });
  expect(names(sortCmsUserRows(rows, flipped))).toEqual(['User_c', 'user_a', 'user_b']);
  expect(nextCmsUserSort(flipped, 'casauth')).toEqual({ key: 'casauth', direction: 'asc' });
});

it('reads the user fields CMS sends, none when an authority is missing', () => {
  expect(toCmsUserRow({ '@id': 'u1' })).toMatchObject({ name: 'u1', dbcreate: 'none', casauth: 'none', statusmonitorauth: 'none' });
  expect(toCmsUserRow('u2')).toMatchObject({ name: 'u2', rowKey: 'u2' });
});
