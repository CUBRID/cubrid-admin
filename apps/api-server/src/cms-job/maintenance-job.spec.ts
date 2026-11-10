import { getLoadResult, getMaintenanceResult, getMaintenanceSummary, redactMaintenanceText } from './maintenance-job';
import type { CmsJobRecord } from './cms-job.types';

const job = (patch: Partial<CmsJobRecord> = {}): CmsJobRecord => ({
  jobId: 'job-1', userId: 'user-1', hostUid: 'host-1', dbname: 'demodb',
  type: 'optimize', status: 'succeeded', createdAt: '2026-10-15T01:00:00Z',
  payload: {}, ...patch,
});

describe('maintenance job reporting', () => {
  it('reports selected-class scope without exposing credentials or inventing a scan method', () => {
    const summary = getMaintenanceSummary(job({ payload: { classname: 'dba.employee', dbuser: 'dba', dbpasswd: 'secret' } }));
    expect(summary).toEqual({
      operation: 'statistics-update', scope: 'selected-class', className: 'dba.employee', scanMethod: 'unknown',
    });
    expect(JSON.stringify(summary)).not.toContain('secret');
  });

  it('distinguishes all-class scope from the statistics scan method', () => {
    expect(getMaintenanceSummary(job())).toEqual({
      operation: 'statistics-update', scope: 'all-classes', scanMethod: 'unknown',
    });
  });

  it.each(['y', 'n'] as const)('records the requested repair option %s without claiming repairs occurred', (repairdb) => {
    expect(getMaintenanceSummary(job({ type: 'check', payload: { repairdb } }))).toEqual({
      operation: 'consistency-check', scope: 'entire-database', repairRequested: repairdb === 'y',
    });
  });

  it('handles CMS envelope-only success and missing responses without fabricated findings', () => {
    expect(getMaintenanceResult(job(), { __EXEC_TIME: '31 ms', task: 'optimizedb', status: 'success', note: 'none' }, true))
      .toEqual({ success: true });
    expect(getMaintenanceResult(job(), undefined, true)).toEqual({ success: true });
    expect(getMaintenanceSummary(job({ type: 'compact' }))).toBeUndefined();
  });

  it('keeps available text diagnostics on failure and filters unexpected envelope fields', () => {
    expect(getMaintenanceResult(job(), {
      log: [{ line: ['Checking dba.employee', 'Index inconsistency reported'], token: 'hidden' }],
      line: ['Additional utility diagnostic'],
      note: 'Check failed', token: 'hidden', unexpected: { password: 'secret' },
    }, false)).toEqual({
      success: false, output: 'Checking dba.employee\nIndex inconsistency reported\nAdditional utility diagnostic\nCheck failed',
    });
  });

  it('redacts known request secrets and credential assignments in utility text', () => {
    const result = getMaintenanceResult(job({ payload: { dbpasswd: 'secret-value' } }), {
      log: 'secret-value token="server-token" password=other-secret dbpasswd: another-secret',
      token: 'server-token',
    }, false);
    expect(result.output).toBe('[redacted] token=[redacted] password=[redacted] dbpasswd: [redacted]');
    expect(redactMaintenanceText(job(), undefined, '{"password":"other-secret"}')).toBe('{"password":[redacted]}');
    expect(redactMaintenanceText(job({ payload: { dbpasswd: 'secret-value' } }), undefined, 'Login failed: secret-value'))
      .toBe('Login failed: [redacted]');
  });
});

describe('loaddb job result', () => {
  // CMS loaddb responses as a test host returned them.
  it('keeps the output lines of a load that succeeded', () => {
    const response = { status: 'success', line: ['', 'Start object loading.', 'Total 5 object(s) inserted, 0 object(s) failed.'], note: 'none' };
    expect(getLoadResult(response, true)).toEqual({
      success: true,
      log: ['Start object loading.', 'Total 5 object(s) inserted, 0 object(s) failed.'],
    });
  });

  it('keeps the failed lines of a load that failed', () => {
    const response = {
      status: 'failure',
      line: ['', 'Start object loading.', 'Line 4:Data overflow on data type "character varying".'],
      note: 'loaddb failed with exit status: 3',
    };
    expect(getLoadResult(response, false)).toEqual({
      success: false,
      log: ['Start object loading.', 'Line 4:Data overflow on data type "character varying".'],
    });
  });

  it('adds no log when there is no output', () => {
    expect(getLoadResult({ status: 'success' }, true)).toEqual({ success: true });
    expect(getLoadResult(undefined, false)).toEqual({ success: false });
  });
});
