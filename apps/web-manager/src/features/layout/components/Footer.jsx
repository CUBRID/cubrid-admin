import { useSelector, shallowEqual } from 'react-redux';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';
import { HostStatusDot } from '../../host/components/HostStatusDot';
import { useHostConnectionStatus } from '../../host/useHostConnectionStatus';
import { HOST_CONNECTED } from '../../host/hostConnectionStatus';

export default function Footer() {
  const CM = useCM();
  const { selectedHostUid, hosts, hostEnvs } = useSelector((state) => state.host, shallowEqual);
  const currentHost = hosts.find(h => h.uid === selectedHostUid);
  const hostStatus = useHostConnectionStatus(selectedHostUid);
  const address = `${currentHost?.address || CM.unknownFallback}:${currentHost?.port || '1523'}`;
  const version = hostEnvs[selectedHostUid]?.CUBRIDVER || '11.2.0.4501';

  return (
    <footer className="bg-white dark:bg-bk-side border-t border-slate-200 dark:border-white/10 px-6 h-8 flex items-center justify-between font-sans">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          {selectedHostUid ? (
            <>
              <HostStatusDot status={hostStatus.status} text={hostStatus.text} />
              <Typography variant="caption" className="text-slate-600 dark:text-slate-400 font-medium truncate max-w-[60vw]" title={hostStatus.status === HOST_CONNECTED ? undefined : hostStatus.text}>
                {/* Not "Connected to" a host that is not connected. */}
                {hostStatus.status === HOST_CONNECTED ? CM.connectedTo(address) : `${address} · ${hostStatus.text}`}
              </Typography>
            </>
          ) : (
            <Typography variant="caption" className="text-slate-400 italic">{CM.noHostSelected}</Typography>
          )}
        </div>
        {selectedHostUid && (
          <Typography variant="caption" className="text-slate-400 opacity-60">{CM.version} {version}</Typography>
        )}
      </div>

      <div />
    </footer>
  );
}
