import React from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { Card } from '../../../components/ds/layout/Card';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';

// Declared once, outside the component: a component made during render is a
// new type on every render, so React would unmount and mount it each time.
const InfoRow = ({ label, value, fallback }) => (
  <div className="grid grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[10rem_minmax(0,1fr)] items-start gap-x-4 py-2 border-b border-slate-100 dark:border-white/5 last:border-0 hover:bg-slate-50 dark:hover:bg-white/2 transition-colors -mx-4 px-4">
    <Typography variant="span" className="text-13 font-medium text-slate-600 dark:text-slate-400 truncate">{label}</Typography>
    <Typography variant="span" className="min-w-0 text-13 font-normal font-mono text-slate-900 dark:text-slate-200 break-words">{value || fallback}</Typography>
  </div>
);

export default function SystemInfo({ hostUid }) {
  const CM = useCM();
  const { hosts, hostEnvs } = useSelector((state) => state.host, shallowEqual);
  const currentHost = hosts.find(h => h.uid === hostUid);
  const envData = hostEnvs[hostUid];
  const fallback = CM.notApplicableFallback;

  const cardTitle = (
    <div className="flex items-center gap-2">
      <Icon name="info" size="sm" weight={300} className="text-amber-500" />
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{CM.environmentDetails}</span>
    </div>
  );

  return (
    <Card testId="server-dashboard-system-info" title={cardTitle} collapsible defaultCollapsed>
      {envData === undefined ? (
        <div className="flex flex-col items-center justify-center py-8 opacity-70">
          <Icon name="hourglass_empty" size="md" className="mb-2" weight={300} />
          <Typography variant="caption">{CM.loadingLabel}</Typography>
        </div>
      ) : !envData ? (
        <div className="flex flex-col items-center justify-center py-8 opacity-70">
          <Icon name="cloud_off" size="md" className="mb-2"  weight={300} />
          <Typography variant="caption">{CM.environmentUnavailable}</Typography>
        </div>
      ) : (
        <div className="flex flex-col">
          <InfoRow label={CM.accessPoint} value={currentHost ? `${currentHost.address}:${currentHost.port}` : CM.unknownFallback} fallback={fallback} />
          <InfoRow label={CM.authUser} value={currentHost ? currentHost.id : CM.unknownFallback} fallback={fallback} />
          <InfoRow label={CM.operatingSystem} value={envData.osinfo} fallback={fallback} />
          <InfoRow label={CM.cubridEngine} value={envData.CUBRIDVER} fallback={fallback} />
          <InfoRow label={CM.broker} value={envData.BROKERVER} fallback={fallback} />
          <InfoRow label={CM.homeDirectory} value={envData.CUBRID} fallback={fallback} />
          <InfoRow label={CM.databases} value={envData.CUBRID_DATABASES} fallback={fallback} />
        </div>
      )}
    </Card>
  );
}
