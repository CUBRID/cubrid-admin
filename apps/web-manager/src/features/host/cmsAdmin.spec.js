import { expect, it } from 'vitest';
import { isCmsAdminHost } from './cmsAdmin';

it('is true only for a host logged in with the account named exactly "admin"', () => {
  const hosts = [{ uid: 'a', id: 'admin' }, { uid: 'b', id: 'operator' }, { uid: 'c', id: 'ADMIN' }];
  expect(isCmsAdminHost(hosts, 'a')).toBe(true);
  expect(isCmsAdminHost(hosts, 'b')).toBe(false);
  expect(isCmsAdminHost(hosts, 'c')).toBe(false);
  expect(isCmsAdminHost(hosts, 'missing')).toBe(false);
  expect(isCmsAdminHost(undefined, 'a')).toBe(false);
});
