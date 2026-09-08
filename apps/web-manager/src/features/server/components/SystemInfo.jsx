import React from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { Card } from '../../../components/ds/layout/Card';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';

export default function SystemInfo({ hostUid }) {
  const CM = useCM();
  const { hosts, hostEnvs } = useSelector((state) => state.host, shallowEqual);
  const currentHost = hosts.find(h => h.uid === hostUid);
  const envData = hostEnvs[hostUid];

  const InfoRow = ({ label, value }) => (
    <div className="flex items-start py-2.5 border-b border-slate-100 dark:border-white/5 last:border-0 group/row hover:bg-slate-50 dark:hover:bg-white/2 transition-colors -mx-4 px-4">
      <Typography variant="span" className="text-slate-500 font-medium text-15 min-w-[140px] truncate">{label}</Typography>
      <Typography variant="span" className="text-slate-900 dark:text-slate-100 font-mono text-15 break-all flex-1">{value || CM.notApplicableFallback}</Typography>
    </div>
  );

  const cardTitle = (
    <div className="flex items-center gap-2">
      <Icon name="info" size="sm" weight={300} className="text-amber-500" />
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{CM.environmentDetails}</span>
    </div>
  );

  return (
    <Card testId="server-dashboard-system-info" title={cardTitle} collapsible defaultCollapsed>
      {!envData ? (
        <div className="flex flex-col items-center justify-center py-8 opacity-40">
          <Icon name="cloud_off" size="md" className="mb-2"  weight={300} />
          <Typography variant="caption">{CM.environmentUnavailable}</Typography>
        </div>
      ) : (
        <div className="flex flex-col">
          <InfoRow label={CM.accessPoint} value={currentHost ? `${currentHost.address}:${currentHost.port}` : CM.unknownFallback} />
          <InfoRow label={CM.authUser} value={currentHost ? currentHost.id : CM.unknownFallback} />
          <InfoRow label={CM.operatingSystem} value={envData.osinfo} />
          <InfoRow label={CM.cubridEngine} value={envData.CUBRIDVER} />
          <InfoRow label={CM.broker} value={envData.BROKERVER} />
          <InfoRow label={CM.homeDirectory} value={envData.CUBRID} />
          <InfoRow label={CM.databases} value={envData.CUBRID_DATABASES} />
        </div>
      )}
    </Card>
  );
}

