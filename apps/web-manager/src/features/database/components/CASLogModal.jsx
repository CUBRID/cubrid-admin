import { useState, useEffect } from 'react';
import { brokerApi } from '../../broker/brokerApi';
import LogViewer from '../../broker/components/LogViewer';
import { useCM } from '../../../constants/useCM';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Button } from '../../../components/ds/foundation/Button';

export default function CASLogModal({ isOpen, onClose, hostUid, brokerName, casId, type = 'sql' }) {
  const CM = useCM();
  const [logPath, setLogPath] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && hostUid && brokerName && casId) {
      fetchLogPath();
    }
  }, [isOpen, hostUid, brokerName, casId, type]);

  const fetchLogPath = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await brokerApi.getBrokerLogs(hostUid, brokerName);
      const logs = response.logfileinfo?.[0]?.logfile || [];
      
      const suffix = type === 'sql' ? `_${casId}.sql.log` : `_${casId}.err`;
      const found = logs.find(log => log.path.endsWith(suffix));
      
      if (found) {
        setLogPath(found.path);
      } else {
        setError(CM.logResolveError(suffix));
      }
    } catch {
      setError(CM.logRetrievalRefused);
    } finally {
      setLoading(false);
    }
  };

  const title = type === 'sql' ? CM.casSqlLog : CM.casSlowQueryLog;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={type === 'sql' ? 'terminal' : 'timer_off'}
      maxWidth="1100px"
      loading={loading}
      error={error}
      onErrorRetry={fetchLogPath}
      onErrorClose={onClose}
    >
      <div className="flex flex-col h-[70vh] min-h-[500px] border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden bg-slate-900 shadow-2xl relative">
        <div className="absolute top-4 left-6 z-10 flex items-center gap-4 pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 backdrop-blur-md border border-white/5 rounded-xl shadow-lg">
             <Icon name="dns" size="xs" weight={300} className="text-amber-500" />
             <Typography variant="caption" className="font-bold text-white/60">{CM.broker}: <span className="text-amber-500">{brokerName}</span></Typography>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 backdrop-blur-md border border-white/5 rounded-xl shadow-lg">
             <Icon name="fingerprint" size="xs" weight={300} className="text-amber-500" />
             <Typography variant="caption" className="font-bold text-white/60">{CM.casUid}: <span className="text-amber-500">{casId}</span></Typography>
          </div>
        </div>

        {!loading && !error && logPath && (
          <div className="flex-1 overflow-hidden bg-slate-950">
            <LogViewer hostUid={hostUid} path={logPath} />
          </div>
        )}

        {!loading && !error && !logPath && (
          <div className="flex-1 flex flex-col items-center justify-center p-20 text-center space-y-4">
             <div className="w-20 h-20 bg-slate-800/50 rounded-3xl flex items-center justify-center border border-white/5 shadow-2xl">
                <Icon name="search_off" size="lg" weight={100} className="text-slate-600" />
             </div>
             <Typography variant="h3" className="text-white/60 font-bold tracking-tight">{CM.noLogData}</Typography>
             <Typography variant="p" className="text-slate-500 max-w-sm">{CM.logStreamEmptyMsg}</Typography>
          </div>
        )}
      </div>
    </Modal>
  );
}
