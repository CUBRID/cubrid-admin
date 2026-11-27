import { csvCell } from './accountView';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const API_LOG_CATEGORIES = ['auth', 'account', 'admin', 'host', 'database', 'broker', 'config', 'ha', 'cms', 'file', 'other'];

export const API_LOG_RANGES = [
  { value: '24h', ms: DAY, label: (CM) => CM.apiLogRange24h },
  { value: '7d', ms: 7 * DAY, label: (CM) => CM.apiLogRange7d },
  { value: '30d', ms: 30 * DAY, label: (CM) => CM.apiLogRange30d },
];

/** The ISO bounds of a range ending now. */
export function rangeBounds(value, now = Date.now()) {
  const range = API_LOG_RANGES.find((r) => r.value === value) ?? API_LOG_RANGES[0];
  return { from: new Date(now - range.ms).toISOString(), to: new Date(now).toISOString() };
}

/** A named action, or the route for one without a name yet. */
export function apiActionText(entry, CM) {
  if (entry?.action) return CM.apiLogActions?.[entry.action] ?? entry.action;
  return `${entry?.method ?? ''} ${entry?.path ?? ''}`.trim();
}

export function apiCategoryText(category, CM) {
  return CM.apiLogCategories?.[category] ?? category;
}

/** Host name, then what on it: "prod-01 / demodb". */
export function apiTargetText(entry) {
  return [entry?.host, entry?.target].filter(Boolean).join(' / ');
}

export function formatDuration(ms) {
  if (typeof ms !== 'number') return '';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** A chart bucket's label: the hour, or the day, in local time. */
export function bucketLabel(start, bucket) {
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return '';
  return bucket === 'hour'
    ? `${String(date.getHours()).padStart(2, '0')}:00`
    : date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
}

export function apiLogCsv(entries, CM) {
  const header = [CM.apiLogTime, CM.apiLogUser, CM.apiLogCategory, CM.apiLogAction, CM.apiLogTarget, CM.apiLogResult, 'Status', 'Error', CM.apiLogDuration, 'IP', 'Request ID'];
  const rows = entries.map((e) => [
    e.at,
    e.user ?? '',
    apiCategoryText(e.category, CM),
    apiActionText(e, CM),
    apiTargetText(e),
    e.ok ? CM.apiLogOk : CM.apiLogFailed,
    e.status,
    e.error ?? e.errorCode ?? '',
    e.durationMs,
    e.ip ?? '',
    e.requestId ?? '',
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** A clean top for the scale: 1, 2, 5 or 10 times a power of ten. */
export function niceMax(value) {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * power >= value);
  return step * power;
}
