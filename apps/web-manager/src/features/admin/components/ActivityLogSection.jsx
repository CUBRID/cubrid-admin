import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../../components/ds/foundation/Button';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { Pagination } from '../../../components/ds/feedback/Pagination';
import { useCM } from '../../../constants/useCM';
import { requestErrorText } from '../../../infrastructure/errors/serverErrorText';
import { adminApi } from '../adminApi';
import AdminPageHeader from './AdminPageHeader';
import { auditActionText, auditCsv, auditDetailText, dayBoundary, formatTime } from '../accountView';

export const ACTIVITY_PAGE_SIZE = 50;
/** What one export reads at most (the server's largest page). */
const EXPORT_LIMIT = 5000;
/** Lets Excel read the CSV as UTF-8, so non-English ids show correctly. */
const BOM = String.fromCharCode(0xfeff);

const ACTIONS = ['create', 'delete', 'disable', 'enable', 'reset_password', 'grant_admin', 'revoke_admin', 'sign_out', 'set_registration'];
const TH = 'px-4 py-2.5 text-left text-11 font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap';
const TD = 'px-4 py-3 text-13 whitespace-nowrap';
const ACTION_ICONS = {
  create: 'person_add', delete: 'delete', disable: 'block', enable: 'check_circle',
  reset_password: 'lock_reset', grant_admin: 'add_moderator', revoke_admin: 'remove_moderator',
  sign_out: 'logout', set_registration: 'how_to_reg',
};

/** The admin audit log: filters, pages, and a CSV of everything that matches. */
export default function ActivityLogSection({ reloadKey }) {
  const CM = useCM();
  const [actor, setActor] = useState('');
  const [target, setTarget] = useState('');
  const [action, setAction] = useState('');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ entries: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const filter = useCallback(
    () => ({
      actor: actor.trim() || undefined,
      target: target.trim() || undefined,
      action: action || undefined,
      from: dayBoundary(fromDay),
      to: dayBoundary(toDay, true),
    }),
    [actor, target, action, fromDay, toDay]
  );

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    adminApi
      .queryAudit({ ...filter(), limit: ACTIVITY_PAGE_SIZE, offset: (page - 1) * ACTIVITY_PAGE_SIZE })
      .then((res) => live && setResult({ entries: res?.entries ?? [], total: res?.total ?? 0 }))
      .catch((err) => live && setError(requestErrorText(err, CM)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // CM: only the error's wording, not a reason to read again.
  }, [filter, page, reloadKey]);

  // A new filter starts from the first page.
  const set = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await adminApi.queryAudit({ ...filter(), limit: EXPORT_LIMIT, offset: 0 });
      const blob = new Blob([BOM + auditCsv(res?.entries ?? [], CM)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cwm-admin-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(requestErrorText(err, CM));
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(result.total / ACTIVITY_PAGE_SIZE));

  return (
    <div>
      <AdminPageHeader
        title={CM.adminSectionActivity}
        action={
          <Button
            data-testid="admin-activity-export"
            variant="outline"
            icon="download"
            loading={exporting}
            disabled={exporting || result.total === 0}
            onClick={exportCsv}
          >
            {CM.exportCsvBtn}
          </Button>
        }
      />

      <div className="rounded-2xl border border-slate-200/70 dark:border-white/6 bg-white dark:bg-background-dark overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 px-4 py-4 border-b border-slate-100 dark:border-white/5">
          <Input data-testid="admin-activity-actor" label={CM.activityActor} icon="shield_person" value={actor} onChange={set(setActor)} placeholder={CM.activityActorPlaceholder} />
          <Input data-testid="admin-activity-target" label={CM.activityTarget} icon="person" value={target} onChange={set(setTarget)} placeholder={CM.activityTargetPlaceholder} />
          <Select
            label={CM.activityAction}
            testId="admin-activity-action"
            value={action}
            onChange={set(setAction)}
            options={[{ value: '', label: CM.anyAction }, ...ACTIONS.map((a) => ({ value: a, label: auditActionText(a, CM) }))]}
          />
          <Input data-testid="admin-activity-from" type="date" label={CM.activityFrom} value={fromDay} onChange={set(setFromDay)} />
          <Input data-testid="admin-activity-to" type="date" label={CM.activityTo} value={toDay} onChange={set(setToDay)} />
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-3 m-4 px-4 py-3 bg-rose-500/5 border border-rose-500/15 rounded-xl">
            <Icon name="error_outline" size="sm" weight={300} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-13 text-rose-500 font-medium flex-1 leading-relaxed">{error}</p>
          </div>
        )}

        <div className="overflow-x-auto" data-testid="admin-activity-table">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/60 dark:bg-white/2">
                <th className={TH}>{CM.activityTime}</th>
                <th className={TH}>{CM.activityActor}</th>
                <th className={TH}>{CM.activityAction}</th>
                <th className={TH}>{CM.activityTarget}</th>
                <th className={TH}>{CM.activityDetail}</th>
              </tr>
            </thead>
            <tbody>
              {loading && result.entries.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center"><div className="mx-auto h-4 w-32 bg-slate-100 dark:bg-white/5 rounded animate-pulse" /></td></tr>
              ) : result.entries.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-14 text-slate-400">{CM.noActivity}</td></tr>
              ) : (
                result.entries.map((e, i) => (
                  <tr key={`${e.at}-${i}`} className="border-b border-slate-100 last:border-b-0 dark:border-white/4">
                    <td className={`${TD} text-slate-500 tabular-nums`}>{formatTime(e.at)}</td>
                    <td className={`${TD} font-bold text-slate-700 dark:text-slate-200`}>{e.actor}</td>
                    <td className={TD}>
                      <span className="inline-flex items-center gap-2">
                        <Icon name={ACTION_ICONS[e.action] ?? 'history'} size="15px" weight={300} className="text-slate-400" />
                        {auditActionText(e.action, CM)}
                      </span>
                    </td>
                    <td className={`${TD} text-slate-600 dark:text-slate-300`}>{e.target ?? '—'}</td>
                    <td className={`${TD} text-slate-500`}>{auditDetailText(e, CM)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 dark:border-white/5">
          <span className="text-12 text-slate-400" data-testid="admin-activity-count">{CM.activityCount(result.total)}</span>
          {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />}
        </div>
      </div>
    </div>
  );
}
