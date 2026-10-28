import { usePollingRefresh } from '../../../infrastructure/hooks/usePollingRefresh';
import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch , shallowEqual } from 'react-redux';
import { fetchBrokerList } from '../../broker/brokerSlice';
import { openTab } from '../../layout/layoutSlice';
import MonitoringSettingsPopover from '../../user/components/MonitoringSettingsPopover';
import { Card } from '../../../components/ds/layout/Card';
import { Table } from '../../../components/ds/layout/Table';
import { Icon } from '../../../components/ds/foundation/Icon';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { FetchEmptyState } from '../../../components/ds/feedback/FetchEmptyState';
import { useCM } from '../../../constants/useCM';

const Component = function Brokers({ hostUid, isSection = false }) {
  const CM = useCM();
  const dispatch = useDispatch();
  // Broker list is fetched into this component's own state (not the shared
  // `state.broker.brokers` slice) so that multiple simultaneously-open
  // dashboard/broker tabs for different hosts don't clobber each other.
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const { preferences } = useSelector((state) => state.user, shallowEqual);
  // Embedded in the host dashboard (host:<uid> tab), this component is never
  // the active tab itself, so its own polling below never runs. The host
  // dashboard (ServerContent.jsx) already fetches this host's broker list into
  // brokersByHost on every tick — show that instead of fetching it a second
  // time (a second fetch also doubles the qps/tps rate samples).
  const sharedBrokers = useSelector((state) => state.broker.brokersByHost[hostUid]);
  const sharedLoading = useSelector((state) => !!state.broker.loadingByHost[hostUid]);
  const sharedFailed = useSelector((state) => !!state.broker.brokerListFailedByHost[hostUid]);

  useEffect(() => {
    setBrokers([]);
    setLoading(false);
    setHasLoadedOnce(false);
    setLoadFailed(false);
  }, [hostUid]);

  // brokersByHost[hostUid] is deleted when focus leaves this host
  // (resetBrokerState) and blanked when a fetch fails; keep showing the last
  // list until the next successful fetch.
  useEffect(() => {
    if (isSection && Array.isArray(sharedBrokers) && !sharedFailed) {
      setBrokers(sharedBrokers);
      setHasLoadedOnce(true);
    }
  }, [isSection, sharedBrokers, sharedFailed]);

  const { isManualRefreshing, lastRefreshed, handleRefresh } = usePollingRefresh({
    hostUid,
    tabId: `brokers_status:${hostUid}`,
    pollingIntervalSeconds: preferences.brokerStatusInterval,
    onFetch: () => async (dispatch) => {
      if (isSection) return;
      setLoading(true);
      try {
        const result = await dispatch(fetchBrokerList(hostUid)).unwrap();
        setBrokers(result);
        setLoadFailed(false);
      } catch (err) {
        // Keep the last list; only an empty table shows the failure.
        setLoadFailed(true);
        throw err;
      } finally {
        setLoading(false);
        setHasLoadedOnce(true);
      }
    }
  });

  const columns = React.useMemo(() => [
    {
      header: CM.name,
      accessor: 'name',
      render: (val) => <span className="font-mono text-14 font-semibold text-slate-700 dark:text-slate-200">{val}</span>
    },
    {
      header: CM.status,
      accessor: 'state',
      render: (val) => (
        <StatusBadge 
          label={val} 
          variant={val === 'ON' ? 'emerald' : 'rose'} 
          pulse={val === 'ON'} 
        />
      )
    },
    { header: CM.pid,  accessor: 'pid',         render: (val) => <span className="font-mono text-14 text-slate-500">{val}</span> },
    { header: CM.port, accessor: 'port', render: (val) => <span className="font-mono text-14 text-slate-500">{val}</span> },
    { header: CM.asLabel, accessor: 'as', render: (val) => <span className="font-mono text-14">{val}</span> },
    { header: CM.jqLabel, accessor: 'jq', render: (val) => <span className="font-mono text-14">{val}</span> },
    { header: CM.reqLabel, accessor: 'req', render: (val) => <span className="font-mono text-14 font-semibold">{val}</span> },
    { header: CM.tps, accessor: 'tps', render: (val) => <span className="font-mono text-14 text-amber-600 dark:text-amber-400 font-semibold">{val ?? '—'}</span> },
    { header: CM.qps, accessor: 'qps', render: (val) => <span className="font-mono text-14 text-amber-600 dark:text-amber-400 font-semibold">{val ?? '—'}</span> },
    {
      header: CM.longTran, accessor: 'long_tran',
      render: (_, row) => <span className="font-mono text-13 text-slate-400">{row.long_tran || '0'} / {(parseFloat(row.long_tran_time || 0) * 1000).toFixed(0)}ms</span>
    },
    {
      header: CM.longQuery, accessor: 'long_query',
      render: (_, row) => <span className="font-mono text-13 text-slate-400">{row.long_query || '0'} / {(parseFloat(row.long_query_time || 0) * 1000).toFixed(0)}ms</span>
    },
    { header: CM.errQuery, accessor: 'error_query', render: (val) => <span className={`font-mono text-14 font-bold ${parseInt(val) > 0 ? 'text-rose-500' : 'text-slate-400'}`}>{val}</span> },
  ], [CM]);

  const activeCount = brokers.filter(b => b.state === 'ON').length;

  const activeBadge = (
    <StatusBadge label={CM.activeCount(activeCount)} variant="emerald" pulse={true} className="rounded-full" />
  );

  const content = (
    <Card
      testId="server-dashboard-broker-status"
      title={
        <div className="flex items-center gap-2">
          <Icon name="hub" size="sm" weight={300} className="text-amber-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{CM.brokerStatus}</span>
        </div>
      }
      rightContent={(isCollapsed) => isCollapsed && activeBadge}
      bodyClassName="p-0"
      collapsible
    >
      <Table
        columns={columns}
        emptyState={<FetchEmptyState status={!hasLoadedOnce ? 'loading' : loadFailed ? 'error' : 'loaded'} title={CM.brokerStatus} />}
        data={brokers}
        loading={(isSection ? sharedLoading : loading) && !hasLoadedOnce && !isManualRefreshing}
        onRowClick={(row) => dispatch(openTab(`broker_status:${hostUid}:${row.name}`))}
      />
    </Card>
  );

  if (isSection) return content;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-bk-main overflow-hidden">
      
      {/* ── Top bar ── */}
      <header className="h-14 px-6 border-b border-slate-100 dark:border-white/4 flex items-center shrink-0 min-w-fit sticky top-0 z-20 bg-white dark:bg-bk-side/40">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 shadow-sm">
            <Icon name="hub" size="sm" weight={300} className="text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-15 font-bold text-slate-800 dark:text-slate-100 tracking-tight leading-tight">{CM.brokerStatus}</span>
              <div className={`px-2 py-0.5 rounded-full border flex items-center gap-1.5 shrink-0 transition-all duration-300 ${preferences.brokerStatusInterval > 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}>
                <div className={`w-1 h-1 rounded-full ${preferences.brokerStatusInterval > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className={`text-11 font-bold ${preferences.brokerStatusInterval > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {preferences.brokerStatusInterval > 0 ? CM.live : CM.paused}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500/60" />
              <span className="text-12 text-slate-400 font-bold uppercase tracking-widest leading-none">{CM.clusterOverview}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <span className="text-12 text-slate-400 font-mono tracking-tight mr-2 whitespace-nowrap">
            {CM.syncedAt(lastRefreshed.toLocaleTimeString())}
          </span>

          <button
            onClick={() => handleRefresh()}
            disabled={loading || isManualRefreshing}
            className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all active:scale-[0.98]
              ${(loading || isManualRefreshing)
                ? 'bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-white/5 cursor-not-allowed opacity-50'
                : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-amber-500 hover:border-amber-500/50 hover:bg-white dark:hover:bg-white/5 shadow-xs'}`}
            title={CM.refreshBrokersList}
          >
            <Icon name="refresh" size="19px" className={(loading || isManualRefreshing) ? 'animate-spin' : ''} />
          </button>

          <div className="w-[1px] h-4 bg-slate-200 dark:bg-white/10 mx-0.5" />
          <MonitoringSettingsPopover />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {content}
      </div>
    </div>
  );
}


export default React.memo(Component);
