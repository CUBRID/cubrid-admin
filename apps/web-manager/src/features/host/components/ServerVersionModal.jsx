import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeServerVersionModal } from '../hostSlice';
import { hostApi } from '../hostApi';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Typography } from '../../../components/ds/foundation/Typography';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { useCM } from '../../../constants/useCM';

export default function ServerVersionModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isServerVersionModalOpen, serverVersionHostUid, hosts } = useSelector((state) => state.host, shallowEqual);
  const [envData, setEnvData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isServerVersionModalOpen && serverVersionHostUid) {
      setLoading(true);
      hostApi.getHostEnv(serverVersionHostUid)
        .then(res => {
          setEnvData(res);
        })
        .catch(err => {
          console.error("Failed to fetch server version:", err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isServerVersionModalOpen, serverVersionHostUid]);

  if (!isServerVersionModalOpen) return null;

  const currentHost = hosts.find(h => h.uid === serverVersionHostUid);

  return (
    <Modal
      isOpen={isServerVersionModalOpen}
      onClose={() => dispatch(closeServerVersionModal())}
      title={CM.serverVersion}
      icon="info"
      loading={loading}
      maxWidth="420px"
      subtitle={CM.serverColon(currentHost?.alias || currentHost?.id)}
      footer={
        <Button 
          variant="primary" 
          onClick={() => dispatch(closeServerVersionModal())}
          className="min-w-[140px]"
        >
          {CM.close}
        </Button>
      }
    >
      <div className="flex flex-col items-center space-y-6 pt-2">
        <div className="w-24 h-24 p-3 bg-white dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/10 shadow-xs flex items-center justify-center animate-in zoom-in duration-300">
          <img src="/cubrid-logo.png" alt="CUBRID logo" className="w-full h-auto object-contain" />
        </div>

        <div className="w-full space-y-5">
          <div className="flex flex-col items-center text-center w-full">
            <SectionHeader title={CM.cubridVersion} icon="verified" className="justify-center" />
            <Typography variant="p" className="font-mono font-black text-slate-800 dark:text-white tracking-tight text-18">
              {envData?.CUBRIDVER || CM.loadingLabel}
            </Typography>
          </div>

          <div className="w-full">
            <SectionHeader title={CM.environmentDetails} icon="settings_suggest" />
            <div className="space-y-0.5 pt-2">
              {[
                { label: CM.osPlatform, value: envData?.osinfo },
                { label: CM.broker, value: envData?.BROKERVER },
                { label: CM.installPath, value: envData?.CUBRID, isPath: true },
                { label: CM.databases, value: envData?.CUBRID_DATABASES, isPath: true }
              ].map((item, idx) => (
                <div key={idx} className="flex justify-between items-center py-1.5 border-b border-slate-50 dark:border-white/5 last:border-0">
                  <Typography variant="caption" className="text-slate-400 font-medium">{item.label}</Typography>
                  <Typography 
                    variant="caption" 
                    className={`font-mono text-slate-700 dark:text-slate-200 ${item.isPath ? 'truncate ml-4 max-w-[200px]' : ''}`}
                    title={item.isPath ? item.value : undefined}
                  >
                    {item.value || '-'}
                  </Typography>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
