import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ds/foundation/Button';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { Pagination } from '../../../components/ds/feedback/Pagination';
import { useCM } from '../../../constants/useCM';
import { requestErrorText } from '../../../infrastructure/errors/serverErrorText';
import { useLatestRef } from '../../../infrastructure/hooks/useLatestRef';
import { useResetEffect } from '../../../infrastructure/hooks/useResetEffect';
import { adminApi } from '../adminApi';
import { fetchAllEntries } from '../fetchAllEntries';
import { formatTime } from '../accountView';
import {
  API_LOG_CATEGORIES,
  API_LOG_RANGES,
  apiActionText,
  apiCategoryText,
  apiLogCsv,
  apiTargetText,
  bucketLabel,
  formatDuration,
  niceMax,
  rangeBounds,
} from '../apiLogView';
import AdminPageHeader from './AdminPageHeader';

export const API_LOG_PAGE_SIZE = 50;
const BOM = String.fromCharCode(0xfeff);
const EMPTY = { entries: [], total: 0, summary: null };

const CARD = 'rounded-2xl border border-slate-200/70 dark:border-white/6 bg-white dark:bg-background-dark';
const TH = 'bg-slate-50/60 dark:bg-white/2 px-4 py-2.5 text-left text-11 font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap';
const TD = 'px-4 py-3 text-13 whitespace-nowrap truncate';

/** Column widths, shared by the column names and the rows, which are separate tables. */
function Columns() {
  return (
    <colgroup>
      <col className="w-[210px]" />
      <col className="w-[14%]" />
      <col className="w-[20%]" />
      <col />
      <col className="w-[24%]" />
      <col className="w-[100px]" />
    </colgroup>
  );
}

function Stat({ label, value, tone, testId }) {
  const color = tone === 'danger' ? 'text-rose-500' : tone === 'warning' ? 'text-amber-500' : 'text-slate-800 dark:text-slate-100';
  return (
    <div className={`${CARD} px-4 py-3`} data-testid={testId}>
      <p className="text-12 text-slate-400">{label}</p>
      <p className={`text-20 font-bold tabular-nums ${color}`}>{(value ?? 0).toLocaleString()}</p>
    </div>
  );
}

const BUCKET_MS = { hour: 60 * 60 * 1000, day: 24 * 60 * 60 * 1000 };

