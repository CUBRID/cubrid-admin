import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { Badge } from '../../../components/ds/foundation/Badge';
import { Button } from '../../../components/ds/foundation/Button';
import { Icon } from '../../../components/ds/foundation/Icon';
import { SearchInput } from '../../../components/ds/forms/SearchInput';
import { Select } from '../../../components/ds/forms/Select';
import { useCM } from '../../../constants/useCM';
import { useConfirm } from '../../../infrastructure/hooks/useConfirm';
import { requestErrorText } from '../../../infrastructure/errors/serverErrorText';
import { showStatusModal } from '../../layout/layoutSlice';
import { adminApi } from '../adminApi';
import { accountStats, filterAccounts, formatTime, pendingAccounts } from '../accountView';
import { refreshPendingApprovals, usePendingCount } from '../usePendingApprovals';
import AccountDetailPanel from './AccountDetailPanel';
import AccountStatusBadge from './AccountStatusBadge';
import AccountPasswordModal from './AccountPasswordModal';
import AdminPageHeader from './AdminPageHeader';

const STAT = 'min-w-0 flex items-center gap-3 rounded-2xl border border-slate-200/70 dark:border-white/6 bg-white dark:bg-background-dark px-4 py-3.5';
const TH = 'px-4 py-2.5 text-left text-11 font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap';
const TD = 'px-4 py-3 text-13 whitespace-nowrap';

/**
 * The Accounts page: counts, search and filters, a table with checkboxes
 * for bulk changes, and the clicked account's details beside it.
 */
