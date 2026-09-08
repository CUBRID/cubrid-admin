import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { fetchBrokerLogs, fetchDatabaseLogs, fetchLogContent } from '../brokerSlice';
import { Icon } from '../../../components/ds/foundation/Icon';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { Spinner } from '../../../components/ds/foundation/Spinner';
import { useCM } from '../../../constants/useCM';

// ─── Constants & Helpers (Reused from LogViewer.jsx) ─────────────────────────
const HighlightedLine = ({ line }) => {
  if (!line) return <span>&nbsp;</span>;
  const PATTERNS = [
    { type: 'timestamp', re: /(\d{2,4}[-./]\d{2}[-./]\d{2,4}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)/g },
    { type: 'error',     re: /\b(ERROR|FATAL|ERR|FAIL)\b/gi },
    { type: 'warn',      re: /\b(WARN|WARNING)\b/gi },
    { type: 'success',   re: /\b(SUCCESS)\b/gi },
    { type: 'path',      re: /(\/[a-zA-Z0-9._\-/]+)/g },
    { type: 'keyword',   re: /\b(SQL|TRAN|CLIENT|SERVER|EID|CODE|FILE|LINE|Time|Tran|bind|execute)\b/g },
    { type: 'number',    re: /\b(-?\d+(?:\.\d+)?)\b/g },
  ];
  const COLORS = {
    timestamp: 'text-slate-400',
    error:     'text-rose-500 font-semibold',
    warn:      'text-amber-500 font-semibold',
    success:   'text-emerald-500 font-semibold',
    path:      'text-violet-500',
    keyword:   'text-sky-500 dark:text-sky-400',
    number:    'text-orange-500',
  };
  let hits = [];
  PATTERNS.forEach(({ type, re }) => {
    const r = new RegExp(re);
    let m;
    while ((m = r.exec(line)) !== null) hits.push({ s: m.index, e: m.index + m[0].length, v: m[0], type });
  });
  hits.sort((a, b) => a.s - b.s);
  const clean = []; let end = 0;
  for (const h of hits) if (h.s >= end) { clean.push(h); end = h.e; }

  const parts = []; let pos = 0;
  clean.forEach((h, i) => {
    if (h.s > pos) parts.push(line.substring(pos, h.s));
    parts.push(<span key={i} className={COLORS[h.type]}>{h.v}</span>);
    pos = h.e;
  });
  if (pos < line.length) parts.push(line.substring(pos));
  return <span>{parts}</span>;
};

