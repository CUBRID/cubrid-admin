import React from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { clearHaClusterLinkNotice } from '../hostSlice';
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

export default function HaClusterLinkedModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { haClusterLinkNotice, isHaClusterLinkModalOpen } = useSelector((state) => state.host, shallowEqual);

  const HA_ROLE_LABEL = {
    master: CM.haMaster,
    slave: CM.haSlave,
    replica: CM.haReplica,
  };

  if (!haClusterLinkNotice?.peers?.length) return null;

  const { targetGroupName, peers } = haClusterLinkNotice;

  return (
    <Modal
      isOpen={isHaClusterLinkModalOpen}
      onClose={() => dispatch(clearHaClusterLinkNotice())}
      title={CM.haClusterLinked}
      icon="hub"
      zIndexClass="z-[2200]"
      maxWidth="max-w-[480px]"
      footer={
        <Button variant="primary" onClick={() => dispatch(clearHaClusterLinkNotice())} className="min-w-[120px]">
          {CM.dismiss}
        </Button>
      }
    >
      <div className="space-y-6 p-1">
        <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex gap-3">
          <Icon name="check_circle" className="text-emerald-500 shrink-0" size="sm" />
          <p className="text-13 text-slate-600 dark:text-slate-400 leading-relaxed">
            {CM.haClusterLinkedDesc(peers.length + 1)}{' '}
            <span className="font-semibold">{targetGroupName}</span>.
          </p>
        </div>

        <SectionHeader title={CM.peerNodes} icon="checklist" />
        <div className="space-y-2 max-h-[280px] overflow-y-auto px-1 custom-scrollbar">
          {peers.map((peer) => (
            <div
              key={peer.hostUid}
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/2"
            >
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
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
