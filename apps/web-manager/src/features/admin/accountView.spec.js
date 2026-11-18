import { describe, expect, it } from 'vitest';
import { CM } from '../../constants/cmLabels';
import { accountStats, auditCsv, auditDetailText, dayBoundary, filterAccounts, isInactive, pendingAccounts } from './accountView';

const NOW = Date.parse('2026-11-12T00:00:00.000Z');
const day = (n) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();
const ACCOUNTS = [
  { id: 'root', role: 'admin', status: 'active', lastLoginAt: day(0) },
  { id: 'Alice', role: 'user', status: 'active', lastLoginAt: day(10), mustChangePassword: true },
  { id: 'bob', role: 'user', status: 'disabled', lastLoginAt: day(120) },
  { id: 'carol', role: 'user', status: 'active' },
];

describe('account helpers', () => {
  it('counts accounts, admins, disabled and inactive', () => {
    expect(accountStats(ACCOUNTS, NOW)).toEqual({ total: 4, admins: 1, disabled: 1, awaitingApproval: 0, inactive: 2 });
  });

  it('treats never logged in and over 90 days as inactive', () => {
    expect(isInactive({ lastLoginAt: day(89) }, NOW)).toBe(false);
    expect(isInactive({ lastLoginAt: day(91) }, NOW)).toBe(true);
    expect(isInactive({}, NOW)).toBe(true);
  });

  it('filters by id (any case), role and status', () => {
    const ids = (f) => filterAccounts(ACCOUNTS, f, NOW).map((a) => a.id);
    expect(ids({ search: 'ali' })).toEqual(['Alice']);
    expect(ids({ role: 'admin' })).toEqual(['root']);
    expect(ids({ status: 'disabled' })).toEqual(['bob']);
    expect(ids({ status: 'active' })).toEqual(['root', 'Alice', 'carol']);
    expect(ids({ status: 'pending' })).toEqual(['Alice']);
    expect(ids({ status: 'inactive', role: 'user' })).toEqual(['bob', 'carol']);
  });

  it('keeps sign-ups awaiting approval apart from active accounts, oldest first', () => {
    const list = [
      ...ACCOUNTS,
      { id: 'late', role: 'user', status: 'pending', createdAt: day(1) },
      { id: 'early', role: 'user', status: 'pending', createdAt: day(3) },
    ];
    const ids = (f) => filterAccounts(list, f, NOW).map((a) => a.id);
    expect(ids({ status: 'approval' })).toEqual(['late', 'early']);
    expect(ids({ status: 'active' })).not.toContain('late');
    expect(accountStats(list, NOW).awaitingApproval).toBe(2);
    expect(pendingAccounts(list).map((a) => a.id)).toEqual(['early', 'late']);
  });

  it('describes a change to sign-up approval in the activity log', () => {
    expect(auditDetailText({ detail: { required: true } }, CM)).toBe('Approval required');
    expect(auditDetailText({ detail: { required: false } }, CM)).toBe('Approval not required');
  });

  it('turns a date input into the start and end of that local day', () => {
    expect(new Date(dayBoundary('2026-03-05')).getHours()).toBe(0);
    expect(new Date(dayBoundary('2026-03-05', true)).getHours()).toBe(23);
    expect(dayBoundary('')).toBeUndefined();
    expect(dayBoundary('nonsense')).toBeUndefined();
  });

  it('writes a CSV with every cell quoted and formulas neutralised', () => {
    const csv = auditCsv(
      [
        { at: '2026-11-01T00:00:00.000Z', actor: 'root', action: 'create', target: 'a"b', detail: { role: 'admin' } },
        { at: '2026-11-02T00:00:00.000Z', actor: '=cmd()', action: 'set_registration', detail: { enabled: false } },
      ],
      CM
    );
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('"Time","By","Action","Account","Detail"');
    expect(lines[1]).toBe('"2026-11-01T00:00:00.000Z","root","Created account","a""b","Role: Administrator"');
    expect(lines[2]).toContain(`"'=cmd()"`);
    expect(lines[2]).toContain('"Turned off"');
  });
});
