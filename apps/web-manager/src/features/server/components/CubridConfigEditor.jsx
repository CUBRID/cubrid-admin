import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { hostApi } from '../../host/hostApi';
import { showStatusModal, setTabDirty } from '../../layout/layoutSlice';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Spinner } from '../../../components/ds/foundation/Spinner';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { PageToolbar } from '../../../components/ds/layout/PageToolbar';
import { useCM } from '../../../constants/useCM';
import { createSingleFlight } from '../../../infrastructure/utils/singleFlight';

// ── Highlighted Source View ────────────────────────────────────────────────
function renderHighlighted(content) {
  return content.split('\n').map((line, i) => {
    const t = line.trim();
    if (t.startsWith('#'))
      return <span key={i} className="text-slate-400 dark:text-editor-comment">{line}{'\n'}</span>;
    if (t.startsWith('[') && t.endsWith(']'))
      return <span key={i} className="text-amber-600 dark:text-editor-section font-semibold">{line}{'\n'}</span>;
    const eq = line.indexOf('=');
    if (eq > 0) {
      const k = line.substring(0, eq);
      const v = line.substring(eq);
      return (
        <span key={i}>
          <span className="text-sky-600 dark:text-editor-key">{k}</span>
          <span className="text-slate-500 dark:text-editor-value">{v}</span>
          {'\n'}
        </span>
      );
    }
    return <span key={i}>{line}{'\n'}</span>;
  });
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function CubridConfigEditor({ hostUid, confname }) {
  const CM = useCM();
  const tabId = `edit_config:${hostUid}:${confname}`;
  const dispatch = useDispatch();
  const { hosts } = useSelector((state) => state.host, shallowEqual);
  const { refreshCounter, refreshTabId } = useSelector((state) => state.layout, shallowEqual);
  const currentHost = hosts.find(h => h.uid === hostUid);
  const hostDisplayName = currentHost ? (currentHost.alias || currentHost.id) : CM.unknownHost;

  const originalContentRef = useRef('');
  const configReads = useRef(createSingleFlight());
  const loadVersion = useRef(0);
  const lastRefreshCounterRef = useRef(refreshCounter);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const textareaRef = useRef(null);
  const preRef = useRef(null);

  const fetchConfig = useCallback(async () => {
    if (!hostUid || !confname) return;
    const version = ++loadVersion.current;
    setLoading(true);
    setLoaded(false);
    try {
      // React StrictMode may start the mount effect twice. Share only pending
      // reads for this editor; a later explicit refresh still fetches anew.
      const response = await configReads.current(JSON.stringify([hostUid, confname]),
        () => hostApi.getHostConfig(hostUid, confname));
      if (version !== loadVersion.current) return;
      const lines = response?.conflist?.[0]?.confdata;
      if (!Array.isArray(lines)) throw new Error('Configuration response has no confdata');
      const joined = lines.join('\n');
      originalContentRef.current = joined;
      setContent(joined);
      setHasChanges(false);
      setLoaded(true);
      dispatch(setTabDirty({ tabId, isDirty: false }));
    } catch (err) {
      if (version !== loadVersion.current) return;
      dispatch(showStatusModal({
        type: 'error',
        title: CM.fetchFailed,
        message: CM.configFetchErrorMsg,
        guidance: CM.databasePropertyGuidance,
        detail: err?.response?.data?.note || err?.message,
      }));
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [hostUid, confname, dispatch, tabId]);

  useEffect(() => {
    fetchConfig();
    return () => { ++loadVersion.current; };
  }, [fetchConfig]);

  useEffect(() => {
    if (refreshCounter <= lastRefreshCounterRef.current) return;
    lastRefreshCounterRef.current = refreshCounter;
    if (refreshTabId === tabId) fetchConfig();
  }, [fetchConfig, refreshCounter, refreshTabId, tabId]);

  const handleSourceChange = (e) => {
    const val = e.target.value;
    setContent(val);
    const changed = val !== originalContentRef.current;
    setHasChanges(changed);
    dispatch(setTabDirty({ tabId, isDirty: changed }));
  };

  const handleUndo = () => {
    setContent(originalContentRef.current);
    setHasChanges(false);
    dispatch(setTabDirty({ tabId, isDirty: false }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { confname, confdata: content.split('\n') };
      await hostApi.setHostConfig(hostUid, payload);
      originalContentRef.current = content;
      setHasChanges(false);
      dispatch(setTabDirty({ tabId, isDirty: false }));
      dispatch(showStatusModal({ type: 'success', title: CM.configSaved, message: CM.configUpdatedMsg(confname) }));
    } catch (err) {
      dispatch(showStatusModal({
        type: 'error',
        title: CM.saveFailed,
        message: CM.saveErrorFallbackMsg,
        guidance: CM.databasePropertyGuidance,
        detail: err?.response?.data?.note || err?.response?.data?.message || err?.message,
      }));
    } finally {
      setSaving(false);
    }
  };

  const syncScroll = (e) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.target.scrollTop;
      preRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  const lineCount = content.split('\n').length;

  return (
    <div data-testid="cubrid-config-editor" className="flex-1 flex flex-col bg-slate-50 dark:bg-bk-main overflow-hidden font-sans transition-colors">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <PageToolbar
        icon="settings_applications"
        title={CM.configEditorColonLabel(confname)}
        subtitle={hostDisplayName}
        actions={(
          <>
          {/* Undo */}
          <button
            type="button"
            data-testid="cubrid-config-undo-btn"
            onClick={handleUndo}
            disabled={!hasChanges || loading || saving}
            title={CM.undoAllChanges}
            aria-label={CM.undoAllChanges}
            className="w-8 h-8 flex items-center justify-center rounded-lg border bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-bk-yellow hover:border-amber-500/50 dark:hover:border-bk-yellow/50 hover:bg-white dark:hover:bg-white/5 shadow-xs active:scale-[0.98] disabled:opacity-30 transition-all shrink-0"
          >
            <Icon name="undo" size="18px" weight={300} />
          </button>

          {/* Refresh */}
          <button
            type="button"
            data-testid="cubrid-config-refresh-btn"
            onClick={fetchConfig}
            disabled={loading || saving}
            title={CM.reloadConfig}
            aria-label={CM.reloadConfig}
            className="w-8 h-8 flex items-center justify-center rounded-lg border bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-bk-yellow hover:border-amber-500/50 dark:hover:border-bk-yellow/50 hover:bg-white dark:hover:bg-white/5 shadow-xs active:scale-[0.98] disabled:opacity-30 transition-all shrink-0"
          >
            <Icon name="refresh" size="18px" weight={300} className={loading ? 'animate-spin' : ''} />
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-white/10 mx-0.5" />

          {/* Modified badge */}
          {hasChanges && (
            <StatusBadge label={CM.modified} variant="amber" pulse={true} className="rounded-md mr-1" />
          )}

          {/* Save */}
          <button
            type="button"
            data-testid="cubrid-config-save-btn"
            onClick={handleSave}
            disabled={!hasChanges || saving || loading || !loaded}
            title={CM.saveChanges}
            className="page-toolbar-primary-action h-8 flex items-center gap-1.5 px-4 rounded-lg text-[11px] font-bold text-white dark:text-slate-900 bg-slate-800 dark:bg-bk-yellow hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {saving ? <Spinner size="xs" className="text-white dark:text-slate-900" /> : <Icon name="save" size="sm" />}
            <span className="page-toolbar-primary-label">{CM.saveChanges}</span>
          </button>
          </>
        )}
      />

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative bg-slate-100 dark:bg-black/20">
        {/* ══ SOURCE VIEW ═════════════════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Inner Header */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-white dark:bg-bk-side border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-400">
              <Icon name="description" size="sm" weight={300} />
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-mono">{confname}</span>
            </div>
            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 font-mono uppercase tracking-widest">
              {lineCount} lines
            </span>
          </div>

          {/* Editor Container */}
          <div className="config-source-editor flex-1 relative overflow-hidden bg-white dark:bg-editor-bg">
            {/* Line Numbers */}
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-slate-50 dark:bg-editor-gutter border-r border-slate-100 dark:border-editor-border overflow-hidden pointer-events-none z-10">
              <div className="p-0 pt-6 flex flex-col items-end pr-3">
                {content.split('\n').map((_, i) => (
                  <span key={i} className="text-[12px] font-mono text-slate-300 dark:text-editor-line leading-relaxed select-none h-[25.2px]">
                    {i + 1}
                  </span>
                ))}
              </div>
            </div>

            {/* Highlight layer */}
            <pre
              ref={preRef}
              className="absolute inset-0 left-12 p-6 font-mono text-[12.5px] leading-relaxed text-slate-800 dark:text-editor-text pointer-events-none whitespace-pre-wrap break-all overflow-hidden"
              aria-hidden="true"
            >
              {renderHighlighted(content)}
            </pre>

            {/* Edit layer */}
            <textarea
              data-testid="cubrid-config-textarea"
              ref={textareaRef}
              value={content}
              readOnly={loading || saving || !loaded}
              onChange={handleSourceChange}
              onScroll={syncScroll}
              spellCheck="false"
              className="config-source-input absolute inset-0 left-12 w-[calc(100%-3rem)] h-full bg-transparent p-6 font-mono text-[12.5px] leading-relaxed text-transparent caret-slate-800 dark:caret-editor-section focus-visible:outline-2 focus-visible:outline-amber-500/70 dark:focus-visible:outline-editor-key/60 focus-visible:outline-offset-[-2px] resize-none whitespace-pre-wrap break-all overflow-auto"
              placeholder={CM.configPlaceholder}
            />
          </div>

          {/* Source Footer */}
          <div className="shrink-0 px-4 py-2 bg-white dark:bg-bk-side border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">
            <span>UTF-8 | LF</span>
            <StatusBadge label={CM.sourceEditor} variant="sky" className="border-none bg-transparent" />
          </div>
        </div>

        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-white/80 dark:bg-bk-side/80 backdrop-blur-xs">
            <Spinner size="lg" />
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 animate-pulse">{CM.loadingConfiguration}</span>
          </div>
        )}
      </div>
    </div>
  );
}