export default function AccountsSection({ reloadKey }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const confirm = useConfirm();
  const selfId = useSelector((state) => state.auth.user?.id, shallowEqual);

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [detailId, setDetailId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [changeKey, setChangeKey] = useState(0);
  // null: closed; { accountId: null } creates; { accountId } resets.
  const [passwordDialog, setPasswordDialog] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await adminApi.listAccounts();
      const next = Array.isArray(list) ? list : [];
      setAccounts(next);
      // Drop selections and details for accounts that are gone.
      const ids = new Set(next.map((a) => a.id));
      setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))));
      setDetailId((prev) => (prev && ids.has(prev) ? prev : null));
    } catch (err) {
      setLoadError(requestErrorText(err, CM));
    } finally {
      setLoading(false);
    }
  }, [CM]);

  useEffect(() => {
    setLoading(true);
    void load();
    // Again on the tab's reload; `load` itself changes only with the language.
  }, [reloadKey]);


  const stats = useMemo(() => accountStats(accounts), [accounts]);

  // A request that came in while this page is open shows without a reload.
  // The console page polls; this only listens.
  const pendingCount = usePendingCount();
  useEffect(() => {
    if (!loading && pendingCount !== null && pendingCount !== stats.awaitingApproval) void load();
    // Only when the server's count moves, not on every list change.
  }, [pendingCount]);
  const requests = useMemo(() => pendingAccounts(accounts), [accounts]);
  // Role picked per request before approving; a plain user unless changed.
  const [approveRoles, setApproveRoles] = useState({});
  const shown = useMemo(() => filterAccounts(accounts, { search, role, status }), [accounts, search, role, status]);
  const detail = accounts.find((a) => a.id === detailId) ?? null;
  const selectable = shown.filter((a) => a.id !== selfId);
  const allShownSelected = selectable.length > 0 && selectable.every((a) => selected.has(a.id));

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allShownSelected ? new Set() : new Set(selectable.map((a) => a.id)));

  const afterChange = async () => {
    await load();
    setChangeKey((k) => k + 1);
    void refreshPendingApprovals();
  };
  const fail = (err) =>
    dispatch(showStatusModal({ type: 'error', title: CM.operationFailed, message: requestErrorText(err, CM) }));

  // One account: confirm, run, report, reload.
  const single = async (account, kind) => {
    const id = account.id;
    const plan = {
      disable: { run: () => adminApi.setStatus(id, 'disabled'), ask: { title: CM.disableAccountBtn, description: CM.confirmDisableAccount(id), confirmLabel: CM.disableAccountBtn, variant: 'danger' } },
      enable: { run: () => adminApi.setStatus(id, 'active') },
      grantAdmin: { run: () => adminApi.setRole(id, 'admin'), ask: { title: CM.grantAdminBtn, description: CM.confirmGrantAdmin(id), confirmLabel: CM.grantAdminBtn, variant: 'warning' } },
      revokeAdmin: { run: () => adminApi.setRole(id, 'user'), ask: { title: CM.revokeAdminBtn, description: CM.confirmRevokeAdmin(id), confirmLabel: CM.revokeAdminBtn, variant: 'warning' } },
      approve: {
        run: () => adminApi.approveAccount(id, approveRoles[id] ?? 'user'),
        // Approving straight to administrator deserves a second look.
        ask: (approveRoles[id] ?? 'user') === 'admin'
          ? { title: CM.approveAccountBtn, description: CM.confirmApproveAdmin(id), confirmLabel: CM.approveAccountBtn, variant: 'warning' }
          : undefined,
        done: CM.accountApprovedMsg(id),
      },
      reject: { run: () => adminApi.rejectAccount(id), ask: { title: CM.rejectAccountBtn, description: CM.confirmRejectAccount(id), confirmLabel: CM.rejectAccountBtn, variant: 'danger' }, done: CM.accountRejectedMsg(id) },
      signOut: { run: () => adminApi.signOutEverywhere(id), ask: { title: CM.signOutEverywhereBtn, description: CM.confirmSignOut(id), confirmLabel: CM.signOutEverywhereBtn, variant: 'warning' }, done: CM.accountSignedOutMsg(id) },
      delete: { run: () => adminApi.deleteAccount(id), ask: { title: CM.deleteAccountBtn, description: CM.confirmDeleteAccount(id), confirmLabel: CM.deleteAccountBtn, variant: 'danger' }, done: CM.accountDeletedMsg(id) },
    }[kind];
    if (kind === 'reset') {
      setPasswordDialog({ accountId: id });
      return;
    }
    if (plan.ask && !(await confirm(plan.ask))) return;
    setBusy(true);
    try {
      await plan.run();
      if (plan.done) dispatch(showStatusModal({ type: 'success', title: CM.success, message: plan.done }));
      await afterChange();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  // Several accounts, one request each so the server's rules apply to each;
  // your own account is never included.
  const bulk = async (kind) => {
    const ids = [...selected].filter((id) => id !== selfId);
    if (ids.length === 0) return;
    const plan = {
      disable: { run: (id) => adminApi.setStatus(id, 'disabled'), ask: CM.confirmBulkDisable(ids.length), label: CM.disableAccountBtn, variant: 'danger' },
      enable: { run: (id) => adminApi.setStatus(id, 'active'), ask: CM.confirmBulkEnable(ids.length), label: CM.enableAccountBtn, variant: 'warning' },
      signOut: { run: (id) => adminApi.signOutEverywhere(id), ask: CM.confirmBulkSignOut(ids.length), label: CM.signOutEverywhereBtn, variant: 'warning' },
      delete: { run: (id) => adminApi.deleteAccount(id), ask: CM.confirmBulkDelete(ids.length), label: CM.deleteAccountBtn, variant: 'danger' },
    }[kind];
    if (!(await confirm({ title: plan.label, description: plan.ask, confirmLabel: plan.label, variant: plan.variant }))) return;

    setBusy(true);
    const failures = [];
    for (const id of ids) {
      try {
        await plan.run(id);
      } catch (err) {
        failures.push(`${id}: ${requestErrorText(err, CM)}`);
      }
    }
    setBusy(false);
    setSelected(new Set());
    const done = ids.length - failures.length;
    dispatch(showStatusModal(
      failures.length === 0
        ? { type: 'success', title: CM.success, message: CM.bulkDoneMsg(done) }
        : { type: 'error', title: plan.label, message: CM.bulkPartialMsg(done, failures.length), detail: failures.join('\n') }
    ));
    await afterChange();
  };

  // The password dialog runs the request itself, so a failure stays in it.
  const submitPassword = async ({ id, password, role: newRole, generated }) => {
    const creating = passwordDialog?.accountId === null;
    if (creating) await adminApi.createAccount(id, password, newRole);
    else await adminApi.resetPassword(id, password);
    setPasswordDialog(null);
    dispatch(showStatusModal({
      type: 'success',
      title: CM.success,
      message: creating ? CM.accountCreatedMsg(id) : CM.accountPasswordResetMsg(id),
      // A generated password is shown once more, so it can still be copied.
      ...(generated ? { detail: CM.generatedPasswordDetail(password) } : {}),
    }));
    if (creating) setDetailId(id);
    await afterChange();
  };

  const stat = (label, value, icon, testId) => (
    <div className={STAT} data-testid={testId}>
      <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
        <Icon name={icon} size="19px" weight={300} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-black leading-none text-slate-800 dark:text-white tabular-nums">{value}</p>
        <p className="text-12 text-slate-500 dark:text-slate-400 mt-1 truncate" title={label}>{label}</p>
      </div>
    </div>
  );
  const selfSelected = selected.has(selfId);
  const bulkCount = [...selected].filter((id) => id !== selfId).length;

  return (
    <div>
      <AdminPageHeader
        title={CM.adminSectionAccounts}
        action={
          <Button data-testid="admin-create-account-btn" icon="person_add" onClick={() => setPasswordDialog({ accountId: null })}>
            {CM.createAccountBtn}
          </Button>
        }
      />

      {requests.length > 0 && (
        <section
          data-testid="admin-pending-approvals"
          aria-label={CM.pendingApprovalsTitle(requests.length)}
          className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 overflow-hidden"
        >
          <div className="flex items-start gap-3 px-4 py-3 border-b border-amber-500/20">
            <Icon name="how_to_reg" size="20px" weight={300} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-14 font-bold text-slate-800 dark:text-slate-100">{CM.pendingApprovalsTitle(requests.length)}</p>
            </div>
          </div>
          <ul className="divide-y divide-amber-500/10">
            {requests.map((a) => (
              <li key={a.id} data-testid={`admin-pending-${a.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white dark:bg-white/5 text-slate-400">
                  <Icon name="person_add" size="16px" weight={300} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-14 text-slate-800 dark:text-slate-100 truncate" title={a.id}>{a.id}</p>
                  {formatTime(a.createdAt) && (
                    <p className="text-12 text-slate-400">{CM.pendingRequestedAt(formatTime(a.createdAt))}</p>
                  )}
                </div>
                <span className="text-12 text-slate-500 dark:text-slate-400 whitespace-nowrap">{CM.approveAsLabel}</span>
                <div className="w-40">
                  <Select
                    size="sm"
                    testId={`admin-pending-role-${a.id}`}
                    value={approveRoles[a.id] ?? 'user'}
                    onChange={(e) => setApproveRoles((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    options={[
                      { value: 'user', label: CM.accountRoleUser },
                      { value: 'admin', label: CM.administratorLabel },
                    ]}
                  />
                </div>
                <Button size="sm" icon="check" disabled={busy} data-testid={`admin-approve-${a.id}`} onClick={() => void single(a, 'approve')}>
                  {CM.approveAccountBtn}
                </Button>
                <Button size="sm" variant="outline" icon="close" disabled={busy} data-testid={`admin-reject-${a.id}`} onClick={() => void single(a, 'reject')}>
                  {CM.rejectAccountBtn}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        {stat(CM.statAccounts, stats.total, 'group', 'admin-stat-total')}
        {stat(CM.statAdmins, stats.admins, 'verified_user', 'admin-stat-admins')}
        {stat(CM.statDisabled, stats.disabled, 'block', 'admin-stat-disabled')}
        {stat(CM.statInactive, stats.inactive, 'schedule', 'admin-stat-inactive')}
      </div>

      <div className={`grid gap-5 items-start ${detail ? 'grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1'}`}>
        <div className="rounded-2xl border border-slate-200/70 dark:border-white/6 bg-white dark:bg-background-dark overflow-hidden min-w-0">
          {/* Toolbar, or the bulk actions while accounts are ticked. */}
          {selected.size > 0 ? (
            <div data-testid="admin-bulk-bar" className="flex flex-wrap items-center gap-2 px-4 py-3 bg-amber-500/5 border-b border-amber-500/20">
              <span className="text-14 font-bold text-amber-600 dark:text-amber-400">{CM.accountsSelected(bulkCount)}</span>
              {selfSelected && <span className="text-12 text-slate-400">{CM.bulkSelfSkipped}</span>}
              <div className="flex flex-wrap gap-1.5 ml-auto">
                <Button size="sm" variant="outline" icon="block" disabled={busy || bulkCount === 0} data-testid="admin-bulk-disable" onClick={() => bulk('disable')}>{CM.disableAccountBtn}</Button>
                <Button size="sm" variant="outline" icon="check_circle" disabled={busy || bulkCount === 0} data-testid="admin-bulk-enable" onClick={() => bulk('enable')}>{CM.enableAccountBtn}</Button>
                <Button size="sm" variant="outline" icon="logout" disabled={busy || bulkCount === 0} data-testid="admin-bulk-sign-out" onClick={() => bulk('signOut')}>{CM.signOutEverywhereBtn}</Button>
                <Button size="sm" variant="outline" icon="delete" disabled={busy || bulkCount === 0} data-testid="admin-bulk-delete" onClick={() => bulk('delete')}>{CM.deleteAccountBtn}</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{CM.clearSelection}</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-white/5">
              <div className="flex-1 min-w-[200px]">
                <SearchInput
                  value={search}
                  onChange={(value) => setSearch(value)}
                  onClear={() => setSearch('')}
                  placeholder={CM.searchAccountsPlaceholder}
                />
              </div>
              <div className="w-40">
                <Select
                  size="sm"
                  testId="admin-filter-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  options={[
                    { value: 'all', label: CM.filterAllRoles },
                    { value: 'admin', label: CM.administratorLabel },
                    { value: 'user', label: CM.accountRoleUser },
                  ]}
                />
              </div>
              <div className="w-48">
                <Select
                  size="sm"
                  testId="admin-filter-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  options={[
                    { value: 'all', label: CM.filterAllStatuses },
                    { value: 'active', label: CM.accountStatusActive },
                    { value: 'disabled', label: CM.accountStatusDisabled },
                    { value: 'approval', label: CM.filterAwaitingApproval },
                    { value: 'pending', label: CM.filterPendingPassword },
                    { value: 'inactive', label: CM.statInactive },
                  ]}
                />
              </div>
            </div>
          )}

          {loadError ? (
            <div role="alert" className="flex items-start gap-3 m-4 px-4 py-3 bg-rose-500/5 border border-rose-500/15 rounded-xl">
              <Icon name="error_outline" size="sm" weight={300} className="text-rose-500 shrink-0 mt-0.5" />
              <p className="text-13 text-rose-500 font-medium flex-1 leading-relaxed">{loadError}</p>
              <Button variant="ghost" size="sm" onClick={() => void load()}>{CM.refresh}</Button>
            </div>
          ) : (
            <div className="overflow-x-auto" data-testid="admin-account-table">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/60 dark:bg-white/2">
                    <th className={`${TH} w-12`}>
                      <input
                        type="checkbox"
                        data-testid="admin-select-all"
                        aria-label={CM.selectAllAccounts}
                        checked={allShownSelected}
                        onChange={toggleAll}
                        disabled={selectable.length === 0}
                        className="accent-amber-500"
                      />
                    </th>
                    <th className={TH}>{CM.userIdLabel}</th>
                    <th className={TH}>{CM.accountRoleLabel}</th>
                    <th className={TH}>{CM.accountStatusLabel}</th>
                    <th className={`${TH} text-right`}>{CM.accountSavedHosts}</th>
                    <th className={TH}>{CM.accountLastLogin}</th>
                    <th className={`${TH} w-10`} aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {loading && accounts.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center"><div className="mx-auto h-4 w-32 bg-slate-100 dark:bg-white/5 rounded animate-pulse" /></td></tr>
                  ) : shown.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-14 text-slate-400">{CM.noAccountsMatch}</td></tr>
                  ) : (
                    shown.map((a) => {
                      const self = a.id === selfId;
                      const active = a.id === detailId;
                      return (
                        <tr
                          key={a.id}
                          data-testid={`admin-account-${a.id}`}
                          onClick={() => setDetailId(active ? null : a.id)}
                          aria-selected={active}
                          className={`group border-b border-slate-100 last:border-b-0 dark:border-white/4 cursor-pointer transition-colors ${active ? 'bg-amber-500/6' : 'hover:bg-slate-50 dark:hover:bg-white/2'}`}
                        >
                          <td className={TD} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              data-testid={`admin-select-${a.id}`}
                              aria-label={CM.selectAccountLabel(a.id)}
                              checked={selected.has(a.id)}
                              onChange={() => toggle(a.id)}
                              disabled={self}
                              className="accent-amber-500"
                            />
                          </td>
                          <td className={TD}>
                            <span className="flex items-center gap-2.5 min-w-0">
                              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${a.role === 'admin' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-white/5 text-slate-400'}`}>
                                <Icon name={a.role === 'admin' ? 'verified_user' : 'person'} size="16px" weight={300} />
                              </span>
                              <span className="font-bold text-14 text-slate-800 dark:text-slate-100 truncate" title={a.id}>{a.id}</span>
                              {self && <Badge size="sm" variant="info">{CM.accountYouBadge}</Badge>}
                              {a.mustChangePassword && (
                                <span title={CM.accountMustChangePassword}><Icon name="lock_clock" size="15px" weight={300} className="text-amber-500" /></span>
                              )}
                            </span>
                          </td>
                          <td className={TD}>
                            <span className="flex items-center gap-1.5" title={a.adminByConfig ? CM.accountAdminByConfig : undefined}>
                              <Badge size="sm" variant={a.role === 'admin' ? 'warning' : 'default'}>
                                {a.role === 'admin' ? CM.administratorLabel : CM.accountRoleUser}
                              </Badge>
                              {a.adminByConfig && <Icon name="settings" size="13px" weight={300} className="text-slate-400" />}
                            </span>
                          </td>
                          <td className={TD}>
                            <AccountStatusBadge status={a.status} />
                          </td>
                          <td className={`${TD} text-right tabular-nums text-slate-500`}>{a.hostCount ?? 0}</td>
                          <td className={`${TD} text-slate-500`}>{formatTime(a.lastLoginAt) ?? CM.accountNeverLoggedIn}</td>
                          <td className={`${TD} text-right`}>
                            <Icon name="chevron_right" size="18px" weight={300} className={`text-slate-300 dark:text-slate-600 transition-transform ${active ? 'rotate-180 text-amber-500' : 'group-hover:translate-x-0.5'}`} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 py-2.5 border-t border-slate-100 dark:border-white/5 text-12 text-slate-400">
            {CM.accountsShownOfTotal(shown.length, accounts.length)}
          </div>
        </div>

        {detail && (
          <aside className="sticky top-0 rounded-2xl border border-slate-200/70 dark:border-white/6 bg-white dark:bg-background-dark overflow-hidden">
            <AccountDetailPanel
              account={detail}
              selfId={selfId}
              busy={busy}
              reloadKey={changeKey}
              onAction={(kind, account) => void single(account, kind)}
              onClose={() => setDetailId(null)}
            />
          </aside>
        )}
      </div>

      <AccountPasswordModal
        isOpen={passwordDialog !== null}
        accountId={passwordDialog?.accountId ?? null}
        onSubmit={submitPassword}
        onClose={() => setPasswordDialog(null)}
      />
    </div>
  );
}

