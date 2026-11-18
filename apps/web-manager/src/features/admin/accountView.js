// Pure helpers for the User Administration tab: filtering, counts, dates,
// and the activity log CSV.

/** An account with no login for this long counts as inactive. */
export const INACTIVE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Never logged in, or not within INACTIVE_DAYS of `now`. */
export function isInactive(account, now = Date.now()) {
  const last = Date.parse(account?.lastLoginAt ?? '');
  return Number.isNaN(last) || now - last > INACTIVE_DAYS * DAY_MS;
}

export function accountStats(accounts, now = Date.now()) {
  return {
    total: accounts.length,
    admins: accounts.filter((a) => a.role === 'admin').length,
    disabled: accounts.filter((a) => a.status === 'disabled').length,
    awaitingApproval: accounts.filter((a) => a.status === 'pending').length,
    inactive: accounts.filter((a) => isInactive(a, now)).length,
  };
}

/** Sign-ups awaiting approval, oldest request first. */
export function pendingAccounts(accounts) {
  return accounts
    .filter((a) => a.status === 'pending')
    .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
}

/**
 * `role`: 'all' | 'admin' | 'user'; `status`: 'all' | 'active' | 'disabled'
 * | 'approval' (signed up, awaiting approval) | 'pending' (must set a
 * password) | 'inactive'. `search` matches part of
 * the id, ignoring case.
 */
export function filterAccounts(accounts, { search = '', role = 'all', status = 'all' } = {}, now = Date.now()) {
  const needle = search.trim().toLowerCase();
  return accounts.filter((a) => {
    if (needle && !a.id.toLowerCase().includes(needle)) return false;
    if (role !== 'all' && a.role !== role) return false;
    if (status === 'active' && (a.status === 'disabled' || a.status === 'pending')) return false;
    if (status === 'approval' && a.status !== 'pending') return false;
    if (status === 'disabled' && a.status !== 'disabled') return false;
    if (status === 'pending' && !a.mustChangePassword) return false;
    if (status === 'inactive' && !isInactive(a, now)) return false;
    return true;
  });
}

export function formatTime(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

/** A date input's value (local yyyy-mm-dd) as the start or end of that day, in ISO. */
export function dayBoundary(value, end = false) {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  const date = end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function auditActionText(action, CM) {
  return CM.auditActions?.[action] ?? action;
}

export function auditDetailText(entry, CM) {
  const d = entry?.detail;
  if (!d) return '';
  if (typeof d.enabled === 'boolean') return CM.auditDetailRegistration(d.enabled);
  if (typeof d.required === 'boolean') return CM.auditDetailApproval(d.required);
  if (typeof d.role === 'string') return CM.auditDetailRole(d.role === 'admin' ? CM.administratorLabel : CM.accountRoleUser);
  return '';
}

const csvCell = (value) => {
  const text = String(value ?? '');
  // Quote everything; a leading =, +, - or @ is prefixed so a spreadsheet
  // shows the text instead of running it as a formula.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function auditCsv(entries, CM) {
  const header = [CM.activityTime, CM.activityActor, CM.activityAction, CM.activityTarget, CM.activityDetail];
  const rows = entries.map((e) => [e.at, e.actor, auditActionText(e.action, CM), e.target ?? '', auditDetailText(e, CM)]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