// Individual Log Section
const LogSection = ({ hostUid, path, isExpanded, onToggleExpanded, isDb }) => {
  const CM = useCM();
  const dispatch = useDispatch();
  const logState = useSelector(s => s.broker.viewingLogs[path], shallowEqual);
  const loading = logState?.loading;
  const fileName = path.split('/').pop();
  const lines = logState?.data?.log?.[0]?.line || [];
  const totalLines = parseInt(logState?.data?.total || '0');

  useEffect(() => {
    if (isExpanded && !logState?.data && !loading) {
      // Fetch last 100 lines by default if expanded and no data
      dispatch(fetchLogContent({ hostUid, path, start: '1', end: '100' }));
    }
  }, [dispatch, hostUid, path, isExpanded, logState?.data, loading]);

  const handleRefresh = (e) => {
    e.stopPropagation();
    dispatch(fetchLogContent({ hostUid, path, start: '1', end: '100' }));
  };

  const textAccent = isDb ? 'text-emerald-600 dark:text-emerald-500' : 'text-amber-600 dark:text-bk-yellow';
  const bgAccent = isDb ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-amber-50 dark:bg-amber-900/20';

  return (
    <div data-testid={`log-section-${fileName}`} className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-bk-side overflow-hidden shadow-xs transition-all">
      {/* Card Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-white/2 cursor-pointer select-none border-b border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-white/4 transition-colors"
        onClick={onToggleExpanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon 
            name="expand_more" 
            size="sm" 
            className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
          />
          <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${bgAccent}`}>
            <Icon name="description" size="17px" className={textAccent} />
          </div>
          <span className="text-15 font-semibold font-mono text-slate-800 dark:text-slate-200 truncate">
            {fileName}
          </span>
          {totalLines > 0 && (
            <span className="text-12 px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium rounded">
              {totalLines} lines
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {loading && <Spinner size="xs" />}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className={`p-1.5 rounded-md text-slate-400 hover:${textAccent} hover:bg-slate-200/50 dark:hover:bg-white/10 transition-all disabled:opacity-50`}
            title={CM.refreshLog}
          >
            <Icon name="refresh" size="17px" className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Card Content */}
      {isExpanded && (
        <div className="bg-white dark:bg-bk-side max-h-[400px] overflow-auto font-mono text-14">
          {loading && !lines.length ? (
            <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
              <Spinner size="sm" />
              <span className="text-sm">{CM.loadingLogLines}</span>
            </div>
          ) : lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 opacity-40">
              <Icon name="block" size="md" weight={300} />
              <span className="italic mt-1">{CM.noContentAvailableShort}</span>
            </div>
          ) : (
            <div className="py-1">
              {lines.map((l, i) => (
                <div
                  key={i}
                  className="flex gap-4 px-4 py-0.5 hover:bg-slate-50 dark:hover:bg-white/5 group transition-colors border-b border-slate-100/50 dark:border-white/2"
                >
                  <span className={`w-10 shrink-0 text-right text-13 text-slate-300 dark:text-slate-600 group-hover:${textAccent} select-none font-semibold pt-0.5`}>
                    {i + 1}
                  </span>
                  <div className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
                    <HighlightedLine line={l} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function AllLogsViewer({ type = 'broker', hostUid, targetName }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const [expandedLogs, setExpandedLogs] = useState({});
  const hasInitialized = useRef(false);
  const isDb = type === 'database';

  // ─── Dynamic Branding Configurations ─────────────────────────────────────
  const config = {
    icon: isDb ? 'dns' : 'history_edu',
    title: isDb ? CM.allServerLogsTitle(targetName) : CM.allSqlLogsTitle(targetName),
    subtitle: isDb ? CM.aggregateServerLogsDesc : CM.aggregateCasLogsDesc,
    downloadPrefix: isDb ? 'CUBRID SERVER DB LOG DUMP' : 'CUBRID BROKER SQL LOG DUMP',
    downloadSuffix: isDb ? 'all_db_logs' : 'all_logs',
    iconAccent: isDb ? 'text-emerald-600 dark:text-emerald-500' : 'text-amber-600 dark:text-bk-yellow',
    bgAccent: isDb ? 'bg-emerald-500/10' : 'bg-amber-500/10',
    borderAccent: isDb ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-500/10' : 'border-amber-500/40 text-amber-600 dark:text-bk-yellow hover:bg-amber-500/10',
  };

  // ─── Data Selectors & Resolvers ──────────────────────────────────────────
  const logsList = useSelector(s => 
    isDb ? s.broker.dbLogsByDbName[targetName] : s.broker.logsByBroker[targetName], 
    shallowEqual
  );
  const logsLoading = useSelector(s => 
    isDb ? s.broker.dbLogsLoading : s.broker.logsLoading
  );
  const viewingLogs = useSelector(s => s.broker.viewingLogs, shallowEqual);

  // Memoized logic filters out everything but .log files for brokers
  const targetLogs = useMemo(() => {
    const raw = logsList || [];
    return isDb ? raw : raw.filter(l => l.path.toLowerCase().endsWith('.log'));
  }, [logsList, isDb]);

  const handleFetchLogsList = () => {
    return isDb 
      ? dispatch(fetchDatabaseLogs({ hostUid, dbname: targetName }))
      : dispatch(fetchBrokerLogs({ hostUid, brokerName: targetName }));
  };

  // Load logs list if they aren't available
  useEffect(() => {
    if (!logsList && !logsLoading) {
      handleFetchLogsList();
    }
  }, [dispatch, hostUid, targetName, logsList, logsLoading, isDb]);

  // Expand all logs once they are available on the initial mount
  useEffect(() => {
    if (targetLogs.length > 0 && !hasInitialized.current) {
      const defaults = {};
      targetLogs.forEach(log => {
        defaults[log.path] = true;
      });
      setExpandedLogs(defaults);
      hasInitialized.current = true;
    }
  }, [targetLogs]);

  const handleToggleExpanded = (path) => {
    setExpandedLogs(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  const handleExpandAll = () => {
    const allExpanded = {};
    targetLogs.forEach(log => {
      allExpanded[log.path] = true;
    });
    setExpandedLogs(allExpanded);
  };

  const handleCollapseAll = () => {
    setExpandedLogs({});
  };

  const handleRefreshAll = () => {
    handleFetchLogsList().then(() => {
      targetLogs.forEach(log => {
        if (expandedLogs[log.path]) {
          dispatch(fetchLogContent({ hostUid, path: log.path, start: '1', end: '100' }));
        }
      });
    });
  };

  const handleDownloadAll = () => {
    let content = `============================================================\n`;
    content += `${config.downloadPrefix}\n`;
    content += `${isDb ? CM.database.toUpperCase() : CM.broker.toUpperCase()}: ${targetName}\n`;
    content += `HOST UID: ${hostUid}\n`;
    content += `DUMPED AT: ${new Date().toLocaleString()}\n`;
    content += `============================================================\n\n`;

    targetLogs.forEach(log => {
      const fileName = log.path.split('/').pop();
      const logState = viewingLogs[log.path];
      const lines = logState?.data?.log?.[0]?.line || [];
      
      content += `############################################################\n`;
      content += `# FILE: ${fileName}\n`;
      content += `# PATH: ${log.path}\n`;
      content += `############################################################\n\n`;
      
      if (lines.length > 0) {
        content += lines.join('\n') + '\n\n';
      } else {
        content += `${CM.noCachedLogLinesMsg}\n\n`;
      }
    });
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${targetName}_${config.downloadSuffix}_${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div data-testid="all-logs-viewer" className="flex-1 flex flex-col bg-slate-50 dark:bg-bk-main overflow-hidden">
      {/* Top Toolbar */}
      <div className="shrink-0 px-5 py-3 bg-white dark:bg-bk-side border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shadow-xs z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl ${config.bgAccent} flex items-center justify-center shrink-0`}>
            <Icon name={config.icon} size="sm" className={config.iconAccent} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight truncate leading-tight">
              {config.title}
            </h2>
            <p className="text-13 text-slate-400 dark:text-slate-500 font-medium mt-0.5">
              {config.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex border border-slate-200 dark:border-white/10 rounded-lg overflow-hidden">
            <button
              data-testid="all-logs-expand-all-btn"
              onClick={handleExpandAll}
              className="px-3 py-1.5 text-13 font-bold bg-white dark:bg-white/2 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-white/10 transition-colors"
            >
              {CM.expandAllBtn}
            </button>
            <button
              data-testid="all-logs-collapse-all-btn"
              onClick={handleCollapseAll}
              className="px-3 py-1.5 text-13 font-bold bg-white dark:bg-white/2 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 transition-colors"
            >
              {CM.collapseAllBtn}
            </button>
          </div>

          <button
            data-testid="all-logs-refresh-all-btn"
            onClick={handleRefreshAll}
            disabled={logsLoading}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border bg-transparent transition-all active:scale-[0.98] text-13 font-bold shadow-xs ${config.borderAccent}`}
          >
            <Icon name="refresh" size="17px" className={logsLoading ? 'animate-spin' : ''} />
            {CM.refreshAllBtn}
          </button>

          <button
            data-testid="all-logs-download-all-btn"
            onClick={handleDownloadAll}
            disabled={targetLogs.length === 0}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border bg-transparent transition-all active:scale-[0.98] text-13 font-bold shadow-xs ml-1 ${config.borderAccent}`}
            title={CM.downloadAllLogs}
          >
            <Icon name="download" size="17px" />
            {CM.downloadAllBtn}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {logsLoading && !targetLogs.length ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
            <Spinner size="lg" />
            <p className="text-slate-500 dark:text-slate-400 text-sm">{CM.scanningForLogFiles}</p>
          </div>
        ) : targetLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12 bg-white dark:bg-bk-side border border-dashed border-slate-200 dark:border-slate-800 rounded-xl mx-auto max-w-md mt-10">
            <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
              <Icon name="block" size="md" weight={300} className="text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">{CM.noLogFilesFound}</h3>
            <p className="text-xs text-slate-400 mt-1 px-6">{CM.noLogFilesFoundMsg}</p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto flex flex-col gap-4">
            {targetLogs.map((log) => (
              <LogSection 
                key={log.path}
                hostUid={hostUid}
                path={log.path}
                isExpanded={!!expandedLogs[log.path]}
                onToggleExpanded={() => handleToggleExpanded(log.path)}
                isDb={isDb}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="shrink-0 px-5 py-2.5 bg-white dark:bg-bk-side border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-12 text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider">
        <div className="flex items-center gap-4 font-medium">
          <span>{CM.totalFilesLabel(targetLogs.length)}</span>
          <span>{CM.hostColonLabel(hostUid)}</span>
        </div>
        <StatusBadge label={CM.monitoring} variant="emerald" pulse className="border-none bg-transparent" />
      </div>
    </div>
  );
}

export default AllLogsViewer;
