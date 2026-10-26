import { usePollingRefresh } from '../../../infrastructure/hooks/usePollingRefresh';
import React, { useEffect, useState, useRef } from 'react';
import { useSelector , shallowEqual } from 'react-redux';
import { fetchDetailedBrokerStatus, fetchBrokerList } from '../brokerSlice';
import { createRateTracker } from '../rateTracker';
import MonitoringSettingsPopover from '../../user/components/MonitoringSettingsPopover';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Card } from '../../../components/ds/layout/Card';
import { Table } from '../../../components/ds/layout/Table';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { useCM } from '../../../constants/useCM';
import { jobElapsedSeconds, formatElapsed } from '../jobElapsed';

// Stable fallback reference — `status.data?.asinfo || []` would otherwise
// hand the asInfo-rate-tracking effect below a brand-new array on every
// render for as long as no status has loaded yet, which never lets that
// effect's dependency settle (it keeps seeing a "changed" array) and spins
// the component in a render/effect loop until real data arrives.
const EMPTY_LIST = [];

const Component = function BrokerStatus({ hostUid, brokerName }) {
  const CM = useCM();

  const { detailedStatus } = useSelector((state) => state.broker, shallowEqual);
  const { preferences } = useSelector((state) => state.user, shallowEqual);
  const status = detailedStatus[brokerName] || { data: {}, loading: false, error: null };

  // Basic Information below is read from lastKnownBrokerFromList, fed only
  // by THIS component's own fetchBrokerList dispatches — deliberately not
  // from the shared state.broker.brokersByHost[hostUid] selector. Even now
  // that slice is scoped per host, fetchBrokerList.rejected still clears
  // brokersByHost[hostUid] to [] on failure (shared behavior other callers
  // may rely on, not changed here), and this component has no error channel
  // of its own for that fetch — status.error is tied to
  // fetchDetailedBrokerStatus only. Keeping our own last-seen value (below)
  // instead of reading the store directly lets Basic Information keep
  // showing it, with a small stale-data notice, instead of silently
  // collapsing to "—"/"0"/"OFF" (which reads as genuinely idle rather than
  // as a failed refresh).
  //
  // Plain React state, not a ref: a ref mutation alone doesn't guarantee a
  // re-render, and piggybacking on setBrokerListStale's re-render wouldn't
  // work either — React bails out of re-rendering when a useState setter is
  // called with the same value as before (e.g. two back-to-back successful
  // polls both call setBrokerListStale(false)), which would leave freshly
  // fetched data sitting in a ref without ever reaching the screen.
  const [brokerListStale, setBrokerListStale] = useState(false);
  const [lastKnownBrokerFromList, setLastKnownBrokerFromList] = useState(null);

  const { isManualRefreshing, lastRefreshed, handleRefresh } = usePollingRefresh({
    hostUid,
    tabId: `broker_status:${hostUid}:${brokerName}`,
    pollingIntervalSeconds: preferences.brokerStatusInterval,
    // "Basic Information" below always comes from the broker LIST fetch
    // (see basicInfo), which the global dashboard interval skips while this
    // tab is focused (MonitoringProvider's host:/db:-only tab gate). Fetch
    // it here too, or Basic Information stays frozen at whatever it was
    // when this tab became active, even after a manual refresh.
    //
    // Only the plain list fields are needed here (not qps/tps), so skip the
    // per-broker status enrichment fetchBrokerList otherwise does for every
    // broker on this host — this tab doesn't use that data, and polling it
    // on every tick would multiply this tab's request count by N brokers.
    onFetch: (silent) => async (dispatch) => {
      const [, listOutcome] = await Promise.allSettled([
        dispatch(fetchDetailedBrokerStatus({ hostUid, brokerName, isBackground: silent })),
        dispatch(fetchBrokerList({ hostUid, isBackground: silent, skipStatusEnrichment: true })).unwrap(),
      ]);
      if (listOutcome.status === 'fulfilled') {
        const match = listOutcome.value?.find((b) => b.name === brokerName);
        if (match) setLastKnownBrokerFromList(match);
        setBrokerListStale(false);
      } else {
        setBrokerListStale(true);
      }
    }
  });

  const asInfo = status.data?.asinfo || EMPTY_LIST;
  const jobInfo = status.data?.jobinfo || EMPTY_LIST;

  // as_num_query/as_num_tran are per-AS lifetime totals, not a rate — derive
  // a real per-second value from the delta between consecutive polls, merged
  // back onto each row so the table's sort-by-column still works correctly.
  //
  // Must run unconditionally, before the loading/error early returns below —
  // React error #300 otherwise (this component toggles between those returns
  // and the full render on every refresh, which would change the number of
  // hooks called from one render to the next).
  const rateTrackerRef = useRef(createRateTracker());
  const [asInfoWithRates, setAsInfoWithRates] = useState([]);
  useEffect(() => {
    setAsInfoWithRates(asInfo.map((as) => ({
      ...as,
      qps: rateTrackerRef.current(`${as.as_id}:qps`, as.as_num_query),
      tps: rateTrackerRef.current(`${as.as_id}:tps`, as.as_num_tran),
    })));
  }, [asInfo]);

  /* Loading */
  if (status.loading && !status.data?.asinfo) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-white dark:bg-bk-main h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-14 text-slate-400 font-medium">{CM.loadingBrokerStatus}</span>
        </div>
      </div>
    );
  }

  /* Error */
  if (status.error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-white dark:bg-bk-main h-full">
        <div className="max-w-sm w-full">
          <InfoBanner variant="danger" title={CM.failedToLoadStatus} icon="error_outline">
            {status.error}
          </InfoBanner>
        </div>
      </div>
    );
  }

  // getbrokerstatus's response (ts2_get_broker_status in CMS) only ever
  // carries bname/time/asinfo/jobinfo — there's no "binfo" in any CMS task,
  // so basic broker info always comes from the broker list instead (kept
  // fresh by this tab's own onFetch above, which populates
  // lastKnownBrokerFromList directly from its own request's result).
  const brokerFromList = lastKnownBrokerFromList || {};
  const basicInfo = {
    pid: brokerFromList.pid,
    port: brokerFromList.port,
    job_queue: brokerFromList.jq,
    auto_add_as: brokerFromList.auto,
    sql_log_mode: brokerFromList.sqll,
    long_transaction_time: brokerFromList.long_tran_time,
    long_query_time: brokerFromList.long_query_time,
  };

  /* Table Columns Definitions */
  const asColumns = [
    { header: CM.idLabel,  accessor: 'as_id',        width: '60px',  render: (v) => <span className="font-mono text-amber-600 dark:text-amber-400">{v}</span> },
    { header: CM.pid, accessor: 'as_pid',       width: '80px',  render: (v) => <span className="font-mono">{v}</span> },
    { header: CM.qps, accessor: 'qps', width: '60px',  render: (v) => <span className="font-mono">{v?.toFixed(1) ?? '—'}</span> },
    { header: CM.tps, accessor: 'tps', width: '60px',  render: (v) => <span className="font-mono">{v?.toFixed(1) ?? '—'}</span> },
    // Not a per-AS CMS field — getbrokerstatus's asinfo has no as_port at
    // all (every AS under a broker shares that broker's own listen port),
    // so this column just shows the broker's port for every row.
    { header: CM.port, accessor: 'as_port', width: '80px', render: () => <span className="font-mono">{basicInfo.port ?? '—'}</span> },
    { header: CM.memory, accessor: 'as_psize', width: '100px', render: (v) => <span className="font-mono">{(parseInt(v) / 1024).toFixed(1)} KB</span> },
    { 
      header: CM.status, 
      accessor: 'as_status', 
      width: '100px', 
      render: (v) => {
        const isActive = v && v !== 'IDLE' && v !== 'OFF';
        return <StatusBadge label={v || 'IDLE'} variant={isActive ? 'emerald' : 'slate'} pulse={isActive} />;
      }
    },
    { header: CM.database, accessor: 'as_dbname', render: (v) => <span className="text-amber-600/80 dark:text-amber-500/70 font-mono">{v || '—'}</span> },
    { header: CM.lastAccess, accessor: 'as_lat', render: (v) => <span className="text-slate-400 dark:text-slate-600 text-13">{v || '—'}</span> },
    { header: CM.clientIp, accessor: 'as_client_ip', render: (v) => <span className="font-mono">{v || '—'}</span> },
  ];

  const jobColumns = [
    { header: CM.jobId, accessor: 'job_id', width: '100px', render: (v) => <span className="font-mono">{v}</span> },
    { header: CM.priority, accessor: 'job_priority', width: '100px', render: (v) => <span className="font-mono">{v}</span> },
    { header: CM.address, accessor: 'job_ip', render: (v) => <span className="font-mono text-amber-600/80 dark:text-amber-500/70">{v}</span> },
    // job_time is the receive time of day, not a duration — see jobElapsed.js.
    {
      header: CM.elapsed, accessor: 'job_time', width: '100px',
      render: (v) => (
        <span className="font-mono text-rose-500" title={v ? CM.jobReceivedAt(v) : undefined}>
          {formatElapsed(jobElapsedSeconds(status.data?.time, v)) ?? '—'}
        </span>
      ),
    },
    { header: CM.request, accessor: 'job_request', render: (v) => <div className="max-w-xs truncate text-slate-500 dark:text-slate-500 font-mono">{v}</div> },
  ];

  const asActiveBadge = (
    <span className="inline-flex items-center gap-1.5 text-12 font-bold text-emerald-600 dark:text-emerald-400 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full animate-in fade-in transition duration-300">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      {CM.activeCount(asInfo.length)}
    </span>
  );

  const jobQueuedBadge = (
    <span className="inline-flex items-center gap-1.5 text-12 font-bold text-amber-600 dark:text-amber-400 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full animate-in fade-in transition duration-300">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      {CM.queuedCount(jobInfo.length)}
    </span>
  );

  // Shown on the Basic Information card when the broker-list refresh (not
  // the detailed-status one, which has its own big danger banner above)
  // failed — distinct from that banner since the values below aren't wrong,
  // just possibly outdated.
  const basicInfoStaleBadge = (
    <span
      title={CM.basicInfoStaleMsg}
      className="inline-flex items-center gap-1.5 text-9 font-bold text-amber-600 dark:text-amber-400 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full animate-in fade-in transition duration-300"
    >
      <Icon name="warning" size="12px" />
      {CM.staleDataBadge}
    </span>
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-bk-main overflow-hidden">

      {/* ── Top bar ── */}
      <header className="h-14 px-6 border-b border-slate-100 dark:border-white/4 flex items-center justify-between shrink-0 sticky top-0 z-20 bg-white dark:bg-bk-side/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 shadow-sm">
            <Icon name="hub" size="sm" weight={300} className="text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-15 font-bold text-slate-800 dark:text-slate-100 tracking-tight leading-tight">{brokerName}</span>
              <div className={`px-2 py-0.5 rounded-full border flex items-center gap-1.5 shrink-0 transition-all duration-300 ${preferences.brokerStatusInterval > 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}>
                <div className={`w-1 h-1 rounded-full ${preferences.brokerStatusInterval > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className={`text-11 font-bold ${preferences.brokerStatusInterval > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {preferences.brokerStatusInterval > 0 ? CM.live : CM.paused}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500/60" />
              <span className="text-12 text-slate-400 font-mono tracking-tight leading-none">{CM.brokerStatus}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-12 text-slate-400 font-mono tracking-tight hidden lg:block mr-2">
            {CM.syncedAt(lastRefreshed.toLocaleTimeString())}
          </span>

          <button
            onClick={() => handleRefresh(false)}
            disabled={status.loading || isManualRefreshing}
            className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all active:scale-[0.98]
              ${(status.loading || isManualRefreshing)
                ? 'bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-white/5 cursor-not-allowed opacity-50'
                : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-amber-500 hover:border-amber-500/50 hover:bg-white dark:hover:bg-white/5 shadow-xs'}`}
            title={CM.refreshBrokerStatus}
          >
            <Icon name="refresh" size="19px" className={(status.loading || isManualRefreshing) ? 'animate-spin' : ''} />
          </button>

          <div className="w-[1px] h-4 bg-slate-200 dark:bg-white/10 mx-0.5" />
          <MonitoringSettingsPopover />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* ── Basic Info ── */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <Icon name="info" size="sm" weight={300} className="text-amber-500" />
              <span className="text-14 font-bold">{CM.basicInformation}</span>
            </div>
          }
          rightContent={() => brokerListStale && basicInfoStaleBadge}
          bodyClassName="p-0"
          collapsible
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 text-left">
            {[
              { label: CM.pid,           value: basicInfo.pid                           || '—',    accent: 'emerald' },
              { label: CM.port,          value: basicInfo.port                          || '—',    accent: 'amber'   },
              { label: CM.jobQueue,      value: basicInfo.job_queue                     ?? '0',    accent: 'slate'   },
              { label: CM.autoAddAS,     value: basicInfo.auto_add_as                  || 'OFF',  badge: true       },
              { label: CM.sqlLogMode,    value: basicInfo.sql_log_mode                 || 'OFF',  badge: true       },
              { label: CM.longTranLabel, value: `${basicInfo.long_transaction_time      || '0'}s`, accent: 'slate'   },
              { label: CM.longQueryLabel,value: `${basicInfo.long_query_time            || '0'}s`, accent: 'slate'   },
            ].map((m, i, arr) => {
              const isActive = m.badge && m.value && m.value !== 'IDLE' && m.value !== 'OFF';
              const accentBar = m.accent === 'emerald'
                ? 'bg-emerald-500'
                : m.accent === 'amber'
                ? 'bg-amber-500'
                : 'bg-slate-300 dark:bg-slate-700';
              return (
                <div
                  key={m.label}
                  className={`relative flex flex-col gap-2 px-4 py-3.5 min-w-0
                    ${i < arr.length - 1 ? 'border-r border-slate-100 dark:border-white/5' : ''}
                  `}
                >
                  <div className={`absolute top-0 left-4 right-4 h-[2px] rounded-b-full opacity-30 ${accentBar || 'bg-slate-300 dark:bg-slate-700'}`} />
                  <span className="text-11 font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.12em] leading-none">
                    {m.label}
                  </span>
                  {m.badge ? (
                    <span className={`inline-flex items-center gap-1.5 self-start px-2 py-1 rounded-md text-13 font-bold uppercase tracking-wide border
                      ${isActive
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                        : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/4 dark:text-slate-400 dark:border-white/[0.07]'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {m.value}
                    </span>
                  ) : (
                    <span className={`font-mono text-17 font-bold leading-none
                      ${m.accent === 'emerald' ? 'text-emerald-500 dark:text-emerald-400'
                      : m.accent === 'amber'   ? 'text-amber-500 dark:text-amber-400'
                      : 'text-slate-800 dark:text-slate-200'}`}
                    >
                      {m.value}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── Application Servers ── */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <Icon name="dns" size="sm" weight={300} className="text-amber-500" />
              <span className="text-14 font-bold">{CM.applicationServers}</span>
            </div>
          }
          rightContent={(isCollapsed) => isCollapsed && asActiveBadge}
          bodyClassName="p-0"
          collapsible
        >
          <Table
            columns={asColumns}
            data={asInfoWithRates}
            sortable
            zebra
            emptyMessage={CM.noAppServersActiveMsg}
          />
        </Card>

        {/* ── Job Queue ── */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <Icon name="queue" size="sm" weight={300} className="text-amber-500" />
              <span className="text-14 font-bold">{CM.jobQueue}</span>
            </div>
          }
          rightContent={(isCollapsed) => isCollapsed && jobInfo.length > 0 && jobQueuedBadge}
          bodyClassName="p-0"
          collapsible
        >
          <Table
            columns={jobColumns}
            data={jobInfo}
            sortable
            zebra
            emptyMessage={CM.jobQueueEmptyMsg}
          />
        </Card>
      </div>
    </div>
  );
}

export default React.memo(Component);
