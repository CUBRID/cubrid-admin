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

it('shows the first reason to clear when every reason holds', () => {
  const all = {
    hostSelected: false, hostConnected: false, dbLoggedIn: false, haBlocked: true,
    needs: 'stopped', dbRunning: true, noTarget: '없음', busy: '진행 중',
  };
  expect(menuOffReason(KO, all)).toBe('호스트를 먼저 선택하세요.');
  expect(menuOffReason(KO, { ...all, hostSelected: true })).toBe(KO.hostConnectRequiredHint);
  expect(menuOffReason(KO, { ...all, hostSelected: true, hostConnected: true, dbLoggedIn: true, haBlocked: false }))
    .toBe('데이터베이스를 먼저 중지하세요.');
  expect(menuOffReason(KO, { noTarget: '없음', busy: '진행 중' })).toBe('없음');
  expect(menuOffReason(KO, { busy: '진행 중' })).toBe('진행 중');
});

it('asks for the running state the item needs, and nothing when the database is already in it', () => {
  expect(menuOffReason(KO, { needs: 'stopped', dbRunning: true })).toBe('데이터베이스를 먼저 중지하세요.');
  expect(menuOffReason(KO, { needs: 'stopped', dbRunning: false })).toBeUndefined();
  expect(menuOffReason(KO, { needs: 'running', dbRunning: false })).toBe('데이터베이스를 먼저 시작하세요.');
  expect(menuOffReason(KO, { needs: 'running', dbRunning: true })).toBeUndefined();
});

it('asks for the CMS admin account after the connection, before anything about a database', () => {
  expect(menuOffReason(KO, { hostConnected: false, cmsAdmin: false })).toBe(KO.hostConnectRequiredHint);
  expect(menuOffReason(KO, { cmsAdmin: false, dbLoggedIn: false })).toBe(KO.cmsAdminRequiredHint);
  expect(KO.cmsAdminRequiredHint).toBe('CMS admin 계정으로 연결한 호스트에서만 CMS 사용자를 관리할 수 있습니다.');
  expect(menuOffReason(KO, { cmsAdmin: true })).toBeUndefined();
});
