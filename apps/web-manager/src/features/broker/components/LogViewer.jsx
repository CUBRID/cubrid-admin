import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchLogContent } from '../brokerSlice';
import { extractSQL } from '../logParsingUtils';
import { analyzeTopSQL } from '../topSQLAnalysis';
import { brokerApi } from '../brokerApi';
import { Icon } from '../../../components/ds/foundation/Icon';
import { PageToolbar } from '../../../components/ds/layout/PageToolbar';
import ContextMenuWrapper from '../../../components/common/ContextMenuWrapper';
import { MenuItem, MenuDivider } from '../../../components/common/DropdownMenu';
import { useCM } from '../../../constants/useCM';

// ─── Constants ────────────────────────────────────────────────────────────────
const MODE_KEYS = [
  { key: 'raw', cmKey: 'rawLog',    icon: 'subject'     },
  { key: 'sql', cmKey: 'parsedSQL', icon: 'code'        },
  { key: 'top', cmKey: 'topSQL',    icon: 'query_stats' },
];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ─── Syntax highlighting ──────────────────────────────────────────────────────
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
  const hits = [];
  PATTERNS.forEach(({ type, re }) => {
    const r = new RegExp(re);
    let m;
    while ((m = r.exec(line)) !== null) hits.push({ s: m.index, e: m.index + m[0].length, v: m[0], type });
  });
  hits.sort((a, b) => a.s - b.s);
  // de-overlap
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

// ─── SQL Syntax Highlighter ──────────────────────────────────────────────────
const SQL_KEYWORDS_RE = /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|IS|NULL|AS|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|VIEW|DATABASE|SCHEMA|TRUNCATE|GRANT|REVOKE|COMMIT|ROLLBACK|PREPARE|EXECUTE|BETWEEN|LIKE|CASE|WHEN|THEN|ELSE|END|EXISTS|ANY|SOME|COUNT|SUM|AVG|MAX|MIN|COALESCE|IFNULL|CAST|CONVERT|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|DEFAULT|CONSTRAINT|AUTO_INCREMENT|SERIAL|INTEGER|INT|BIGINT|SMALLINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|VARCHAR|CHAR|TEXT|BLOB|DATE|TIME|DATETIME|TIMESTAMP|BOOLEAN|BOOL)\b/gi;

