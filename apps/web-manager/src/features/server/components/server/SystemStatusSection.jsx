import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { fetchMonitoringData, clearMonitoring } from '../../monitoringSlice';
import { Card } from '../../../../components/ds/layout/Card';
import { Table } from '../../../../components/ds/layout/Table';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { Button } from '../../../../components/ds/foundation/Button';
import { Spinner } from '../../../../components/ds/foundation/Spinner';
import { Typography } from '../../../../components/ds/foundation/Typography';
import { InfoBanner } from '../../../../components/ds/foundation/InfoBanner';
import { useCM } from '../../../../constants/useCM';
import { startSerialPolling } from '../../../../infrastructure/utils/serialPolling';

const getStatusColor = (p) => {
  if (p > 85) return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]';
  if (p > 50) return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]';
  return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]';
};

const MetricBar = ({ pct }) => (
  <div className="w-full h-1 bg-slate-100 dark:bg-white/6 overflow-hidden mt-1 rounded-full">
    <div className={`h-full transition-all duration-700 ease-out ${getStatusColor(pct)}`} style={{ width: `${pct}%` }} />
  </div>
);

export default function SystemStatusSection({ hostUid, isTabActive = true }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const hostData = useSelector((state) => state.monitoring.hostsData[hostUid] || {});
  const { currentStatus = {}, averages = {}, history = [], loading = false, error = null } = hostData;
  const { authorizedHosts, haInfo } = useSelector((state) => state.host, shallowEqual);
  const isAuthorized = hostUid && authorizedHosts.includes(hostUid);
  const hostHaInfo = haInfo[hostUid] || {};
  const isHA = hostHaInfo.isHA;

  const [isStopped, setIsStopped] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true); // Default to expanded
  const inFlight = useRef(null);
  const [pollGeneration, setPollGeneration] = useState(0);
  
  // Monitoring is active only if tab is visible AND section is expanded
  const isEffectivelyActive = isTabActive && isExpanded;
  const startPolling = () => {
    dispatch(clearMonitoring(hostUid));
    setPollGeneration(value => value + 1);
  };

  useEffect(() => {
    if (!hostUid || !isAuthorized || !isEffectivelyActive) return;
    setIsStopped(false);
    return startSerialPolling(() => {
      // Reuse a pending read when a tab is quickly collapsed/reopened, including
      // React StrictMode's effect restart. An old loop cannot restart its timer.
      if (!inFlight.current || inFlight.current.hostUid !== hostUid) {
        const entry = { hostUid };
        entry.promise = dispatch(fetchMonitoringData(hostUid)).finally(() => {
          if (inFlight.current === entry) inFlight.current = null;
        });
        inFlight.current = entry;
      }
      return inFlight.current.promise;
    }, count => count >= 31 ? null : count < 16 ? 1000 : 30000,
    () => setIsStopped(true));
  }, [hostUid, isAuthorized, isEffectivelyActive, dispatch, pollGeneration]);

  const formatBytes = (bytes) => {
    if (bytes === undefined || bytes === null || isNaN(bytes)) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const rows = useMemo(() => [
    {
      id: 'now', time: CM.nowLabel,
      memory: currentStatus?.memTotal ? { 
        display: `${formatBytes(currentStatus.memUsed)} / ${formatBytes(currentStatus.memTotal)} (${(currentStatus.memory || 0).toFixed(1)}%)`, 
        pct: currentStatus.memory 
      } : null,
      disk: history[history.length - 1]?.disk || '-',
      cpu: { display: `${(currentStatus?.cpu || 0).toFixed(1)}%`, pct: currentStatus?.cpu || 0 },
      tps: (currentStatus?.tps || 0).toFixed(2),
      qps: (currentStatus?.qps || 0).toFixed(2),
    },
    {
      id: 'avg', time: CM.fiveMinAvg,
      memory: currentStatus?.memTotal ? { 
        display: `${formatBytes(currentStatus.memTotal * (averages?.memory || 0) / 100)} / ${formatBytes(currentStatus.memTotal)} (${(averages?.memory || 0).toFixed(1)}%)`,
        pct: averages?.memory || 0 
      } : { display: `${(averages?.memory || 0).toFixed(1)}%`, pct: averages?.memory || 0 },
      disk: '-',
      cpu: { display: `${(averages?.cpu || 0).toFixed(1)}%`, pct: averages?.cpu || 0 },
      tps: (averages?.tps || 0).toFixed(2),
      qps: (averages?.qps || 0).toFixed(2),
    }
  ], [CM, currentStatus, averages, history]);

  const columns = useMemo(() => [
    { header: CM.period, accessor: 'time', render: (val) => <span className="font-semibold text-14 text-slate-600 dark:text-slate-300">{val}</span> },
    {
      header: CM.memory,
      accessor: 'memory',
      render: (val) => val ? (
        <div className="min-w-[150px]">
          <span className="font-mono text-14 font-semibold text-slate-700 dark:text-slate-200">{val.display}</span>
          <MetricBar pct={val.pct} />
        </div>
      ) : <span className="text-slate-300">—</span>
    },
    { header: CM.disk, accessor: 'disk', render: (val) => <span className="font-mono text-14 text-slate-500">{val}</span> },
    {
      header: CM.cpu,
      accessor: 'cpu',
      render: (val) => val ? (
        <div className="min-w-[100px]">
          <span className="font-mono text-14 font-semibold text-slate-700 dark:text-slate-200">{val.display}</span>
          <MetricBar pct={val.pct} />
        </div>
      ) : <span className="text-slate-300">—</span>
    },
    { 
      header: CM.tps, 
      accessor: 'tps', 
      render: (val) => {
        const v = parseFloat(val);
        const color = v === 0 ? 'text-slate-400 dark:text-slate-600' : v > 500 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400';
        return <span className={`font-mono text-14 ${color} font-semibold transition-colors duration-500`}>{val}</span>;
      }
    },
    { 
      header: CM.qps, 
      accessor: 'qps', 
      render: (val) => {
        const v = parseFloat(val);
        const color = v === 0 ? 'text-slate-400 dark:text-slate-600' : v > 1000 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400';
        return <span className={`font-mono text-14 ${color} font-semibold transition-colors duration-500`}>{val}</span>;
      }
    },
  ], [CM]);

  return (
    <Card
      testId="server-dashboard-system-status"
      title={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Icon name="bar_chart" size="sm" weight={300} className="text-amber-500" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{CM.systemStatus}</span>
            {isHA && (
              <div className={`min-w-[84px] justify-center px-2 py-0.5 rounded-md text-12 font-bold uppercase tracking-tight flex items-center gap-1 whitespace-nowrap ${
                hostHaInfo.currentNodeType === 'master' 
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' 
                  : hostHaInfo.currentNodeType === 'replica'
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                    : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20'
              }`}>
                <Icon 
                  name={
                    hostHaInfo.currentNodeType === 'master' ? 'star' : 
                    hostHaInfo.currentNodeType === 'slave' ? 'settings_backup_restore' : 
                    hostHaInfo.currentNodeType === 'replica' ? 'copy_all' : 'hub'
                  } 
                  size="13px" 
                />
                {hostHaInfo.currentNodeType === 'master' ? CM.haMaster :
                  hostHaInfo.currentNodeType === 'slave' ? CM.haSlave :
                  hostHaInfo.currentNodeType === 'replica' ? CM.haReplica :
                  hostHaInfo.currentNodeType}
              </div>
            )}
            <span className="text-12 text-slate-400 font-normal ml-1">
              {isStopped ? `· ${CM.paused}` : `· ${CM.live}`}
            </span>
          </div>
          {isStopped && (
            <button 
              onClick={startPolling}
              className="px-2 py-0.5 rounded-sm bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-12 font-bold text-amber-500 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors flex items-center gap-1"
            >
              <Icon name="refresh" size="13px" />
              {CM.resume}
            </button>
          )}
        </div>
      }
      collapsible
      isCollapsed={!isExpanded}
      onToggle={(collapsed) => setIsExpanded(!collapsed)}
    >
      {error && (
        <InfoBanner variant="danger" title={CM.systemStatusError} icon="error" className="m-4">
          {typeof error === 'object' ? (error.message || error.note || JSON.stringify(error)) : error}
        </InfoBanner>
      )}

      <Table columns={columns} data={rows} className="font-mono text-14" />
    </Card>
  );
}