/** Actions per hour or day: failed stacked on OK, newest on the right. */
function ActivityChart({ summary }) {
  const CM = useCM();
  const [hover, setHover] = useState(null);
  const buckets = summary?.buckets ?? [];
  const top = niceMax(Math.max(0, ...buckets.map((b) => b.ok + b.failed)));
  const pct = (n) => `${(n / top) * 100}%`;
  // About six time labels, counted back from the newest bar, which says "Now".
  const every = Math.max(1, Math.ceil(buckets.length / 6));
  const last = buckets.length - 1;
  const span = BUCKET_MS[summary?.bucket] ?? BUCKET_MS.hour;
  const hovered = hover !== null ? buckets[hover] : null;

  return (
    <div className={`${CARD} px-4 pt-3 pb-2`} data-testid="admin-api-log-chart">
      <div className="flex items-center justify-between mb-3">
        <p className="text-13 font-bold text-slate-600 dark:text-slate-300">
          {summary.bucket === 'day' ? CM.apiLogPerDay : CM.apiLogPerHour}
        </p>
        <div className="flex gap-4 text-12 text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-600" />{CM.apiLogOk}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />{CM.apiLogFailed}</span>
        </div>
      </div>

      <div className="flex gap-2">
        {/* Scale: the top, the middle and zero. */}
        <div className="relative w-8 h-32 shrink-0 text-11 text-slate-400 tabular-nums text-right">
          <span className="absolute right-0 -top-2">{top.toLocaleString()}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2">{(top / 2).toLocaleString()}</span>
          <span className="absolute right-0 -bottom-2">0</span>
        </div>

        <div className="relative flex-1 min-w-0">
          <div className="relative h-32" onMouseLeave={() => setHover(null)}>
            <div className="absolute inset-x-0 top-0 border-t border-slate-100 dark:border-white/5" />
            <div className="absolute inset-x-0 top-1/2 border-t border-slate-100 dark:border-white/5" />
            <div className="absolute inset-x-0 bottom-0 border-t border-slate-300 dark:border-white/15" />
            <div className="absolute inset-0 flex">
              {buckets.map((b, i) => (
                <div
                  key={b.start}
                  data-testid="admin-api-log-bar"
                  className={`relative flex-1 h-full flex flex-col justify-end items-center ${hover === i ? 'bg-slate-100/70 dark:bg-white/4' : ''}`}
                  onMouseEnter={() => setHover(i)}
                >
                  <div className="w-full max-w-6 px-[1px] flex flex-col justify-end h-full">
                    {b.failed > 0 && (
                      <div className="bg-rose-500 rounded-t" style={{ height: pct(b.failed) }} />
                    )}
                    {b.failed > 0 && b.ok > 0 && <div className="h-[2px] shrink-0" />}
                    {b.ok > 0 && (
                      <div className={`bg-sky-600 ${b.failed > 0 ? '' : 'rounded-t'}`} style={{ height: pct(b.ok) }} />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {hovered && (
              <div
                role="tooltip"
                className="absolute -top-2 z-10 pointer-events-none -translate-y-full px-3 py-2 rounded-lg bg-white dark:bg-[#1A1C1E] border border-slate-200 dark:border-white/10 shadow-lg text-12 whitespace-nowrap"
                style={hover > buckets.length / 2
                  ? { right: `${((last - hover) / buckets.length) * 100}%` }
                  : { left: `${(hover / buckets.length) * 100}%` }}
              >
                <p className="font-bold text-slate-700 dark:text-slate-200 mb-1">
                  {bucketLabel(hovered.start, summary.bucket)}
                  {summary.bucket === 'hour' && ` – ${bucketLabel(new Date(Date.parse(hovered.start) + span).toISOString(), 'hour')}`}
                </p>
                {hovered.ok + hovered.failed === 0 ? (
                  <p className="text-slate-400">{CM.apiLogNoActionsShort}</p>
                ) : (
                  <>
                    <p className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><span className="w-2 h-2 rounded-sm bg-sky-600" />{CM.apiLogOk} <span className="ml-auto pl-3 font-bold tabular-nums">{hovered.ok}</span></p>
                    <p className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><span className="w-2 h-2 rounded-sm bg-rose-500" />{CM.apiLogFailed} <span className="ml-auto pl-3 font-bold tabular-nums">{hovered.failed}</span></p>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex mt-1.5 h-4">
            {buckets.map((b, i) => {
              const fromEnd = last - i;
              const label = i === last ? CM.apiLogNow : fromEnd % every === 0 && fromEnd >= every / 2 ? bucketLabel(b.start, summary.bucket) : '';
              return (
                <span key={b.start} className={`relative flex-1 text-11 tabular-nums ${i === last ? 'text-slate-600 dark:text-slate-300 font-bold' : 'text-slate-400'}`}>
                  {label && <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{label}</span>}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** User Administration > API Log: what people did, with totals and a chart for the range. */
export default function ApiLogSection({ reloadKey }) {
  const CM = useCM();
  const [range, setRange] = useState('24h');
  const [user, setUser] = useState('');
  const [category, setCategory] = useState('');
  const [result, setResult] = useState('');
  const [target, setTarget] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef(null);

  const filter = useCallback(
    () => ({
      ...rangeBounds(range),
      user: user.trim() || undefined,
      category: category || undefined,
      result: result || undefined,
      target: target.trim() || undefined,
      tz: new Date().getTimezoneOffset(),
    }),
    [range, user, category, result, target]
  );

  // CM: only the error's wording, not a reason to read again.
  const cmRef = useLatestRef(CM);
  // Each new read (filter, page, reload) shows as loading, with no old error.
  useResetEffect(() => {
    setLoading(true);
    setError(null);
  }, [filter, page, reloadKey]);
  useEffect(() => {
    let live = true;
    adminApi
      .queryApiLog({ ...filter(), limit: API_LOG_PAGE_SIZE, offset: (page - 1) * API_LOG_PAGE_SIZE })
      .then((res) => {
        if (!live) return;
        setData({ entries: res?.entries ?? [], total: res?.total ?? 0, summary: res?.summary ?? null });
        // A new page starts at its first row: bring the table's top back if it was scrolled past.
        const card = cardRef.current;
        if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView?.({ block: 'start' });
      })
      .catch((err) => live && setError(requestErrorText(err, cmRef.current)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [filter, page, reloadKey, cmRef]);

  const set = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const entries = await fetchAllEntries(adminApi.queryApiLog, filter());
      const blob = new Blob([BOM + apiLogCsv(entries, CM)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cwm-api-log-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const summary = data.summary;
  const totalPages = Math.max(1, Math.ceil(data.total / API_LOG_PAGE_SIZE));

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={CM.adminSectionApiLog}
        action={
          <div className="flex items-center gap-2">
            <div className="w-44">
              <Select
                testId="admin-api-log-range"
                value={range}
                onChange={set(setRange)}
                options={API_LOG_RANGES.map((r) => ({ value: r.value, label: r.label(CM) }))}
              />
            </div>
            <Button
              data-testid="admin-api-log-export"
              variant="outline"
              icon="download"
              loading={exporting}
              disabled={exporting || data.total === 0}
              onClick={exportCsv}
            >
              {CM.exportCsvBtn}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat testId="admin-api-log-stat-actions" label={CM.apiLogActionsStat} value={summary?.actions} />
        <Stat testId="admin-api-log-stat-failed" label={CM.apiLogFailedStat} value={summary?.failed} tone={summary?.failed ? 'danger' : undefined} />
        <Stat testId="admin-api-log-stat-sign-ins" label={CM.apiLogFailedSignInsStat} value={summary?.failedSignIns} tone={summary?.failedSignIns ? 'warning' : undefined} />
        <Stat testId="admin-api-log-stat-users" label={CM.apiLogActiveUsersStat} value={summary?.activeUsers} />
      </div>

      {summary && <ActivityChart summary={summary} />}

      {/* One page scroll. The filters and column names are one sticky block, so no rows show between them. */}
      <div ref={cardRef} className={CARD}>
        <div className="sticky top-0 z-20 rounded-t-2xl bg-white dark:bg-background-dark">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 py-4 border-b border-slate-100 dark:border-white/5">
          <Input data-testid="admin-api-log-user" label={CM.apiLogUser} icon="person" value={user} onChange={set(setUser)} />
          <Select
            label={CM.apiLogCategory}
            testId="admin-api-log-category"
            value={category}
            onChange={set(setCategory)}
            options={[{ value: '', label: CM.apiLogAnyCategory }, ...API_LOG_CATEGORIES.map((c) => ({ value: c, label: apiCategoryText(c, CM) }))]}
          />
          <Select
            label={CM.apiLogResult}
            testId="admin-api-log-result"
            value={result}
            onChange={set(setResult)}
            options={[
              { value: '', label: CM.apiLogAnyResult },
              { value: 'ok', label: CM.apiLogOk },
              { value: 'failed', label: CM.apiLogFailed },
            ]}
          />
          <Input data-testid="admin-api-log-target" label={CM.apiLogTarget} icon="dns" value={target} onChange={set(setTarget)} />
        </div>
        <table className="w-full table-fixed border-b border-slate-100 dark:border-white/5">
          <Columns />
          <thead>
            <tr>
              <th className={TH}>{CM.apiLogTime}</th>
              <th className={TH}>{CM.apiLogUser}</th>
              <th className={TH}>{CM.apiLogAction}</th>
              <th className={TH}>{CM.apiLogTarget}</th>
              <th className={TH}>{CM.apiLogResult}</th>
              <th className={`${TH} text-right`}>{CM.apiLogDuration}</th>
            </tr>
          </thead>
        </table>
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-3 m-4 px-4 py-3 bg-rose-500/5 border border-rose-500/15 rounded-xl">
            <Icon name="error_outline" size="sm" weight={300} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-13 text-rose-500 font-medium flex-1 leading-relaxed">{error}</p>
          </div>
        )}

        {/* No horizontal scroll: it would stop the column names sticking. Long cells are cut short. */}
        <div data-testid="admin-api-log-table">
          <table className="w-full table-fixed" aria-label={CM.adminSectionApiLog}>
            <Columns />
            <tbody>
              {loading && data.entries.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center"><div className="mx-auto h-4 w-32 bg-slate-100 dark:bg-white/5 rounded animate-pulse" /></td></tr>
              ) : data.entries.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-14 text-slate-400">{CM.noApiLog}</td></tr>
              ) : (
                data.entries.map((e) => (
                  <tr key={`${e.at}-${e.requestId}`} className="border-b border-slate-100 last:border-b-0 dark:border-white/4" data-testid="admin-api-log-row">
                    <td className={`${TD} text-slate-500 tabular-nums`}>{formatTime(e.at)}</td>
                    <td className={`${TD} font-bold text-slate-700 dark:text-slate-200`}>{e.user ?? '—'}</td>
                    <td className={TD} title={`${e.method} ${e.path}`}>{apiActionText(e, CM)}</td>
                    <td className={`${TD} text-slate-500`} title={apiTargetText(e) || undefined}>{apiTargetText(e) || '—'}</td>
                    <td className={TD}>
                      {e.ok ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">{CM.apiLogOk}</span>
                      ) : (
                        <span className="flex items-center gap-2 min-w-0" title={e.error ?? e.errorCode ?? ''}>
                          <span className="text-rose-500 font-bold">{CM.apiLogFailed}</span>
                          <span className="text-12 text-slate-400 truncate">{e.error ?? e.errorCode ?? e.status}</span>
                        </span>
                      )}
                    </td>
                    <td className={`${TD} text-right text-slate-400 tabular-nums`}>{formatDuration(e.durationMs)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 dark:border-white/5">
          <span className="text-12 text-slate-400" data-testid="admin-api-log-count">{CM.activityCount(data.total)}</span>
          {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />}
        </div>
      </div>
    </div>
  );
}
