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
  const hostText = hostStatus.status === HOST_CONNECTED ? CM.connectedTo(address) : `${address} · ${hostStatus.text}`;

  return (
    // Always the width of the page: w-0 min-w-full keeps the text out of the
    // width <main> sizes to, and each part ends in "…" (full text on hover).
    // A long CUBRID version string made the whole page scroll sideways.
    <footer className="shrink-0 w-0 min-w-full bg-white dark:bg-bk-side border-t border-slate-200 dark:border-white/10 px-6 h-8 flex items-center justify-between font-sans overflow-hidden">
      <div className="flex items-center gap-6 min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0 shrink-0 max-w-full">
          {selectedHostUid ? (
            <>
              <HostStatusDot status={hostStatus.status} text={hostStatus.text} />
              {/* Not "Connected to" a host that is not connected. */}
              <Typography variant="caption" className="text-slate-600 dark:text-slate-400 font-medium truncate" title={hostText}>
                {hostText}
              </Typography>
            </>
          ) : (
            <Typography variant="caption" className="text-slate-400 italic truncate">{CM.noHostSelected}</Typography>
          )}
        </div>
        {selectedHostUid && (
          <Typography variant="caption" className="text-slate-400 opacity-60 truncate min-w-0" title={`${CM.version} ${version}`}>
            {CM.version} {version}
          </Typography>
        )}
      </div>

      <div />
    </footer>
  );
}