const SQLHighlight = ({ sql }) => {
  if (!sql) return null;
  // Token types in priority order — strings and comments are matched first to avoid false keyword hits
  const TOKENS = [
    { type: 'comment',  re: /(--[^\n]*)/ },
    { type: 'string',   re: /('[^']*'|"[^"]*")/ },
    { type: 'keyword',  re: SQL_KEYWORDS_RE },
    { type: 'number',   re: /\b(-?\d+(?:\.\d+)?)\b/ },
    { type: 'operator', re: /([=<>!]+|\bnot\b)/i },
    { type: 'paren',    re: /([(){}[\]])/ },
  ];
  const COLORS = {
    keyword:  'text-sky-600 dark:text-sky-400 font-semibold',
    string:   'text-emerald-600 dark:text-emerald-400',
    number:   'text-orange-500 dark:text-orange-400',
    operator: 'text-rose-500 dark:text-rose-400',
    comment:  'text-slate-400 italic',
    paren:    'text-amber-500 dark:text-amber-400 font-bold',
  };

  // Build a single combined regex with named groups
  const combined = new RegExp(
    TOKENS.map(t => `(${t.re.source})`).join('|'),
    'gi'
  );

  const parts = [];
  let pos = 0, m, key = 0;
  while ((m = combined.exec(sql)) !== null) {
    if (m.index > pos) parts.push(<span key={key++}>{sql.substring(pos, m.index)}</span>);
    // Find which token group matched
    const groupIdx = TOKENS.findIndex((_, i) => m[i + 1] !== undefined);
    const type = groupIdx >= 0 ? TOKENS[groupIdx].type : null;
    parts.push(<span key={key++} className={COLORS[type] || ''}>{m[0]}</span>);
    pos = m.index + m[0].length;
  }
  if (pos < sql.length) parts.push(<span key={key++}>{sql.substring(pos)}</span>);
  return <>{parts}</>;
};

// ─── SQL parsing helpers ──────────────────────────────────────────────────────
// Moved to logParsingUtils.js (kept dependency-free so it's directly unit
// testable without dragging in this component's Redux/API import chain).

// ─── Main Component ───────────────────────────────────────────────────────────
function LogViewer({ hostUid, path }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode]       = useState('raw');
  const [copying, setCopying]         = useState(false);
  const [isAll, setIsAll]             = useState(false);
  const [toolbarMenu, setToolbarMenu] = useState(null);
  const [topRevision, setTopRevision] = useState(0);
  const [topAnalysis, setTopAnalysis] = useState(null);
  const pageSize = 100;

  const logState   = useSelector(s => s.broker.viewingLogs[path]);
  const pageLoading = logState?.loading;
  const fileName   = path.split('/').pop();
  const lowerFileName = fileName.toLowerCase();
  const isErrorLogFile = lowerFileName.endsWith('.err') || lowerFileName.endsWith('.error');
  const isRawOnlyLog = isErrorLogFile || /\.access(?:\.|$)/i.test(lowerFileName);
  const activeViewMode = isRawOnlyLog ? 'raw' : viewMode;
  const isTop = activeViewMode === 'top';
  const currentAnalysis = topAnalysis?.hostUid === hostUid && topAnalysis?.path === path
    && topAnalysis?.revision === topRevision ? topAnalysis : null;
  const topLoading = isTop && (!currentAnalysis || currentAnalysis.loading);
  const topError = isTop ? currentAnalysis?.error : null;
  const loading = isTop ? topLoading : pageLoading;
  const error = isTop ? topError : logState?.error;
  const top = isTop && !topLoading && !topError ? currentAnalysis.rows : [];
  const totalLines = parseInt(logState?.data?.total || '0');
  
  const startLine  = isAll ? 1 : (currentPage - 1) * pageSize + 1;
  const endLine    = isAll ? totalLines : currentPage * pageSize;
  
  const lines      = logState?.data?.log?.[0]?.line || [];
  const totalPages = Math.max(1, Math.ceil(totalLines / pageSize));

  useEffect(() => {
    if (isTop) return;
    dispatch(fetchLogContent({ hostUid, path, start: String(startLine), end: String(endLine) }));
  }, [dispatch, hostUid, path, currentPage, isAll, startLine, endLine, isTop]);

  useEffect(() => {
    if (!isTop) return undefined;
    const controller = new AbortController();
    const identity = { hostUid, path, revision: topRevision };
    setTopAnalysis({ ...identity, loading: true });
    analyzeTopSQL(() => brokerApi.captureLogSnapshot(hostUid, path), { signal: controller.signal })
      .then(result => {
        if (!controller.signal.aborted) setTopAnalysis({ ...identity, ...result, loading: false });
      })
      .catch(error => {
        if (!controller.signal.aborted) setTopAnalysis({ ...identity, loading: false,
          error: error?.response?.data?.message || error?.message || 'LOG_INCOMPLETE',
        });
      });
    return () => controller.abort();
  }, [hostUid, path, topRevision, isTop]);

  useEffect(() => {
    if (isRawOnlyLog && viewMode !== 'raw') {
      setViewMode('raw');
    }
  }, [isRawOnlyLog, viewMode]);

  useEffect(() => {
    if (!toolbarMenu) return undefined;
    const closeMenu = (event) => {
      if (!event.target.closest('.context-menu-container, .log-toolbar-menu-trigger')) {
        setToolbarMenu(null);
      }
    };
    document.addEventListener('mousedown', closeMenu, true);
    return () => document.removeEventListener('mousedown', closeMenu, true);
  }, [toolbarMenu]);

  const sqls = activeViewMode === 'sql' ? extractSQL(lines) : [];
  const copyDisabled = isTop ? topLoading || !!topError || top.length === 0 : lines.length === 0;
  const refresh = () => {
    if (isTop) setTopRevision(revision => revision + 1);
    else dispatch(fetchLogContent({ hostUid, path, start: String(startLine), end: String(endLine) }));
  };

  const handleCopy = () => {
    const txt =
      activeViewMode === 'sql' ? extractSQL(lines).join('\n\n') :
      activeViewMode === 'top' ? JSON.stringify(top, null, 2) :
      lines.join('\n');
    navigator.clipboard.writeText(txt).then(() => {
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
    });
  };

  const handleExcel = (data) => {
    const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/></Style><Style ss:ID="s"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Consolas" ss:Size="10"/></Style></Styles>
<Worksheet ss:Name="TopSQL"><Table><Column ss:Width="40"/><Column ss:Width="60"/><Column ss:Width="60"/><Column ss:Width="60"/><Column ss:Width="50"/><Column ss:Width="50"/><Column ss:Width="500"/>
<Row><Cell ss:MergeAcross="6"><Data ss:Type="String">${esc(CM.topSQLScopeLabel(currentAnalysis.total))}</Data></Cell></Row>
<Row ss:Height="20">${['ID','MAX','MIN','AVG','Count','Error','SQL'].map(h => `<Cell ss:StyleID="h"><Data ss:Type="String">${h}</Data></Cell>`).join('')}</Row>
${data.map(d => { const numCell = (v) => v === '-' ? `<Cell><Data ss:Type="String">-</Data></Cell>` : `<Cell><Data ss:Type="Number">${v}</Data></Cell>`; return `<Row ss:AutoFitHeight="1"><Cell><Data ss:Type="String">${d.id}</Data></Cell>${numCell(d.max)}${numCell(d.min)}${numCell(d.avg)}<Cell><Data ss:Type="Number">${d.c}</Data></Cell><Cell><Data ss:Type="Number">${d.e}</Data></Cell><Cell ss:StyleID="s"><Data ss:Type="String">${esc(d.sql)}</Data></Cell></Row>`; }).join('')}
</Table></Worksheet></Workbook>`;
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `top_sql_${Date.now()}.xls`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const modeSwitcher = !isRawOnlyLog ? (
    <div className="flex items-center bg-slate-100 dark:bg-white/5 rounded-lg p-0.5 shrink-0">
      {MODE_KEYS.map(m => (
        <button
          type="button"
          key={m.key}
          data-testid={`log-viewer-mode-${m.key}`}
          onClick={() => {
            if (m.key === 'top') setTopRevision(revision => revision + 1);
            setViewMode(m.key);
          }}
          aria-pressed={activeViewMode === m.key}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-13 font-semibold transition-colors whitespace-nowrap ${
            activeViewMode === m.key
              ? 'bg-white dark:bg-white/10 text-amber-600 dark:text-bk-yellow'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Icon name={m.icon} size="sm" />
          {CM[m.cmKey]}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div data-testid="log-viewer" className="flex-1 flex flex-col bg-slate-50 dark:bg-bk-main overflow-hidden font-mono">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <PageToolbar
        icon="description"
        title={fileName}
        titleMonospace
        subtitle={CM.logViewerSubtitle}
        center={modeSwitcher}
        actions={(
          <>

          {/* Export Excel */}
          {!isRawOnlyLog && (
            <>
              <button
                type="button"
                onClick={() => handleExcel(top)}
                disabled={top.length === 0}
                title={CM.downloadExcel}
                className={`log-toolbar-wide-only flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-13 font-bold transition-all active:scale-[0.98]
                  ${top.length === 0
                    ? 'bg-slate-50 dark:bg-white/5 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-white/5 cursor-not-allowed opacity-50'
                    : 'bg-amber-500/10 text-amber-600 dark:text-bk-yellow border-amber-500/50 dark:border-bk-yellow/50 hover:bg-amber-500/20 shadow-xs'
                  } ${activeViewMode === 'top' ? 'visible' : 'invisible pointer-events-none'}`}
              >
                <Icon name="download" size="19px" />
                {CM.exportBtn}
              </button>

              <div className="log-toolbar-wide-only h-4 w-px bg-slate-200 dark:bg-white/10 mx-0.5" />
            </>
          )}

          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={copyDisabled}
            title={CM.copyToClipboard}
            aria-label={CM.copyToClipboard}
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
            data-testid="log-viewer-refresh-btn"
            onClick={refresh}
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

          <div className="h-4 w-px bg-slate-200 dark:bg-white/10 mx-0.5" />

          {/* Pagination applies to raw text and Parsed SQL; Top SQL covers the full log. */}
          {!isTop && <div className="flex items-center bg-slate-100 dark:bg-black/20 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || loading || isAll}
              aria-label={CM.previousPage}
              className="p-1 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-amber-600 dark:hover:text-bk-yellow rounded-md transition-all disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Icon name="chevron_left" size="19px" />
            </button>
            <div className={`px-3 text-13 font-bold text-slate-600 dark:text-slate-300 min-w-[72px] text-center font-mono ${isAll ? 'opacity-30' : ''}`}>
              {currentPage} / {totalPages}
            </div>
            <button
              type="button"
              onClick={() => setCurrentPage(p => endLine < totalLines ? p + 1 : p)}
              disabled={endLine >= totalLines || loading || isAll}
              aria-label={CM.nextPage}
              className="p-1 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-amber-600 dark:hover:text-bk-yellow rounded-md transition-all disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Icon name="chevron_right" size="19px" />
            </button>

            <div className="log-toolbar-wide-only w-px h-4 bg-slate-200 dark:bg-white/10 mx-1" />
            <button
              type="button"
              onClick={() => setIsAll(!isAll)}
              className={`log-toolbar-wide-only px-2 py-1 rounded-md text-12 font-bold transition-all whitespace-nowrap ${
                isAll 
                ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20' 
                : 'text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-white/5 hover:text-amber-600 dark:hover:text-bk-yellow'
              }`}
            >
              {isAll ? CM.paginated : CM.viewAll}
            </button>
          </div>}

          <button
            type="button"
            className="log-toolbar-menu-trigger log-toolbar-overflow-action w-8 h-8 items-center justify-center rounded-lg border bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-bk-yellow hover:border-amber-500/50 transition-all"
            title={CM.moreActions}
            aria-label={CM.moreActions}
            aria-haspopup="menu"
            aria-expanded={Boolean(toolbarMenu)}
            onClick={(event) => {
              if (toolbarMenu) {
                setToolbarMenu(null);
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              setToolbarMenu({ x: rect.right, y: rect.bottom + 4 });
            }}
          >
            <Icon name="more_horiz" size="18px" />
          </button>
          </>
        )}
      />

      {toolbarMenu && (
        <ContextMenuWrapper x={toolbarMenu.x} y={toolbarMenu.y} width="w-48" onClose={() => setToolbarMenu(null)}>
          <MenuItem
            icon={copying ? 'check' : 'content_copy'}
            label={copying ? CM.copiedLabel : CM.copyToClipboard}
            disabled={copyDisabled}
            onClick={() => {
              handleCopy();
              setToolbarMenu(null);
            }}
          />
          {activeViewMode === 'top' && (
            <MenuItem
              icon="download"
              label={CM.exportBtn}
              disabled={top.length === 0}
              onClick={() => {
                handleExcel(top);
                setToolbarMenu(null);
              }}
            />
          )}
          {!isTop && <>
          <MenuDivider />
          <MenuItem
            icon={isAll ? 'view_week' : 'view_stream'}
            label={isAll ? CM.paginated : CM.viewAll}
            onClick={() => {
              setIsAll(!isAll);
              setToolbarMenu(null);
            }}
          />
          </>}
        </ContextMenuWrapper>
      )}

      {error && (
        <div role="alert" className="px-4 py-3 text-sm text-rose-600 bg-rose-50 dark:bg-rose-950/20">
          {isTop && topError === 'LOG_CHANGED' ? CM.topSQLLogChanged
            : isTop && topError === 'LOG_INCOMPLETE' ? CM.topSQLReadFailed : error}
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-white dark:bg-bk-side">

        {/* Raw Log */}
        {activeViewMode === 'raw' && (
          lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                <Icon name="inbox" size="sm" weight={300} className="text-slate-400 dark:text-slate-500 text-3xl" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 italic">{CM.noContentAvailable}</p>
            </div>
          ) : (
            <div>
              {lines.map((l, i) => (
                <div
                  key={i}
                  className="flex gap-4 px-4 py-0.5 border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 group transition-colors"
                >
                  <span className="w-10 shrink-0 text-right text-13 text-slate-300 dark:text-slate-600 group-hover:text-amber-500 select-none font-semibold pt-0.5">
                    {startLine + i}
                  </span>
                  <div className="text-14 text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
                    <HighlightedLine line={l} />
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Parsed SQL */}
        {activeViewMode === 'sql' && (
          sqls.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <p className="text-sm text-slate-400 italic">{CM.noSqlStatementsFound}</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {sqls.map((s, i) => (
                <div key={i} className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-12 font-bold text-slate-400">{CM.statementNumberLabel(i + 1)}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(s)}
                      className="p-1 text-slate-400 hover:text-amber-500 rounded transition-colors"
                      title={CM.copyStatement}
                    >
                      <Icon name="content_copy" size="sm" weight={300} />
                    </button>
                  </div>
                  <div className="px-4 py-3 text-14 font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all leading-relaxed">
                    <SQLHighlight sql={s} />
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Top SQL */}
        {activeViewMode === 'top' && (
          <div className="min-w-full inline-block">
            {/* Column headers */}
            <div className="flex items-center gap-4 px-4 py-2 bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-slate-800 text-12 font-bold text-slate-500 dark:text-slate-400 sticky top-0">
              <div className="w-10 shrink-0">{CM.idLabel}</div>
              <div className="w-20 shrink-0 text-right">{CM.maxSeconds}</div>
              <div className="w-20 shrink-0 text-right">{CM.minSeconds}</div>
              <div className="w-20 shrink-0 text-right text-sky-500">{CM.avgSeconds}</div>
              <div className="w-20 shrink-0 text-right text-emerald-500">{CM.countLabel}</div>
              <div className="w-16 shrink-0 text-right text-rose-500">{CM.errorsLabel}</div>
              <div className="flex-1">{CM.sqlPattern}</div>
            </div>
            {topLoading ? (
              <div role="status" className="py-8 text-center text-slate-400 text-sm">{CM.loadingLogLines}</div>
            ) : topError ? null : top.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">{CM.noQueriesToAnalyze}</div>
            ) : top.map((d, i) => (
              <div
                key={i}
                data-testid="top-sql-row"
                className="flex items-center gap-4 px-4 py-2 border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-14"
              >
                <div className="w-10 shrink-0 font-bold text-amber-500">{d.id}</div>
                <div className="w-20 shrink-0 text-right text-slate-500 dark:text-slate-400">{d.max}</div>
                <div className="w-20 shrink-0 text-right text-slate-500 dark:text-slate-400">{d.min}</div>
                <div className="w-20 shrink-0 text-right text-sky-600 dark:text-sky-400 font-semibold">{d.avg}</div>
                <div className="w-20 shrink-0 text-right text-emerald-600 dark:text-emerald-400 font-bold">{d.c}</div>
                <div className="w-16 shrink-0 text-right font-semibold text-rose-500">{d.e || '—'}</div>
                <div className="flex-1 min-w-0 text-slate-500 dark:text-slate-400 truncate" title={d.sql}>{d.sql}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2 bg-white dark:bg-bk-side border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-12 text-slate-500 dark:text-slate-400 font-medium tracking-tight">
        <div className="flex items-center gap-4">
          <span>{isTop
            ? topLoading ? CM.loadingLogLines : topError ? CM.topSQLReadFailed : CM.topSQLScopeLabel(currentAnalysis.total)
            : CM.linesRangeLabel(startLine, Math.min(endLine, totalLines), totalLines.toLocaleString())}</span>
          {activeViewMode === 'sql' && <span>{CM.statementsCountLabel(sqls.length)}</span>}
          {activeViewMode === 'top' && <span>{CM.patternsCountLabel(top.length)}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`h-1.5 w-1.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : error ? 'bg-rose-500' : 'bg-emerald-500'}`} />
          {loading ? CM.synchronizing : error ? CM.disconnectedLabel : CM.connected}
        </div>
      </div>
    </div>
  );
}

export default React.memo(LogViewer);
