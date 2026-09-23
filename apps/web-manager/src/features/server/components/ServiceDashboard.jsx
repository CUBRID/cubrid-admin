import { usePollingRefresh } from '../../../infrastructure/hooks/usePollingRefresh';
import React, { useState } from 'react';
import { useSelector, useDispatch , shallowEqual } from 'react-redux';
import { formatSize } from '../../../infrastructure/utils/format';
import { fetchHostSummary } from '../globalMonitoringSlice';
import { setSelectedHost } from '../../host/hostSlice';
import { useHostActivation } from '../../host/useHostActivation';
import MonitoringSettingsPopover from '../../user/components/MonitoringSettingsPopover';
import { Table } from '../../../components/ds/layout/Table';
import { Card } from '../../../components/ds/layout/Card';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Badge } from '../../../components/ds/foundation/Badge';
import { Spinner } from '../../../components/ds/foundation/Spinner';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import {
  orderedGroupEntries,
  resolveDefaultHostUid,
  sortHostUidsByHaRole,
  inferHaNodeType,
} from '../../host/hostGroupUtils';

const MetricBar = ({ pct }) => (
  <div className="w-full h-1 bg-slate-100 dark:bg-white/6 overflow-hidden mt-1 rounded-full">
    <div className={`h-full transition-all duration-700 ease-out ${pct > 85 ? 'bg-rose-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
  </div>
);

import { useCM } from '../../../constants/useCM';

const ignoreRefreshError = () => undefined;

const Component = function ServiceDashboard() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { hosts, hostGroups, authorizedHosts, haInfo } = useSelector((state) => state.host, shallowEqual);
  const { summaries } = useSelector((state) => state.globalMonitoring, shallowEqual);
  const { preferences } = useSelector((state) => state.user, shallowEqual);
  const { refreshCounter, activeMainTab } = useSelector((state) => state.layout, shallowEqual);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState(null); // { key, direction: 'asc'|'desc' }
  const activateHost = useHostActivation();

  const handleColumnSort = (accessor) => {
    setSortConfig((prev) => {
      if (prev?.key === accessor) {
        return prev.direction === 'asc' ? { key: accessor, direction: 'desc' } : null;
      }
      return { key: accessor, direction: 'asc' };
    });
  };
  const { isManualRefreshing, lastRefreshed, handleRefresh: refreshAll } = usePollingRefresh({
    hostUid: 'global',
    tabId: 'service_dashboard',
    pollingIntervalSeconds: preferences.dashboardInterval,
    onFetch: (silent) => async (dispatch) => {
      if (authorizedHosts.length === 0) return;
      await Promise.all(authorizedHosts.map(hostUid => 
        dispatch(fetchHostSummary(silent ? { hostUid, isBackground: true } : hostUid)).unwrap().catch(ignoreRefreshError)
      ));
    }
  });

  const toggleGroupCollapsed = (groupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleRowClick = (row) => {
    if (!row) return;
    if (row._type === 'group') {
      toggleGroupCollapsed(row.groupId);
      return;
    }
    const hostUid = row.uid;
    dispatch(setSelectedHost(hostUid));
    activateHost(hostUid);
  };

  // Group tree rows: group header row + host rows (keeps group ordering stable).
  const { tableRows, hostMetaByUid } = React.useMemo(() => {
    const metaByUid = {};
    const rows = [];

    const orderedGroups = orderedGroupEntries(hostGroups);
    for (const [groupId, group] of orderedGroups) {
      const groupHostsMap = group?.hosts || {};
      const groupHostUids = Object.keys(groupHostsMap);
      const defaultUid = resolveDefaultHostUid(group);
      const groupName = group?.name || CM.groupLabel;
      const isCollapsed = collapsedGroups.has(groupId);

      // Filter host UIDs based on the selected HA role filter
      let filteredUids = groupHostUids;
      if (roleFilter !== 'all') {
        filteredUids = groupHostUids.filter(uid => {
          const host = groupHostsMap[uid];
          return inferHaNodeType(host, haInfo[uid]) === roleFilter;
        });
      }

      // If filtering is active and no hosts in this group match the filter, hide the group entirely
      if (roleFilter !== 'all' && filteredUids.length === 0) {
        continue;
      }

      const isHaGroup = groupHostUids.some(uid => {
        const host = groupHostsMap[uid];
        return haInfo[uid]?.isHA || !!inferHaNodeType(host, haInfo[uid]);
      });

      rows.push({
        _type: 'group',
        rowKey: `group:${groupId}`,
        groupId,
        groupName,
        hostCount: roleFilter === 'all' ? groupHostUids.length : filteredUids.length,
        defaultHostUid: defaultUid,
        isCollapsed,
        isHa: isHaGroup,
      });

      if (isCollapsed) continue;
      if (filteredUids.length === 0) continue;

      const groupOrderedUids = sortHostUidsByHaRole(filteredUids, groupHostsMap, haInfo);

      groupOrderedUids.forEach((uid, idx) => {
        const host = groupHostsMap[uid];
        if (!host) return;
        metaByUid[uid] = {
          groupId,
          groupName,
          isFirstInGroup: idx === 0,
          isLastInGroup: idx === groupOrderedUids.length - 1,
        };
        rows.push({ _type: 'host', rowKey: `host:${uid}`, ...host });
      });
    }

    return { tableRows: rows, hostMetaByUid: metaByUid };
  }, [hostGroups, collapsedGroups, haInfo, roleFilter, CM]);

  // Sort host rows within each group while keeping group headers in place.
  const sortedTableRows = React.useMemo(() => {
    if (!sortConfig) return tableRows;
    const { key, direction } = sortConfig;
    const result = [];
    let pendingGroup = null;
    let pendingHosts = [];

    const flushGroup = () => {
      if (!pendingGroup) return;
      pendingHosts.sort((a, b) => {
        const rawA = summaries[a.uid]?.[key];
        const rawB = summaries[b.uid]?.[key];
        const noA = rawA == null;
        const noB = rawB == null;
        // Hosts with no measurement always sort to the end regardless of direction.
        if (noA && noB) return 0;
        if (noA) return 1;
        if (noB) return -1;
        if (rawA < rawB) return direction === 'asc' ? -1 : 1;
        if (rawA > rawB) return direction === 'asc' ? 1 : -1;
        return 0;
      });
      result.push(pendingGroup, ...pendingHosts);
      pendingGroup = null;
      pendingHosts = [];
    };

    for (const row of tableRows) {
      if (row._type === 'group') {
        flushGroup();
        pendingGroup = row;
      } else {
        pendingHosts.push(row);
      }
    }
    flushGroup();
    return result;
  }, [tableRows, sortConfig, summaries]);

  const columns = React.useMemo(() => {
    const HA_ROLE_CONFIG = {
      master: {
        label: CM.haMaster,
        className: 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400',
      },
      slave: {
        label: CM.haSlave,
        className: 'bg-slate-500/10 border-slate-400/20 text-slate-500 dark:text-slate-400',
      },
      replica: {
        label: CM.haReplica,
        className: 'bg-blue-500/10 border-blue-400/20 text-blue-600 dark:text-blue-400',
      },
    };

    return [
    {
      header: CM.groupHost,
      accessor: 'alias',
      render: (val, row) => {
        if (row._type === 'group') {
          return (
            <div className="flex items-center gap-2 py-1 w-full">
              <button
                type="button"
                className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-amber-500 hover:bg-amber-500/5 transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleGroupCollapsed(row.groupId);
                }}
                title={row.isCollapsed ? CM.expandGroupTitle : CM.collapseGroupTitle}
              >
                <Icon
                  name={row.isCollapsed ? 'chevron_right' : 'keyboard_arrow_up'}
                  size="17px"
                  className="transition-transform duration-200"
                />
              </button>
              <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/4 border border-slate-200 dark:border-white/8 flex items-center justify-center">
                <Icon name="folder" size="17px" className="text-slate-400 dark:text-slate-500" />
              </div>
              <div className="flex-1 flex items-center justify-between min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-15 font-black text-slate-800 dark:text-slate-100 truncate">
                    {row.groupName}
                  </span>
                  <span className="inline-flex items-center px-1.5 h-[14px] rounded-[3px] border border-slate-200 dark:border-white/10 bg-white dark:bg-white/3 text-11 font-black tracking-wide leading-none shrink-0 text-slate-500 dark:text-slate-400 uppercase">
                    {CM.nodesCountLabel(row.hostCount)}
                  </span>
                </div>
                {row.isHa && (
                  <span className="inline-flex items-center justify-center min-w-[56px] px-1.5 h-[14px] rounded-[3px] border border-amber-500/20 bg-amber-500/10 text-10 font-black tracking-wide leading-none shrink-0 text-amber-600 dark:text-amber-400 uppercase ml-[12px]">
                    {CM.haBadge}
                  </span>
                )}
              </div>
            </div>
          );
        }

        const isConnected = authorizedHosts.includes(row.uid);
        const meta = hostMetaByUid[row.uid] || {};
        
        const getInferredHaInfo = () => {
          const info = haInfo[row.uid];
          if (info?.isHA) return info;
          const alias = (row.alias || '').toLowerCase();
          if (alias.includes('(master)')) return { isHA: true, currentNodeType: 'master' };
          if (alias.includes('(slave)')) return { isHA: true, currentNodeType: 'slave' };
          if (alias.includes('(replica)')) return { isHA: true, currentNodeType: 'replica' };
          return null;
        };

        const activeHaInfo = getInferredHaInfo();
        const roleConfig = activeHaInfo?.currentNodeType ? HA_ROLE_CONFIG[activeHaInfo.currentNodeType] : null;

        const displayName = (val || row.id)
          .replace(/\s*\(master\)/i, '')
          .replace(/\s*\(slave\)/i, '')
          .replace(/\s*\(replica\)/i, '')
          .trim();

        return (
          <div className="flex items-center gap-3 py-0.5 w-full">
            <div className="w-[34px] shrink-0" aria-hidden="true" />
            {/* Server icon box with connection status */}
            <div className="relative shrink-0">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center border transition-all duration-200 ${
                isConnected
                  ? 'bg-amber-500/10 border-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.1)]'
                  : 'bg-slate-100 dark:bg-white/4 border-slate-200 dark:border-white/8'
              }`}>
                <Icon
                  name="dns"
                  size="14px"
                  className={isConnected ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}
                  weight={isConnected ? 400 : 300}
                />
              </div>
              {/* Connection status dot */}
              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white dark:border-background-dark flex items-center justify-center ${
                isConnected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/20'
              }`}>
                {isConnected && <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />}
              </span>
            </div>

            {/* Name + role */}
            <div className="flex-1 flex items-center justify-between min-w-0">
              <span className={`text-15 font-medium leading-tight truncate ${
                isConnected ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'
              }`}>{displayName}</span>
              {roleConfig && (
                <span className={`inline-flex items-center justify-center min-w-[56px] px-1.5 h-[14px] rounded-[3px] border text-10 font-black tracking-wide leading-none shrink-0 whitespace-nowrap ${roleConfig.className} ml-[12px]`}>
                  {roleConfig.label}
                </span>
              )}
            </div>
          </div>
        );
      }
    },
    { 
      header: CM.address, 
      accessor: 'address', 
      render: (v, row) => {
        if (row._type === 'group') return <span className="text-slate-300">—</span>;
        return <span className="font-mono text-13 text-slate-500">{v || row.ip || CM.localhost}</span>;
      } 
    },
    { 
      header: CM.port, 
      accessor: 'port', 
      render: (v, row) => {
        if (row._type === 'group') return <span className="text-slate-300">—</span>;
        return <span className="font-mono text-13 text-slate-500">{v}</span>;
      } 
    },
    { 
      header: CM.userLabel, 
      accessor: 'user', 
      render: (v, row) => {
        if (row._type === 'group') return <span className="text-slate-300">—</span>;
        return <span className="text-14 text-slate-600 dark:text-slate-400">{row.user || row.id}</span>;
      } 
    },
    { 
      header: CM.permanent, 
      accessor: 'permFree',
      render: (_, row) => {
        if (row._type === 'group') return <span className="text-slate-300">—</span>;
        const isConnected = authorizedHosts.includes(row.uid);
        const v = isConnected ? summaries[row.uid]?.permFree : undefined;
        if (v === undefined || v === -1 || Number.isNaN(v)) return <span className="text-slate-300">—</span>;
        return <Badge variant={v > 30 ? 'success' : v > 10 ? 'warning' : 'danger'}>{v}%</Badge>;
      }
    },
    { 
      header: CM.permanentTemp, 
      accessor: 'permTempFree',
      render: (_, row) => {
        if (row._type === 'group') return <span className="text-slate-300">—</span>;
        const isConnected = authorizedHosts.includes(row.uid);
        const v = isConnected ? summaries[row.uid]?.permTempFree : undefined;
        if (v === undefined || v === -1 || Number.isNaN(v)) return <span className="text-slate-300">—</span>;
        return <Badge variant={v > 30 ? 'success' : v > 10 ? 'warning' : 'danger'}>{v}%</Badge>;
      }
    },
    { 
      header: CM.tempTemp, 
      accessor: 'tempTempFree',
      render: (_, row) => {
        if (row._type === 'group') return <span className="text-slate-300">—</span>;
        const isConnected = authorizedHosts.includes(row.uid);
        const v = isConnected ? summaries[row.uid]?.tempTempFree : undefined;
        if (v === undefined || v === -1 || Number.isNaN(v)) return <span className="text-slate-300">—</span>;
        return <Badge variant={v > 30 ? 'success' : v > 10 ? 'warning' : 'danger'}>{v}%</Badge>;
      }
    },
    {
      header: CM.tps,
      accessor: 'tps',
      sortable: true,
      onHeaderClick: () => handleColumnSort('tps'),
      sortDirection: sortConfig?.key === 'tps' ? sortConfig.direction : null,
      render: (_, row) => {
        if (row._type === 'group') return <span className="text-slate-300">—</span>;
        const isConnected = authorizedHosts.includes(row.uid);
        const v = isConnected ? summaries[row.uid]?.tps : undefined;
        if (v === undefined) return <span className="text-slate-300">—</span>;
        return <span className="font-mono text-14 text-emerald-600 dark:text-emerald-400 font-bold">{v}</span>;
      }
    },
    {
      header: CM.qps,
      accessor: 'qps',
      sortable: true,
      onHeaderClick: () => handleColumnSort('qps'),
      sortDirection: sortConfig?.key === 'qps' ? sortConfig.direction : null,
      render: (_, row) => {
        if (row._type === 'group') return <span className="text-slate-300">—</span>;
        const isConnected = authorizedHosts.includes(row.uid);
        const v = isConnected ? summaries[row.uid]?.qps : undefined;
        if (v === undefined) return <span className="text-slate-300">—</span>;
        return <span className="font-mono text-14 text-slate-600 dark:text-slate-300">{v}</span>;
      }
    },
    { 
      header: CM.memory, 
      accessor: 'memory',
      width: '160px',
      render: (_, row) => {
        if (row._type === 'group') return <span className="text-slate-300">—</span>;
        const isConnected = authorizedHosts.includes(row.uid);
        const s = isConnected ? summaries[row.uid] : undefined;
        if (!s) return <span className="text-slate-300">—</span>;
        return (
          <div className="min-w-[150px] whitespace-nowrap">
            <span className="text-13 text-slate-700 dark:text-slate-200 font-mono font-semibold whitespace-nowrap">{formatSize(s.memUsed)} / {formatSize(s.memTotal)}</span>
            <MetricBar pct={s.memory} />
          </div>
        );
      }
    },
    { 
      header: CM.cpu, 
      accessor: 'cpu',
      render: (_, row) => {
        if (row._type === 'group') return <span className="text-slate-300">—</span>;
        const isConnected = authorizedHosts.includes(row.uid);
        const s = isConnected ? summaries[row.uid] : undefined;
        if (!s) return <span className="text-slate-300">—</span>;
        return (
          <div className="min-w-[80px]">
            <span className="font-mono text-13 font-semibold text-slate-700 dark:text-slate-200">{(s.cpu || 0).toFixed(1)}%</span>
            <MetricBar pct={s.cpu} />
          </div>
        );
      }
    },
    { 
      header: CM.dbStatus, 
      accessor: 'dbStatus',
      render: (_, row) => {
        if (row._type === 'group') return <span className="text-slate-300">—</span>;
        const isConnected = authorizedHosts.includes(row.uid);
        const s = isConnected ? summaries[row.uid] : undefined;
        if (!s) return <span className="text-slate-300">—</span>;
        return (
          <div className="flex items-center gap-1.5 font-bold text-12">
            <span className="text-emerald-500">{CM.onColonLabel(s.dbOn)}</span>
            <span className="text-slate-400">{CM.offColonLabel(s.dbOff)}</span>
          </div>
        );
      }
    },
  ];
  }, [authorizedHosts, summaries, haInfo, hostMetaByUid, CM]);

  return (
    <div data-testid="service-dashboard" className="flex-1 flex flex-col h-full bg-white dark:bg-background-dark overflow-hidden font-sans">
      <header className="px-6 py-2.5 border-b border-slate-100 dark:border-white/4 flex items-center justify-between shrink-0 sticky top-0 z-20 bg-linear-to-r from-amber-500/[0.03] to-transparent bg-white dark:bg-background-dark font-sans shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Icon name="monitoring" size="sm" weight={300} className="text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Typography variant="h1" className="text-15 font-bold text-slate-800 dark:text-slate-100 leading-tight">
                {CM.serviceDashboard}
              </Typography>
              <div className={`px-2 py-0.5 rounded-full border flex items-center gap-1.5 shrink-0 transition-all duration-300 ${preferences.dashboardInterval > 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}>
                <div className={`w-1 h-1 rounded-full ${preferences.dashboardInterval > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className={`text-11 font-bold ${preferences.dashboardInterval > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {preferences.dashboardInterval > 0 ? CM.live : CM.paused}
                </span>
              </div>
            </div>
            <Typography variant="label" className="text-12 text-slate-400 font-mono tracking-tight mt-0.5">{CM.globalHealthOverview}</Typography>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-14">
          {/* HA Role Filter Segmented Control */}
          <div className="flex items-center bg-slate-100/80 dark:bg-white/5 p-0.5 rounded-lg border border-slate-200/50 dark:border-white/5 mr-2 shrink-0">
            {[
              { id: 'all', label: CM.all || 'All' },
              { id: 'master', label: CM.haMaster || 'Master' },
              { id: 'slave', label: CM.haSlave || 'Slave' },
              { id: 'replica', label: CM.haReplica || 'Replica' },
            ].map((tab) => {
              const isActive = roleFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRoleFilter(tab.id)}
                  className={`px-2.5 py-1 text-12 font-bold rounded-md transition-all duration-150 active:scale-[0.98] ${
                    isActive
                      ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-xs border border-slate-200/10 dark:border-white/5'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <Typography variant="label" className="text-12 text-slate-400 font-mono tracking-tight hidden lg:block mr-2 shrink-0">
            {CM.syncedAt(lastRefreshed.toLocaleTimeString())}
          </Typography>

          <button
            data-testid="service-dashboard-refresh-btn"
            onClick={refreshAll}
            disabled={isManualRefreshing || authorizedHosts.length === 0}
            className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all active:scale-[0.98]
              ${isManualRefreshing
                ? 'bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-white/5 cursor-not-allowed opacity-50'
                : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-amber-500 hover:border-amber-500/50 hover:bg-white dark:hover:bg-white/5'}`}
            title={CM.refreshDashboard}
          >
            <Icon name="refresh" size="19px" className={isManualRefreshing ? 'animate-spin' : ''} />
          </button>

          <div className="w-[1px] h-4 bg-slate-200 dark:bg-white/10 mx-0.5" />
          <MonitoringSettingsPopover />

          <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1" />
          <div className="flex items-center gap-4 px-3 py-1 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-lg shadow-xs">
            <div className="flex flex-col">
              <span className="text-11 uppercase font-bold text-slate-400 leading-none">{CM.hostsLabel}</span>
              <span className="text-15 font-bold text-slate-700 dark:text-slate-200 leading-none mt-1">{hosts?.length || 0}</span>
            </div>
            <div className="w-px h-5 bg-slate-200 dark:bg-white/10" />
            <div className="flex flex-col">
              <span className="text-11 uppercase font-bold text-emerald-500 leading-none tracking-tight">{CM.activeLabel}</span>
              <span className="text-15 font-bold text-emerald-500 leading-none mt-1">{authorizedHosts?.length || 0}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 relative">
        <Card testId="service-dashboard-table" noPadding className="overflow-hidden border-slate-200 dark:border-white/10 shadow-sm rounded-xl bg-white dark:bg-white/1">
          <Table
            columns={columns}
            data={sortedTableRows}
            onRowClick={handleRowClick}
            className="border-none text-14"
            hoverable
            sortable={false}
          />
        </Card>

        {hosts.length > 0 && authorizedHosts.length === 0 && (
          <InfoBanner variant="warning" title={CM.sensorsOffline} icon="dns">
            {CM.connectHostForMonitoring}
          </InfoBanner>
        )}
      </div>
    </div>
  );
}

export default React.memo(Component);
