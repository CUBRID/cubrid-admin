import React, { useState } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { clearPendingHaMerge, mergeHaPeers } from '../hostSlice';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Icon } from '../../../components/ds/foundation/Icon';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { useCM } from '../../../constants/useCM';

const HA_ROLE_ICON = {
  master: 'star',
  slave: 'settings_backup_restore',
  replica: 'copy_all',
};

export default function HaPeerMergeModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { pendingHaMerge, isHaMergeModalOpen, loading } = useSelector((state) => state.host, shallowEqual);
  const [isMerging, setIsMerging] = useState(false);

  const HA_ROLE_LABEL = {
    master: CM.haMaster,
    slave: CM.haSlave,
    replica: CM.haReplica,
  };

  if (!pendingHaMerge?.peers?.length) return null;

  const { targetGroupName, targetGroupId, peers } = pendingHaMerge;

  const handleMerge = async () => {
    setIsMerging(true);
    try {
      await dispatch(mergeHaPeers({ targetGroupId, peers })).unwrap();
      dispatch(clearPendingHaMerge());
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <Modal
      isOpen={isHaMergeModalOpen}
      onClose={() => dispatch(clearPendingHaMerge())}
      title={CM.mergeHAPeers}
      icon="hub"
      zIndexClass="z-[2200]"
      maxWidth="max-w-[480px]"
      loading={isMerging || loading}
      onSubmit={handleMerge}
      footer={
        <>
          <Button variant="secondary" onClick={() => dispatch(clearPendingHaMerge())} disabled={isMerging}>
            {CM.cancel}
          </Button>
          <Button
            variant="primary"
            onClick={handleMerge}
            icon="hub"
            className="min-w-[140px]"
            loading={isMerging}
          >
            {CM.mergeIntoGroup}
          </Button>
        </>
      }
    >
      <div className="space-y-6 p-1">
        <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl flex gap-3">
          <Icon name="info" className="text-amber-500 shrink-0" size="sm" />
          <p className="text-13 text-slate-600 dark:text-slate-400 leading-relaxed">
            {CM.haPeerMergeDesc(peers.length)}{' '}
            <span className="font-semibold">{targetGroupName}</span>?
          </p>
        </div>

        <SectionHeader title={CM.peerNodes} icon="checklist" />
        <div className="space-y-2 max-h-[280px] overflow-y-auto px-1 custom-scrollbar">
          {peers.map((peer) => (
            <div
              key={peer.hostUid}
              className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/2"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400">
                  <Icon name={HA_ROLE_ICON[peer.haRole] || 'dns'} size="17px" />
                </div>
                <div className="min-w-0">
                  <p className="text-14 font-bold text-slate-800 dark:text-slate-200 truncate">
                    {peer.alias}
                  </p>
                  <p className="text-12 text-slate-400 dark:text-slate-500 truncate">
                    {peer.address}:{peer.port}
                    {peer.haRole ? ` · ${HA_ROLE_LABEL[peer.haRole] || peer.haRole}` : ''}
                  </p>
                  <p className="text-12 text-slate-400 truncate">
                    {CM.fromGroupLabel(peer.fromGroupName)}
                  </p>
                </div>
              </div>
              <Icon name="arrow_forward" size="15px" className="text-amber-500 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
