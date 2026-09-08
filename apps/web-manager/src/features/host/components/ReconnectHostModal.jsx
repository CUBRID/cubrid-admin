import { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { loginToHost, closeReconnectModal, clearHostError, revokeHostLogin, setSelectedHost } from '../hostSlice';
import { clearReconnectingHost } from '../../../api/apiClient';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';

export default function ReconnectHostModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { reconnectQueue, selectedHostUid, hosts, hostAuthErrors } = useSelector((state) => state.host, shallowEqual);
  const reconnectHostUid = reconnectQueue?.[0] || null;
  const isReconnectModalOpen = reconnectQueue?.length > 0;

  const [localError, setLocalError] = useState(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    if (isReconnectModalOpen) {
      setLocalError(null);
      setIsReconnecting(false);
    }
  }, [isReconnectModalOpen]);

  if (!isReconnectModalOpen) return null;

  const currentHost = hosts.find((h) => h.uid === reconnectHostUid);
  const displayError = localError || hostAuthErrors?.[reconnectHostUid];

  const handleReconnect = () => {
    if (!reconnectHostUid) return;

    setLocalError(null);
    setIsReconnecting(true);

    // Just re-login to refresh the CMS token. No state reset.
    // The existing UI data (databases, brokers, monitoring) stays intact.
    dispatch(loginToHost(reconnectHostUid))
      .unwrap()
      .then(async () => {
        // Clear the 401 guard so new requests go through again
        clearReconnectingHost(reconnectHostUid);
        
        try {
          const { clearMonitoring } = await import('../../server/monitoringSlice');
          dispatch(clearMonitoring(reconnectHostUid));
        } catch (e) {
          console.error(e);
        }

        try {
          const { clearHostSummary } = await import('../../server/globalMonitoringSlice');
          dispatch(clearHostSummary(reconnectHostUid));
        } catch (e) {
          console.error(e);
        }

        try {
          const { triggerRefreshActiveTab } = await import('../../layout/layoutSlice');
          dispatch(triggerRefreshActiveTab());
        } catch (e) {
          console.error(e);
        }

        // Fetch fresh monitoring metrics and host summaries immediately in background
        try {
          const { fetchMonitoringData } = await import('../../server/monitoringSlice');
          dispatch(fetchMonitoringData(reconnectHostUid));
        } catch (e) {
          console.error(e);
        }

        try {
          const { fetchHostSummary } = await import('../../server/globalMonitoringSlice');
          dispatch(fetchHostSummary(reconnectHostUid));
        } catch (e) {
          console.error(e);
        }

        dispatch(closeReconnectModal());
      })
      .catch((err) => {
        setIsReconnecting(false);
        setLocalError(typeof err === 'string' ? err : err?.message || 'Failed to reconnect. Please try again.');
      });
  };

  const handleDisconnect = async () => {
    // Clear the 401 guard first
    if (reconnectHostUid) {
      clearReconnectingHost(reconnectHostUid);
    }

    // Full cleanup: revoke session, close tabs, reset state
    if (reconnectHostUid) {
      dispatch(revokeHostLogin(reconnectHostUid));
      try {
        const { closeHostTabs } = await import('../../layout/layoutSlice');
        dispatch(closeHostTabs(reconnectHostUid));
      } catch (e) {
        console.error(e);
      }

      try {
        const { clearDatabaseLoginsForHost } = await import('../../database/databaseCoreSlice');
        dispatch(clearDatabaseLoginsForHost(reconnectHostUid));
      } catch (e) {
        console.error(e);
      }

      if (selectedHostUid === reconnectHostUid) {
        dispatch(setSelectedHost(null));
        try {
          const { resetDatabaseState } = await import('../../database/databaseCoreSlice');
          dispatch(resetDatabaseState());
        } catch (e) {
          console.error(e);
        }
        try {
          const { resetBrokerState } = await import('../../broker/brokerSlice');
          dispatch(resetBrokerState());
        } catch (e) {
          console.error(e);
        }
      }

      try {
        const { clearHostSummary } = await import('../../server/globalMonitoringSlice');
        dispatch(clearHostSummary(reconnectHostUid));
      } catch (e) {
        console.error(e);
      }
    }

    dispatch(closeReconnectModal());
    dispatch(clearHostError());
  };

  return (
    <Modal
      isOpen={isReconnectModalOpen}
      onClose={handleDisconnect}
      title={CM.connectionLost || 'Connection Lost'}
      icon="warning"
      iconVariant="warning"
      loading={isReconnecting}
      maxWidth="max-w-[440px]"
      testId="reconnect-host"
      onSubmit={handleReconnect}
      footer={
        <>
          <Button
            data-testid="reconnect-host-disconnect-btn"
            variant="secondary"
            onClick={handleDisconnect}
            disabled={isReconnecting}
          >
            {CM.disconnect || 'Disconnect'}
          </Button>
          <Button
            data-testid="reconnect-host-reconnect-btn"
            variant="primary"
            onClick={handleReconnect}
            loading={isReconnecting}
            icon="sync"
            className="min-w-[120px]"
          >
            {CM.reconnect || 'Reconnect'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {displayError && (
          <div className="flex items-start gap-2.5 px-3 py-2.5 bg-rose-500/5 border border-rose-500/10 rounded-lg animate-in fade-in slide-in-from-top-1">
            <Icon name="error" size="sm" className="text-rose-500 shrink-0 mt-0.5" weight={300} />
            <Typography variant="caption" className="text-rose-500 font-medium leading-normal">{displayError}</Typography>
          </div>
        )}

        <div className="relative overflow-hidden p-4 rounded-2xl border border-amber-500/15 bg-linear-to-r from-amber-500/8 via-amber-500/4 to-transparent dark:from-amber-500/10 dark:via-amber-500/5 dark:to-transparent flex items-start gap-4 shadow-xs">
          <div className="absolute right-0 top-0 w-32 h-full bg-linear-to-l from-amber-500/5 to-transparent pointer-events-none" />
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
            <Icon name="dns" size="md" className="text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <Typography variant="caption" className="font-bold text-amber-600/70 dark:text-amber-400/60 uppercase tracking-widest block mb-0.5">{CM.targetHost || 'Target Host'}</Typography>
            <Typography variant="span" className="text-sm font-black text-slate-900 dark:text-white truncate block tracking-tight font-mono">
              {currentHost?.alias || currentHost?.id || 'N/A'}
            </Typography>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3.5 bg-slate-50 dark:bg-white/2 border border-slate-200 dark:border-white/8 rounded-xl">
          <Icon name="info" size="sm" className="text-sky-500 shrink-0 mt-0.5" weight={300} />
          <Typography variant="caption" className="text-slate-500 font-medium leading-relaxed">
            {CM.reconnectPrompt || 'Your session was disconnected, possibly because another user logged into this host. Click Reconnect to attempt to re-establish the connection.'}
          </Typography>
        </div>
      </div>
    </Modal>
  );
}
