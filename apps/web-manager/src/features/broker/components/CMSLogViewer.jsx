import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchCMSLogs } from '../brokerSlice';
import { useCM } from '../../../constants/useCM';

import { Icon } from '../../../components/ds/foundation/Icon';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { Spinner } from '../../../components/ds/foundation/Spinner';
import { PageToolbar } from '../../../components/ds/layout/PageToolbar';
import { EmptyState } from '../../../components/ds/layout/EmptyState';
import ContextMenuWrapper from '../../../components/common/ContextMenuWrapper';
import { MenuItem, MenuDivider } from '../../../components/common/DropdownMenu';

function CMSLogViewer({ hostUid, type }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [copying, setCopying] = useState(false);
  const [toolbarMenu, setToolbarMenu] = useState(null);
  const pageSize = 50;

  const cmsLogs = useSelector((state) => state.broker.cmsLogsByHost[hostUid]);
  const loading = useSelector((state) => state.broker.cmsLogsLoading);

  const logs = type === 'access' ? cmsLogs?.accesslog : cmsLogs?.errorlog;
  const title = type === 'access' ? CM.managerAccessLogTitle : CM.managerErrorLogTitle;
  const icon = type === 'access' ? 'login' : 'report';

  const totalEntries = logs?.length || 0;
  const totalPages = Math.ceil(totalEntries / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedLogs = showAll ? (logs || []) : (logs?.slice(startIndex, startIndex + pageSize) || []);

  const handleRefresh = () => {
    dispatch(fetchCMSLogs(hostUid));
  };

  // The log tree fetches on expand; a tab restored without that fetch would
  // otherwise wait forever on the loading state below.
  useEffect(() => {
    if (cmsLogs === undefined && !loading) dispatch(fetchCMSLogs(hostUid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostUid]);

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handleCopy = () => {
    const text = paginatedLogs.map(l => `[${l.time}] [${l['@user'] || CM.systemFallback}] [${l.taskname}] ${type === 'error' ? l.errornote : CM.successLabel}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  useEffect(() => {
    if (!toolbarMenu) return undefined;
    const closeMenu = (event) => {
      if (!event.target.closest('.context-menu-container, .cms-log-toolbar-menu-trigger')) {
        setToolbarMenu(null);
      }
    };
    document.addEventListener('mousedown', closeMenu, true);
    return () => document.removeEventListener('mousedown', closeMenu, true);
  }, [toolbarMenu]);

  // undefined = not fetched yet, null = the fetch failed (shown below).
  if (cmsLogs === undefined) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-bk-main" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" className="text-amber-500" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{CM.loadingManagerLogs}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-bk-main overflow-hidden font-mono">
      <PageToolbar
        icon={icon}
        title={title}
        subtitle={CM.managerSystemActivity}
        iconClassName={type === 'access' ? 'text-amber-600 dark:text-bk-yellow' : 'text-rose-500'}
        iconContainerClassName={type === 'access' ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-rose-50 dark:bg-rose-900/20'}
        actions={(
          <>
          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={paginatedLogs.length === 0}
            title={CM.copyVisibleEntries}
            aria-label={CM.copyVisibleEntries}
            className={`log-toolbar-wide-only w-8 h-8 flex items-center justify-center rounded-lg border transition-all active:scale-[0.98] disabled:opacity-30
              ${copying
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 !w-auto !px-3 font-bold !gap-1.5 text-12'
                : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-bk-yellow hover:border-amber-500/50 dark:hover:border-bk-yellow/50 hover:bg-white dark:hover:bg-white/5 shadow-xs'}`}
          >
            <Icon name={copying ? 'check' : 'content_copy'} size="19px" weight={300} />
            {copying && <span className="tracking-tight">{CM.copiedLabel}</span>}
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            title={CM.refresh}
            aria-label={CM.refresh}
            className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all active:scale-[0.98]
              ${loading
                ? 'bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-white/5 cursor-not-allowed opacity-50'
                : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-bk-yellow hover:border-amber-500/50 dark:hover:border-bk-yellow/50 hover:bg-white dark:hover:bg-white/5 shadow-xs'}`}
          >
            <Icon name="refresh" size="19px" weight={loading ? 700 : 300} className={loading ? 'animate-spin' : ''} />
          </button>

          <div className="log-toolbar-wide-only h-4 w-px bg-slate-200 dark:bg-white/10 mx-0.5" />

          {/* Pagination */}
          <div className="flex items-center bg-slate-100 dark:bg-black/20 rounded-lg p-0.5">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={currentPage === 1 || loading || showAll}
              aria-label={CM.previousPage}
              className="p-1 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-amber-600 dark:hover:text-bk-yellow rounded-md transition-all disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Icon name="chevron_left" size="19px" />
            </button>
            <div className={`px-3 text-13 font-bold text-slate-600 dark:text-slate-300 min-w-[72px] text-center font-mono ${showAll ? 'opacity-30' : ''}`}>
              {currentPage} / {totalPages}
            </div>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={currentPage >= totalPages || loading || showAll}
              aria-label={CM.nextPage}
              className="p-1 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-amber-600 dark:hover:text-bk-yellow rounded-md transition-all disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Icon name="chevron_right" size="19px" />
            </button>

            <div className="log-toolbar-wide-only w-px h-4 bg-slate-200 dark:bg-white/10 mx-1" />
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className={`log-toolbar-wide-only px-2 py-1 rounded-md text-12 font-bold transition-all whitespace-nowrap ${
                showAll 
                ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20' 
                : 'text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-white/5 hover:text-amber-600 dark:hover:text-bk-yellow'
              }`}
            >
              {showAll ? CM.paginated : CM.viewAll}
            </button>
          </div>

          <button
            type="button"
            className="cms-log-toolbar-menu-trigger log-toolbar-overflow-action w-8 h-8 items-center justify-center rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400"
            title={CM.moreActions}
            aria-label={CM.moreActions}
            aria-expanded={Boolean(toolbarMenu)}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setToolbarMenu(toolbarMenu ? null : { x: rect.right, y: rect.bottom + 4 });
            }}
          >
            <Icon name="more_horiz" size="18px" />
          </button>
        </>
        )}
      />

      {toolbarMenu && (
        <ContextMenuWrapper x={toolbarMenu.x} y={toolbarMenu.y} width="w-48" onClose={() => setToolbarMenu(null)}>
          <MenuItem icon="content_copy" label={CM.copyVisibleEntries} disabled={paginatedLogs.length === 0} onClick={() => { handleCopy(); setToolbarMenu(null); }} />
          <MenuDivider />
          <MenuItem icon={showAll ? 'view_list' : 'view_stream'} label={showAll ? CM.paginated : CM.viewAll} onClick={() => { setShowAll(!showAll); setToolbarMenu(null); }} />
        </ContextMenuWrapper>
      )}

      {/* Log List - One line format */}
      <div className="flex-1 overflow-auto bg-white dark:bg-bk-side">
        {cmsLogs === null ? (
          <EmptyState className="h-full" icon="error" title={CM.dataUnavailableTitle} description={CM.dataUnavailableMsg} />
        ) : !paginatedLogs || paginatedLogs.length === 0 ? (
          <EmptyState className="h-full" icon="inbox" title={CM.noLogEntriesFound} />
        ) : (
          <div className="min-w-[680px]">
            <div className="sticky top-0 z-10 flex items-center gap-4 px-4 py-2 bg-slate-100 dark:bg-[#252525] border-b border-slate-200 dark:border-slate-800 text-12 font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              <div className="w-36 shrink-0">{CM.timeLabel}</div>
              <div className="w-24 shrink-0">{CM.userLabel}</div>
              <div className="w-40 shrink-0">{CM.taskLabel}</div>
              <div className="flex-1">{CM.detailNoteHeader}</div>
            </div>
            {paginatedLogs.map((log, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-4 px-4 py-2 border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group text-14 leading-relaxed"
              >
                <div className="w-36 shrink-0 text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors">
                  {log.time}
                </div>
                <div className="w-24 shrink-0 flex items-center gap-2">
                  <Icon name="person" size="sm" weight={300} className="text-slate-400 dark:text-slate-600" />
                  <span className="text-slate-700 dark:text-slate-300 font-medium truncate">{log['@user'] || 'System'}</span>
                </div>
                <div className="w-40 shrink-0">
                  <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-sm border border-indigo-500/20 text-12 font-bold tracking-tighter">
                    {log.taskname}
                  </span>
                </div>
                <div className="flex-1 min-w-0 truncate">
                  {type === 'error' ? (
                    <div className="flex gap-2 items-center">
                      <span className="text-rose-500 dark:text-rose-400 font-bold text-12 bg-rose-400/10 px-1 rounded-sm shrink-0">{CM.errLabel}</span>
                      <span className="text-slate-600 dark:text-slate-300 truncate" title={log.errornote?.replace('<end>', '')}>
                        {log.errornote?.replace('<end>', '')}
                      </span>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold text-12 bg-emerald-400/10 px-1 rounded-sm shrink-0">{CM.successLabel}</span>
                      <span className="text-slate-500 dark:text-slate-400 italic">{CM.operationCompletedLabel(log.taskname)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="shrink-0 px-4 py-2 bg-white dark:bg-bk-side border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-12 text-slate-500 dark:text-slate-400 font-medium tracking-tight">
        <div className="flex items-center gap-4">
          <span>{CM.totalEntriesLabel(totalEntries.toLocaleString())}</span>
          {showAll ? (
             <span>{CM.showingAllRecords}</span>
          ) : (
             <span>{CM.showingRangeLabel(totalEntries === 0 ? 0 : startIndex + 1, Math.min(startIndex + pageSize, totalEntries))}</span>
          )}
        </div>
        <StatusBadge label={CM.connected} variant="emerald" className="border-none bg-transparent" />
      </div>
    </div>
  );
}

export default CMSLogViewer;
