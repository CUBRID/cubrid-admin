import { expect, it } from 'vitest';
import { getCM } from '../../constants/useCM';
import { menuOffReason } from './menuOffReason';

const KO = getCM('ko');

it('says why a menu item is off: connect first, then log in, then HA', () => {
  expect(menuOffReason(KO, { hostConnected: false, dbLoggedIn: false, haBlocked: true })).toBe('호스트에 먼저 연결하세요.');
  expect(menuOffReason(KO, { dbLoggedIn: false, haBlocked: true })).toBe('데이터베이스에 먼저 로그인하세요.');
  expect(menuOffReason(KO, { haBlocked: true })).toBe(KO.manageDatabaseHaDisabledHint);
  expect(menuOffReason(KO, {})).toBeUndefined();
});
