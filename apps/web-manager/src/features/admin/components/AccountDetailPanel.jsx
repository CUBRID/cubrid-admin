import { useEffect, useState } from 'react';
import { Badge } from '../../../components/ds/foundation/Badge';
import { Button } from '../../../components/ds/foundation/Button';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';
import { adminApi } from '../adminApi';
import { auditActionText, formatTime } from '../accountView';
import AccountStatusBadge from './AccountStatusBadge';

const RECENT_ACTIVITY = 8;

/**
 * One account's details and every action on it. Buttons the server would
 * refuse (your own account, a cwm.conf admin) are off with the reason as
 * their tooltip; the server checks again either way.
 */
export default function AccountDetailPanel({ account, selfId, busy, reloadKey, onAction, onClose }) {
  const CM = useCM();
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    if (!account) return undefined;
    let live = true;
    setActivity(null);
    adminApi
      .queryAudit({ target: account.id, limit: RECENT_ACTIVITY })
      .then((page) => live && setActivity(page?.entries ?? []))
      .catch(() => live && setActivity([]));
    return () => {
      live = false;
    };
    // Read again for another account or after a change (reloadKey).
  }, [account?.id, reloadKey]);

  if (!account) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center gap-2 p-6 text-slate-400">
        <Icon name="person_search" size="28px" weight={200} />
        <p className="text-13">{CM.accountDetailEmpty}</p>
      </div>
    );
  }

  const self = account.id === selfId;
  const byConfig = account.adminByConfig;
  const selfReason = self ? CM.adminSelfChangeHint : undefined;
  const row = (label, value) => (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-white/5 text-13">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-slate-700 dark:text-slate-200 text-right truncate">{value}</span>
    </div>
  );
  const action = (testId, icon, label, onClick, { danger = false, off = false, reason } = {}) => (
    <Button
      data-testid={`admin-detail-${testId}`}
      variant={danger ? 'danger' : 'outline'}
      size="sm"
      icon={icon}
      className="w-full justify-start"
      disabled={off || busy}
      title={off ? reason : undefined}
      onClick={onClick}
    >
      {label}
    </Button>
  );

  return (
    <div className="h-full flex flex-col min-h-0" data-testid="admin-account-detail">
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <p className="text-16 font-black text-slate-800 dark:text-white truncate" title={account.id}>{account.id}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            <Badge size="sm" variant={account.role === 'admin' ? 'warning' : 'default'}>
              {account.role === 'admin' ? CM.administratorLabel : CM.accountRoleUser}
            </Badge>
            <AccountStatusBadge status={account.status} />
            {self && <Badge size="sm" variant="info">{CM.accountYouBadge}</Badge>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
          title={CM.close}
          aria-label={CM.close}
        >
          <Icon name="close" size="16px" weight={300} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 pb-4 space-y-4">
        <div>
          {row(CM.created, formatTime(account.createdAt) ?? '—')}
          {row(CM.accountLastLogin, formatTime(account.lastLoginAt) ?? CM.accountNeverLoggedIn)}
          {row(CM.accountSavedHosts, account.hostCount ?? 0)}
          {account.mustChangePassword && row(CM.accountStatusLabel, CM.accountMustChangePassword)}
          {byConfig && row(CM.accountRoleLabel, CM.accountAdminByConfig)}
          {account.approvedBy && row(CM.accountApprovedBy, [account.approvedBy, formatTime(account.approvedAt)].filter(Boolean).join(' · '))}
        </div>

        {/* A sign-up awaiting approval is only approved, rejected or deleted. */}
        {account.status === 'pending' ? (
          <div className="space-y-1.5">
            {action('approve', 'check', CM.approveAccountBtn, () => onAction('approve', account))}
            {action('reject', 'close', CM.rejectAccountBtn, () => onAction('reject', account), { danger: true })}
          </div>
        ) : (
        <div className="space-y-1.5">
          {action('reset', 'lock_reset', CM.resetAccountPasswordBtn, () => onAction('reset', account), { off: self, reason: selfReason })}
          {action('sign-out', 'logout', CM.signOutEverywhereBtn, () => onAction('signOut', account), { off: self, reason: selfReason })}
          {account.role === 'admin'
            ? action('role', 'remove_moderator', CM.revokeAdminBtn, () => onAction('revokeAdmin', account), {
                off: self || byConfig,
                reason: self ? selfReason : CM.accountAdminByConfig,
              })
            : action('role', 'add_moderator', CM.grantAdminBtn, () => onAction('grantAdmin', account), { off: self, reason: selfReason })}
          {account.status === 'disabled'
            ? action('status', 'check_circle', CM.enableAccountBtn, () => onAction('enable', account), { off: self, reason: selfReason })
            : action('status', 'block', CM.disableAccountBtn, () => onAction('disable', account), {
                off: self || byConfig,
                reason: self ? selfReason : CM.accountAdminByConfig,
              })}
          {action('delete', 'delete', CM.deleteAccountBtn, () => onAction('delete', account), {
            danger: true,
            off: self || byConfig,
            reason: self ? selfReason : CM.accountAdminByConfig,
          })}
        </div>
        )}

        <div>
          <p className="text-11 font-bold uppercase tracking-widest text-slate-400 mb-2">{CM.accountRecentActivity}</p>
          {activity === null ? (
            <div className="h-4 w-24 bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
          ) : activity.length === 0 ? (
            <p className="text-12 text-slate-400">{CM.noActivity}</p>
          ) : (
            <ul className="space-y-1.5" data-testid="admin-detail-activity">
              {activity.map((e) => (
                <li key={`${e.at}-${e.action}`} className="text-12 leading-snug">
                  <span className="text-slate-700 dark:text-slate-200 font-semibold">{auditActionText(e.action, CM)}</span>
                  <span className="text-slate-400"> · {e.actor} · {formatTime(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
