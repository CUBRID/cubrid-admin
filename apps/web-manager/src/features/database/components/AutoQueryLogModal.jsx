import React, { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeAutoQueryLogModal, fetchQueryPlanLog } from '../databaseSlice';
import { useCM } from '../../../constants/useCM';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Table } from '../../../components/ds/layout/Table';
import { SearchInput } from '../../../components/ds/forms/SearchInput';
import { Typography } from '../../../components/ds/foundation/Typography';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';

export default function AutoQueryLogModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isAutoQueryLogModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { queryPlanLogs, logsLoading } = useSelector((state) => state.databaseOperation, shallowEqual);
  const { selectedDatabase } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const pageSize = 15;

  useEffect(() => {
    if (isAutoQueryLogModalOpen && selectedHostUid) {
      dispatch(fetchQueryPlanLog({ hostUid: selectedHostUid }));
    }
  }, [isAutoQueryLogModalOpen, selectedHostUid, dispatch]);

  // Reset pagination when search term or database context changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDatabase]);

  // Hooks must be at the top level
  const filteredLogs = useMemo(() => {
    return (queryPlanLogs || []).filter(log => {
      if (!log) return false;

      // Robust DB matching: Case-insensitive and handle missing/prefixed properties
      const logDb = (log.dbname || log.db_name || log['@dbname'] || log.db || '').toString().trim();
      const selectedDBName = (selectedDatabase || '').toString().trim();

      const matchesDB = !selectedDBName ||
        logDb.toLowerCase() === selectedDBName.toLowerCase() ||
        logDb === '';

      const matchesSearch = !searchTerm ||
        log.query_id?.toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.error_desc?.toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
        logDb.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesDB && matchesSearch;
    });
  }, [queryPlanLogs, selectedDatabase, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const startIdx = (currentPage - 1) * pageSize;
  const paginatedLogs = showAll ? filteredLogs : filteredLogs.slice(startIdx, startIdx + pageSize);

  if (!isAutoQueryLogModalOpen) return null;

  const columns = [
    {
      header: CM.queryIdentifierLabel,
      accessor: 'query_id',
      render: (val) => (
        <span className="text-sky-600 dark:text-sky-400 italic font-mono">{val}</span>
      )
    },
    {
      header: CM.executionTime,
      accessor: 'error_time',
      className: 'w-[180px]'
    },
    {
      header: CM.description,
      accessor: 'error_desc',
      render: (val) => {
        const isSuccess = val?.toLowerCase().includes('success');
        const isStart = val?.toLowerCase().includes('auto job start');

        return (
          <div className="flex items-center gap-2.5 text-14">
            {isSuccess ? (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <span className="flex-shrink-0">
                  <Icon name="check_circle" size="sm" weight={300} className="fill-current" />
                </span>
                <span className="truncate">{val}</span>
              </div>
            ) : isStart ? (
              <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
                <span className="flex-shrink-0">
                  <Icon name="play_circle" size="sm" weight={300} className="animate-pulse" />
                </span>
                <span className="truncate">{val}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-rose-500 dark:text-rose-400">
                <span className="flex-shrink-0">
                  <Icon name="report" size="sm" weight={300} />
                </span>
                <span className="truncate">{val}</span>
              </div>
            )}
          </div>
        );
      }
    }
  ];

  const footer = (
    <div className="flex items-center justify-between w-full px-1">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <Typography variant="caption" className="font-bold text-slate-400 dark:text-slate-500 text-12">{CM.status}:</Typography>
          {logsLoading ? (
            <StatusBadge label={CM.buffering} variant="sky" pulse={true} className="rounded-full" />
          ) : (
            <StatusBadge label={CM.synchronizedStatus} variant="emerald" pulse={false} className="rounded-full" />
          )}
        </div>
        
        <div className="flex items-center gap-2 text-12 text-slate-400 dark:text-slate-500 font-bold">
          <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-white/10" />
          {showAll ? (
            <span>{CM.showingAllRecordsCount(filteredLogs.length)}</span>
          ) : (
            <span>{CM.showingRangeOfTotal(Math.min(filteredLogs.length, startIdx + 1), Math.min(filteredLogs.length, startIdx + pageSize), filteredLogs.length)}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <Button
          variant="secondary"
          onClick={() => dispatch(closeAutoQueryLogModal())}
          className="min-w-[100px]"
        >
          {CM.close}
        </Button>
        <Button
          variant="primary"
          onClick={() => dispatch(fetchQueryPlanLog({ hostUid: selectedHostUid }))}
          loading={logsLoading}
          icon="refresh"
          className="min-w-[120px] shadow-lg shadow-amber-500/10"
        >
          {CM.refresh}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isAutoQueryLogModalOpen}
      onClose={() => dispatch(closeAutoQueryLogModal())}
      title={CM.autoQueryLog}
      subtitle={selectedDatabase ? CM.historyForDatabase(selectedDatabase) : CM.globalQueryHistory}
      icon="history"
      iconVariant="info"
      maxWidth="max-w-[800px]"
      footer={footer}
    >
      <div className="flex flex-col h-[520px]">
        {/* Toolbar matches LogViewer style */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SearchInput
              placeholder={CM.filterLogsById}
              value={searchTerm}
              onChange={setSearchTerm}
              onClear={() => setSearchTerm('')}
              className="max-w-xs"
            />

            {/* LogViewer-style Pagination */}
            <div className="flex items-center bg-slate-100 dark:bg-black/20 rounded-lg p-0.5 h-8">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || logsLoading || showAll}
                className="p-1 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-amber-600 dark:hover:text-amber-400 rounded-md transition-all disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Icon name="chevron_left" size="19px" />
              </button>
              <div className={`px-3 text-13 font-bold text-slate-600 dark:text-slate-300 min-w-[72px] text-center font-mono ${showAll ? 'opacity-30' : ''}`}>
                {currentPage} / {totalPages}
              </div>
              <button
                onClick={() => setCurrentPage(p => currentPage < totalPages ? p + 1 : p)}
                disabled={currentPage >= totalPages || logsLoading || showAll}
                className="p-1 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-amber-600 dark:hover:text-amber-400 rounded-md transition-all disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Icon name="chevron_right" size="19px" />
              </button>

              <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1" />
              <button
                onClick={() => setShowAll(!showAll)}
                className={`px-2 py-1 rounded-md text-12 font-bold transition-all whitespace-nowrap transition-colors ${
                  showAll 
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20' 
                  : 'text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-white/5 hover:text-amber-600 dark:hover:text-amber-400'
                }`}
              >
                {showAll ? CM.paginated : CM.viewAll}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Typography variant="caption" className="text-slate-400 font-semibold font-mono">
              {CM.recordsCountLabel(filteredLogs.length)}
            </Typography>
          </div>
        </div>

        <div className="flex-1 min-h-0 border border-slate-100 dark:border-white/5 rounded-xl overflow-y-auto custom-scrollbar bg-white/50 dark:bg-bk-side/50">
          <Table
            columns={columns}
            data={paginatedLogs}
            loading={logsLoading}
            emptyMessage={CM.noExecutionLogsFoundMsg}
            className="h-full"
          />
        </div>
      </div>
    </Modal>
  );
}


