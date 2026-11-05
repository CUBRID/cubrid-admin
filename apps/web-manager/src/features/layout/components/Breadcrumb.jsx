import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { MenuItem, MenuDivider } from '../../../components/common/DropdownMenu';
import { ConfirmDialog } from '../../../components/ds/layout/ConfirmDialog';
import { Icon } from '../../../components/ds/foundation/Icon';
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
  const [overflowMenu, setOverflowMenu] = useState(null);
  const [tabOverflow, setTabOverflow] = useState({
    hasOverflow: false,
    canScrollBackward: false,
    canScrollForward: false,
  });
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    onConfirm: null,
    title: '',
    message: '',
    confirmLabel: '',
    variant: 'warning',
  });
  const tabBarRef = useRef(null);
  const tabScrollerRef = useRef(null);
  const { dirtyTabs } = useSelector((state) => state.layout, shallowEqual);

  const updateTabOverflow = useCallback(() => {
    const tabBar = tabBarRef.current;
    const tabScroller = tabScrollerRef.current;
    if (!tabBar || !tabScroller) return;

    const hasOverflow = tabScroller.scrollWidth > tabBar.clientWidth + 1;
    const maxScrollLeft = Math.max(0, tabScroller.scrollWidth - tabScroller.clientWidth);
    const nextState = {
      hasOverflow,
      canScrollBackward: hasOverflow && tabScroller.scrollLeft > 1,
      canScrollForward: hasOverflow && tabScroller.scrollLeft < maxScrollLeft - 1,
    };

    setTabOverflow((current) => (
      current.hasOverflow === nextState.hasOverflow
      && current.canScrollBackward === nextState.canScrollBackward
      && current.canScrollForward === nextState.canScrollForward
        ? current
        : nextState
    ));
  }, []);

  useLayoutEffect(() => {
    updateTabOverflow();
  }, [openTabs, labels, updateTabOverflow]);

  useEffect(() => {
    const tabBar = tabBarRef.current;
    const tabScroller = tabScrollerRef.current;
    if (!tabBar || !tabScroller) return undefined;

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateTabOverflow);
    observer?.observe(tabBar);
    observer?.observe(tabScroller);
    tabScroller.addEventListener('scroll', updateTabOverflow, { passive: true });
    window.addEventListener('resize', updateTabOverflow);

    return () => {
      observer?.disconnect();
      tabScroller.removeEventListener('scroll', updateTabOverflow);
      window.removeEventListener('resize', updateTabOverflow);
    };
  }, [updateTabOverflow]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const tabScroller = tabScrollerRef.current;
      const activeTabElement = tabScroller?.querySelector('[role="tab"][aria-selected="true"]');
      if (!tabScroller || !activeTabElement) return;

      const visibleStart = tabScroller.scrollLeft;
      const visibleEnd = visibleStart + tabScroller.clientWidth;
      const tabStart = activeTabElement.offsetLeft;
      const tabEnd = tabStart + activeTabElement.offsetWidth;

      if (tabStart < visibleStart) {
        tabScroller.scrollTo({ left: tabStart, behavior: 'smooth' });
      } else if (tabEnd > visibleEnd) {
        tabScroller.scrollTo({ left: tabEnd - tabScroller.clientWidth, behavior: 'smooth' });
      }
      updateTabOverflow();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, openTabs, updateTabOverflow]);
  const handleCloseTab = useCallback((tabId) => {
    if (dirtyTabs.includes(tabId)) {
      setConfirmModal({
        isOpen: true,
        title: CM.unsavedChangesTitle,
        message: CM.unsavedChangesDesc(labels[tabId] || tabId),
        variant: 'danger',
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
    const closeMenus = () => {
      setContextMenu(null);
      setOverflowMenu(null);
    };
    const handleScrollOutside = (event) => {
      if (event.target instanceof Element && event.target.closest('.context-menu-container')) {
        return;
      }
      closeMenus();
    };
    window.addEventListener('click', closeMenus);
    window.addEventListener('scroll', handleScrollOutside, true);
    return () => {
      window.removeEventListener('click', closeMenus);
      window.removeEventListener('scroll', handleScrollOutside, true);
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
    if (targetOthers.length === 0) return;

    const confirmationMessage = CM.confirmCloseOtherTabsDesc(targetOthers.length);
    const dirtyWarning = targetDirtyOthers.length > 0
      ? ` ${CM.unsavedChangesDesc(targetDirtyOthers.map(tid => labels[tid] || tid).join(', '))}`
      : '';

    setConfirmModal({
      isOpen: true,
      title: CM.closeOtherTabs,
      message: `${confirmationMessage}${dirtyWarning}`,
      confirmLabel: CM.closeOtherTabs,
      variant: targetDirtyOthers.length > 0 ? 'danger' : 'warning',
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        onCloseOthers(tabId);
      },
    });
  };

  const handleCloseAll = () => {
    const dirtyOpenTabs = openTabs.filter(tid => dirtyTabs.includes(tid));
    if (openTabs.length === 0) return;

    const confirmationMessage = CM.confirmCloseAllTabsDesc(openTabs.length);
    const dirtyWarning = dirtyOpenTabs.length > 0
      ? ` ${CM.unsavedChangesDesc(dirtyOpenTabs.map(tid => labels[tid] || tid).join(', '))}`
      : '';

    setConfirmModal({
      isOpen: true,
      title: CM.closeAllTabs,
      message: `${confirmationMessage}${dirtyWarning}`,
      confirmLabel: CM.closeAllTabs,
      variant: dirtyOpenTabs.length > 0 ? 'danger' : 'warning',
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        onCloseAll();
      },
    });
  };

  const handleContextMenu = (e, tabId) => {
    e.preventDefault();
    setOverflowMenu(null);
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  const scrollTabsByPage = (direction) => {
    const tabScroller = tabScrollerRef.current;
    if (!tabScroller) return;
    const pageWidth = Math.max(120, tabScroller.clientWidth * 0.85);
    tabScroller.scrollBy({ left: direction * pageWidth, behavior: 'smooth' });
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
    <div
      ref={tabBarRef}
      data-testid="top-tab-bar"
      className="bg-slate-50 dark:bg-bk-main border-b border-slate-200 dark:border-white/5 font-sans relative flex min-w-0"
    >
      <div
        ref={tabScrollerRef}
        data-testid="top-tab-scroller"
        className="flex flex-1 min-w-0 overflow-x-auto h-10 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        onScroll={updateTabOverflow}
      >
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

      {tabOverflow.hasOverflow && (
        <div
          data-testid="tab-overflow-controls"
          className="flex h-10 shrink-0 items-center border-l border-slate-200 bg-slate-50 px-1 shadow-[-8px_0_12px_-10px_rgba(15,23,42,0.55)] dark:border-white/6 dark:bg-bk-main"
        >
          <button
            type="button"
            data-testid="previous-tabs-btn"
            aria-label={CM.previousTabs}
            title={CM.previousTabs}
            disabled={!tabOverflow.canScrollBackward}
            onClick={() => scrollTabsByPage(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-amber-600 disabled:pointer-events-none disabled:opacity-30 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-amber-500"
          >
            <Icon name="chevron_left" size="17px" weight={400} />
          </button>
          <button
            type="button"
            data-testid="next-tabs-btn"
            aria-label={CM.nextTabs}
            title={CM.nextTabs}
            disabled={!tabOverflow.canScrollForward}
            onClick={() => scrollTabsByPage(1)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-amber-600 disabled:pointer-events-none disabled:opacity-30 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-amber-500"
          >
            <Icon name="chevron_right" size="17px" weight={400} />
          </button>
          <button
            type="button"
            data-testid="all-tabs-menu-btn"
            aria-label={CM.showAllTabs}
            aria-haspopup="menu"
            aria-expanded={Boolean(overflowMenu)}
            title={CM.showAllTabs}
            onClick={(event) => {
              event.stopPropagation();
              setContextMenu(null);
              if (overflowMenu) {
                setOverflowMenu(null);
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              setOverflowMenu({ x: rect.right, y: rect.bottom + 4 });
            }}
            className="context-menu-trigger flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-amber-600 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-amber-500"
          >
            <Icon name="more_horiz" size="17px" weight={400} />
          </button>
        </div>
      )}

      {overflowMenu && (
        <ContextMenuWrapper
          x={overflowMenu.x}
          y={overflowMenu.y}
          onClose={() => setOverflowMenu(null)}
          width="w-72"
        >
          <div data-testid="all-tabs-menu-list" className="max-h-80 overflow-y-auto custom-scrollbar">
            {openTabs.map((tabId) => {
              const label = getTabLabel(tabId);
              const isActive = activeTab === tabId;
              const isDirty = dirtyTabs.includes(tabId);
              return (
                <MenuItem
                  key={tabId}
                  icon={getTabIcon(tabId)}
                  iconColor={isActive ? 'text-amber-500' : ''}
                  label={(
                    <span className="flex min-w-0 items-center gap-2" title={label}>
                      <span className={`truncate ${isActive ? 'font-bold text-amber-600 dark:text-amber-500' : ''}`}>
                        {label}
                      </span>
                      {isDirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-label={CM.unsavedChangesTitle} />}
                    </span>
                  )}
                  onClick={() => {
                    onTabChange(tabId);
                    setOverflowMenu(null);
                  }}
                />
              );
            })}
          </div>
        </ContextMenuWrapper>
      )}

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
        confirmLabel={confirmModal.confirmLabel || CM.ok}
        variant={confirmModal.variant}
        testId="close-dirty-tab"
      />
    </div>
  );
}
