import React, { useState, useEffect, useCallback } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { MenuItem, MenuDivider } from '../../../components/common/DropdownMenu';
import { ConfirmDialog } from '../../../components/ds/layout/ConfirmDialog';
import ContextMenuWrapper from '../../../components/common/ContextMenuWrapper';
import TabItem from './TabItem';
import { useCM } from '../../../constants/useCM';

export default function Breadcrumb({ 
  activeTab, 
  onTabChange, 
  openTabs = [], 
  onCloseTab, 
  onCloseOthers,
  onCloseAll,
  onReload,
  labels = {} 
}) {
  const CM = useCM();
  const [contextMenu, setContextMenu] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, title: '', message: '' });
  const { dirtyTabs } = useSelector((state) => state.layout, shallowEqual);
  const handleCloseTab = useCallback((tabId) => {
    if (dirtyTabs.includes(tabId)) {
      setConfirmModal({
        isOpen: true,
        title: CM.unsavedChangesTitle,
        message: CM.unsavedChangesDesc(labels[tabId] || tabId),
        onConfirm: () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          onCloseTab(tabId);
        }
      });
    } else {
      onCloseTab(tabId);
    }
  }, [CM, dirtyTabs, labels, onCloseTab]);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('scroll', handleClickOutside, true);
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('scroll', handleClickOutside, true);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) {
        if (activeTab) {
          e.preventDefault();
          handleCloseTab(activeTab);
        }
      }
    };
    const handleCloseActiveTabEvent = (e) => {
      if (activeTab) {
        e.preventDefault();
        handleCloseTab(activeTab);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('in-app:close-active-tab', handleCloseActiveTabEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('in-app:close-active-tab', handleCloseActiveTabEvent);
    };
  }, [activeTab, handleCloseTab]);

  useEffect(() => {
    if (dirtyTabs.length === 0) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtyTabs]);

  const handleCloseOthers = (tabId) => {
    const targetOthers = openTabs.filter(tid => tid !== tabId);
    const targetDirtyOthers = targetOthers.filter(tid => dirtyTabs.includes(tid));

    if (targetDirtyOthers.length === 0) {
      onCloseOthers(tabId);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: CM.unsavedChangesTitle,
      message: CM.unsavedChangesDesc(targetDirtyOthers.map(tid => labels[tid] || tid).join(', ')),
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        onCloseOthers(tabId);
      },
    });
  };

  const handleCloseAll = () => {
    const dirtyOpenTabs = openTabs.filter(tid => dirtyTabs.includes(tid));

    if (dirtyOpenTabs.length === 0) {
      onCloseAll();
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: CM.unsavedChangesTitle,
      message: CM.unsavedChangesDesc(dirtyOpenTabs.map(tid => labels[tid] || tid).join(', ')),
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        onCloseAll();
      },
    });
  };

  const handleContextMenu = (e, tabId) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  const getTabIcon = (id) => {
    if (id.startsWith('host:')) return 'dns';
    if (id.startsWith('db:')) return 'database';
    if (id.startsWith('edit_config:')) return 'settings_applications';
    if (id.startsWith('broker_config:')) return 'table_rows';
    if (id.startsWith('log:')) return 'description';
    return 'description';
  };

  const getTabLabel = (id) => {
    if (labels[id]) return labels[id];
    return id;
  };

  return (
    <div className="bg-slate-50 dark:bg-bk-main border-b border-slate-200 dark:border-white/5 font-sans relative">
      <div className="flex overflow-x-auto scrollbar-hide h-10" role="tablist">
        {openTabs.map((tabId) => (
          <TabItem
            key={tabId}
            tabId={tabId}
            isActive={activeTab === tabId}
            isDirty={dirtyTabs.includes(tabId)}
            label={getTabLabel(tabId)}
            icon={getTabIcon(tabId)}
            closeLabel={`${CM.closeTab}: ${getTabLabel(tabId)}`}
            onClick={() => onTabChange(tabId)}
            onClose={() => handleCloseTab(tabId)}
            onContextMenu={(e) => handleContextMenu(e, tabId)}
          />
        ))}
      </div>

      {contextMenu && (
        <ContextMenuWrapper 
          x={contextMenu.x} 
          y={contextMenu.y} 
          onClose={() => setContextMenu(null)}
        >
          <MenuItem 
            icon="close" 
            label={CM.closeTab} 
            onClick={() => {
              handleCloseTab(contextMenu.tabId);
              setContextMenu(null);
            }} 
          />
          <MenuItem 
            icon="close_fullscreen" 
            label={CM.closeOtherTabs} 
            onClick={() => {
              handleCloseOthers(contextMenu.tabId);
              setContextMenu(null);
            }} 
          />
          <MenuItem 
            icon="tab_close" 
            label={CM.closeAllTabs} 
            onClick={() => {
              handleCloseAll();
              setContextMenu(null);
            }} 
          />
          <MenuDivider />
          <MenuItem 
            icon="refresh" 
            label={CM.reloadTab} 
            onClick={() => {
              onReload?.(contextMenu.tabId);
              setContextMenu(null);
            }}
          />
        </ContextMenuWrapper>
      )}
 
      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        confirmLabel={CM.ok}
        variant="danger"
        testId="close-dirty-tab"
      />
    </div>
  );
}
