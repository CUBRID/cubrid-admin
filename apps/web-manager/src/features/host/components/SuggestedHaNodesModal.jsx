import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import {
  clearSuggestedHaNodes,
  openAddHostModal,
  closeDiscoveryModal,
  createHostGroup,
  moveHost,
  setSuggestedHaGroupId,
} from '../hostSlice';
import { findUndiscoveredHaPeers } from '../haPeerUtils';
import { UNGROUPED_GROUP_ID, findNewGroupId } from '../hostGroupUtils';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Icon } from '../../../components/ds/foundation/Icon';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { useCM } from '../../../constants/useCM';

export default function SuggestedHaNodesModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const {
    suggestedHaNodes,
    suggestedHaGroupId,
    suggestedHaAnchorHostUid,
    hosts,
    hostGroups,
    isDiscoveryModalOpen,
  } = useSelector((state) => state.host, shallowEqual);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [createGroupError, setCreateGroupError] = useState('');
  const [createdGroupName, setCreatedGroupName] = useState('');

  const filteredNodes = findUndiscoveredHaPeers(hosts, suggestedHaNodes);
  const anchorIsUngrouped = suggestedHaGroupId === UNGROUPED_GROUP_ID;

  const HA_ROLE_LABEL = {
    master: CM.haMaster,
    slave: CM.haSlave,
    replica: CM.haReplica,
  };

  useEffect(() => {
    if (isDiscoveryModalOpen && filteredNodes.length === 0) {
      dispatch(clearSuggestedHaNodes());
    }
  }, [dispatch, filteredNodes.length, isDiscoveryModalOpen]);

  useEffect(() => {
    setNewGroupName('');
    setCreateGroupError('');
    setCreatedGroupName('');
  }, [suggestedHaAnchorHostUid]);

  if (filteredNodes.length === 0) return null;

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name || !suggestedHaAnchorHostUid) return;

    setIsCreatingGroup(true);
    setCreateGroupError('');
    try {
      const prevGroups = hostGroups;
      const nextGroups = await dispatch(createHostGroup({ name })).unwrap();
      const newGroupId = findNewGroupId(prevGroups, nextGroups);
      if (!newGroupId) throw new Error();

      await dispatch(moveHost({ hostUid: suggestedHaAnchorHostUid, targetGroupId: newGroupId })).unwrap();
      dispatch(setSuggestedHaGroupId(newGroupId));
      setCreatedGroupName(name);
    } catch {
      setCreateGroupError(CM.actionFailed);
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleAddNode = () => {
    const node = filteredNodes[selectedIndex];
    if (!node) return;

    const initialData = {
      alias: `${node.hostname} (${node.state})`,
      address: node.ip || '',
      port: 8001,
      id: 'admin',
      password: '',
      ...(suggestedHaGroupId ? { groupId: suggestedHaGroupId } : {}),
    };

    // Hide this modal so AddHostModal can take focus
    dispatch(closeDiscoveryModal());
    
    // Open the standardized Add Host Modal with pre-filled data
    dispatch(openAddHostModal(initialData));
  };

  return (
    <Modal
      isOpen={isDiscoveryModalOpen && filteredNodes.length > 0}
      onClose={() => dispatch(clearSuggestedHaNodes())}
      title={CM.haPeersDiscovered}
      icon="hub"
      zIndexClass="z-[2200]"
      maxWidth="max-w-[450px]"
      footer={
        <>
          <Button variant="secondary" onClick={() => dispatch(clearSuggestedHaNodes())}>
            {CM.cancel}
          </Button>
          <Button 
            variant="primary" 
            onClick={handleAddNode} 
            icon="add_link"
            className="min-w-[140px]"
          >
            {CM.add}
          </Button>
        </>
      }
    >
      <div className="space-y-6 p-1">
        <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl flex gap-3">
          <Icon name="info" className="text-amber-500 shrink-0" size="sm" />
          <p className="text-13 text-slate-600 dark:text-slate-400 leading-relaxed">
            This server is part of an HA cluster. Select a peer node to configure and add it to your server list.
          </p>
        </div>

        {anchorIsUngrouped && (
          createdGroupName ? (
            <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex gap-3">
              <Icon name="check_circle" className="text-emerald-500 shrink-0" size="sm" />
              <p className="text-13 text-slate-600 dark:text-slate-400 leading-relaxed">
                {CM.haGroupCreatedNotice(createdGroupName)}
              </p>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/10 rounded-xl space-y-3">
              <div className="flex gap-3">
                <Icon name="folder_open" className="text-slate-400 shrink-0" size="sm" />
                <div className="min-w-0">
                  <p className="text-14 font-bold text-slate-800 dark:text-slate-200">{CM.haNoGroupPromptTitle}</p>
                  <p className="text-13 text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">{CM.haNoGroupPromptDesc}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    size="sm"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder={CM.haNewGroupNamePlaceholder}
                    disabled={isCreatingGroup}
                    error={createGroupError}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="create_new_folder"
                  onClick={handleCreateGroup}
                  loading={isCreatingGroup}
                  disabled={!newGroupName.trim()}
                >
                  {CM.createGroupAndContinue}
                </Button>
              </div>
            </div>
          )
        )}

        <SectionHeader title={CM.peerNodes} icon="checklist" />
        <div className="space-y-2 max-h-[300px] overflow-y-auto px-1 custom-scrollbar">
          {filteredNodes.map((node, i) => (
            <div 
              key={i}
              onClick={() => setSelectedIndex(i)}
              className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none group
                ${selectedIndex === i 
                  ? 'bg-amber-500/5 border-amber-500/30 ring-1 ring-amber-500/10 shadow-sm' 
                  : 'bg-white dark:bg-white/2 border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/4'}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors
                  ${selectedIndex === i ? 'bg-amber-500/20 text-amber-600' : 'bg-slate-100 dark:bg-white/5 text-slate-400'}`}>
                  <Icon 
                    name={node.state === 'master' ? 'star' : node.state === 'replica' ? 'copy_all' : 'settings_backup_restore'} 
                    size="17px" 
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-14 font-bold text-slate-800 dark:text-slate-200 truncate">
                    {node.hostname || node.ip}
                  </p>
                  <p className="text-12 text-slate-400 dark:text-slate-500 truncate">
                    {node.ip && node.hostname ? `${node.ip} · ` : ''}{HA_ROLE_LABEL[node.state] || node.state}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div 
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
                    ${selectedIndex === i ? 'border-amber-500' : 'border-slate-300 dark:border-white/10'}`}
                >
                  {selectedIndex === i && <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
