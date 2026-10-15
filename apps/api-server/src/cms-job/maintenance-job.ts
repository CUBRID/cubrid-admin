import type { CheckDatabaseRequest, MaintenanceResult, MaintenanceSummary, OptimizeDatabaseRequest } from '@api-interfaces';
import type { CmsJobRecord } from './cms-job.types';

export function getMaintenanceSummary(job: CmsJobRecord): MaintenanceSummary | undefined {
  if (job.type === 'optimize') {
    const { classname } = job.payload as OptimizeDatabaseRequest;
    return {
      operation: 'statistics-update',
      scope: classname ? 'selected-class' : 'all-classes',
      ...(classname ? { className: classname } : {}),
      // CMS optimizedb has no scan-method option or reported scan method.
      scanMethod: 'unknown',
    };
  }
  if (job.type === 'check') {
    return {
      operation: 'consistency-check',
      scope: 'entire-database',
      repairRequested: (job.payload as CheckDatabaseRequest).repairdb === 'y',
    };
  }
  return undefined;
}

/** Accept only utility text and the CMS log[].line format, never arbitrary objects. */
function textLines(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(textLines);
  if (value && typeof value === 'object' && 'line' in value) {
    return textLines((value as { line: unknown }).line);
  }
  return [];
}

export function redactMaintenanceText(job: CmsJobRecord, response: unknown, value: string): string {
  const cms = response && typeof response === 'object' ? response as Record<string, unknown> : {};
  let output = value;
  const credentials = job.payload as OptimizeDatabaseRequest;
  for (const secret of [credentials.dbpasswd, cms.token, cms.dbpasswd, cms.password]) {
    if (typeof secret === 'string' && secret) output = output.split(secret).join('[redacted]');
  }
  return output.replace(/((?:["']?(?:token|dbpasswd|password)["']?)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]');
}

export function getMaintenanceResult(job: CmsJobRecord, response: unknown, success: boolean): MaintenanceResult {
  const cms = response && typeof response === 'object' ? response as Record<string, unknown> : {};
  const lines = [...textLines(cms.log), ...textLines(cms.line)];
  if (typeof cms.note === 'string' && cms.note.trim() && cms.note.trim().toLowerCase() !== 'none') {
    lines.push(cms.note);
  }
  // Never serialize the CMS envelope or expose secrets echoed by the utility.
  const output = redactMaintenanceText(job, cms, lines.join('\n'));
  return { success, ...(output ? { output } : {}) };
}
