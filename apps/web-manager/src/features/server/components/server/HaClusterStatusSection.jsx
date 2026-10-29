import React from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { extractHaHeartbeatNodes } from '../../../host/haPeerUtils';
import { useCM } from '../../../../constants/useCM';

const ROLE_ORDER = { MASTER: 0, SLAVE: 1, REPLICA: 2 };
const getRolePriority = (state) => ROLE_ORDER[(state || '').toUpperCase()] ?? 3;

const getNodeStateColor = (state) => {
  const normalized = (state || 'unknown').toUpperCase();
  const isOn = ['ON', 'MASTER', 'SLAVE', 'REPLICA'].includes(normalized);

  return isOn
    ? {
        dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',
        text: 'text-emerald-600 dark:text-emerald-400'
      }
    : {
        dot: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]',
        text: 'text-rose-500 dark:text-rose-400'
      };
};

export default function HaClusterStatusSection({ hostUid }) {
  const CM = useCM();
  const hostData = useSelector((state) => state.monitoring.hostsData[hostUid] || {});
  const { haInfo } = useSelector((state) => state.host, shallowEqual);
  const hostHaInfo = haInfo[hostUid] || {};
  const isHA = hostHaInfo.isHA;

  if (!isHA || !hostData.haHeartbeat) {
    return null;
  }

  const nodes = extractHaHeartbeatNodes(hostData.haHeartbeat)
    .slice()
    .sort((a, b) => getRolePriority(a.status || a.state) - getRolePriority(b.status || b.state));

  return (
    // One row at every width (no viewport-breakpoint stacking, no badge
    // wrapping): below its natural width the row stays as wide as its
    // content and <main> (App.jsx) scrolls horizontally, same as the
    // dashboard headers. ml-auto instead of justify-between so the two
    // non-shrinking blocks never overlap when squeezed (see Header.jsx).
    <div data-testid="ha-cluster-status" className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 flex items-center gap-3 min-w-fit">
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
          <Icon name="hub" className="text-amber-500" size="sm" />
        </div>
        <div>
          <p className="text-13 font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider leading-none whitespace-nowrap">
            {CM.haClusterStatus}
          </p>
          <p className="text-12 text-slate-500 dark:text-slate-400 mt-1.5 leading-none whitespace-nowrap">
            {CM.nodesActiveInCluster(nodes.length)}
          </p>
        </div>
      </div>
      <div data-testid="ha-cluster-node-list" className="flex items-center gap-2 ml-auto shrink-0">
        {nodes.map((node, i) => {
          const nodeState = node.status || node.state || CM.unknownFallback;
          const colors = getNodeStateColor(nodeState);
          return (
            <div key={i} className="flex items-center gap-2 shrink-0 whitespace-nowrap px-2.5 py-1.5 bg-white dark:bg-bk-main rounded-lg border border-slate-200/60 dark:border-white/5 shadow-xs">
              <div className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
              <div className="flex flex-col">
                <span className="text-12 font-bold text-slate-700 dark:text-slate-200 leading-tight">{node.hostname}</span>
                <span className={`text-9 font-black uppercase tracking-tighter mt-0.5 leading-none ${colors.text}`}>
                  {nodeState}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
