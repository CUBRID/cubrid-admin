import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { hostApi } from '../../host/hostApi';
import { showStatusModal, setTabDirty } from '../../layout/layoutSlice';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Spinner } from '../../../components/ds/foundation/Spinner';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { useCM } from '../../../constants/useCM';
import { createSingleFlight } from '../../../infrastructure/utils/singleFlight';

// ── Highlighted Source View ────────────────────────────────────────────────
function renderHighlighted(content) {
  return content.split('\n').map((line, i) => {
    const t = line.trim();
    if (t.startsWith('#'))
      return <span key={i} className="text-slate-400 dark:text-slate-500 italic">{line}{'\n'}</span>;
    if (t.startsWith('[') && t.endsWith(']'))
      return <span key={i} className="text-amber-600 dark:text-bk-yellow font-bold">{line}{'\n'}</span>;
    const eq = line.indexOf('=');
    if (eq > 0) {
      const k = line.substring(0, eq);
      const v = line.substring(eq);
      return (
        <span key={i}>
          <span className="text-sky-600 dark:text-sky-400">{k}</span>
          <span className="text-slate-500 dark:text-slate-400">{v}</span>
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
  const currentHost = hosts.find(h => h.uid === hostUid);
  const hostDisplayName = currentHost ? (currentHost.alias || currentHost.id) : CM.unknownHost;

  const originalContentRef = useRef('');
  const configReads = useRef(createSingleFlight());
  const loadVersion = useRef(0);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
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
      setOriginalContent(joined);
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
      setOriginalContent(content);
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
      <div className="shrink-0 px-4 py-2.5 bg-white dark:bg-bk-side border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 z-10">

        {/* Left: identity */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
            <Icon name="settings_applications" size="sm" weight={300} className="text-amber-600 dark:text-bk-yellow" />
          </div>
          <div className="min-w-0">
            <h2 className="text-14 font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate">{CM.configEditorColonLabel(confname)}</h2>
            <p className="text-12 text-slate-500 dark:text-slate-400 font-medium truncate">{hostDisplayName}</p>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Undo */}
          <button
            data-testid="cubrid-config-undo-btn"
            onClick={handleUndo}
            disabled={!hasChanges || loading || saving}
            title={CM.undoAllChanges}
            className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
          >
            <Icon name="undo" size="sm" weight={300} />
          </button>

          {/* Refresh */}
          <button
            data-testid="cubrid-config-refresh-btn"
            onClick={fetchConfig}
            disabled={loading || saving}
            title={CM.reloadConfig}
            className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-amber-600 dark:hover:text-bk-yellow disabled:opacity-30 transition-colors"
          >
            <Icon name="refresh" size="sm" weight={300} className={loading ? 'animate-spin' : ''} />
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

          {/* Modified badge */}
          {hasChanges && (
            <StatusBadge label={CM.modified} variant="amber" pulse={true} className="rounded-md mr-1" />
          )}

          {/* Save */}
          <button
            data-testid="cubrid-config-save-btn"
            onClick={handleSave}
            disabled={!hasChanges || saving || loading || !loaded}
            title={CM.saveChanges}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-13 font-bold text-white dark:text-slate-900 bg-slate-800 dark:bg-bk-yellow hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {saving ? <Spinner size="xs" className="text-white dark:text-slate-900" /> : <Icon name="save" size="sm" />}
            {CM.saveChanges}
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative bg-slate-100 dark:bg-black/20">
        {/* ══ SOURCE VIEW ═════════════════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Inner Header */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-white dark:bg-bk-side border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-400">
              <Icon name="description" size="sm" weight={300} />
              <span className="text-13 font-semibold text-slate-500 dark:text-slate-400 font-mono">{confname}</span>
            </div>
            <span className="text-12 font-medium text-slate-400 dark:text-slate-500 font-mono uppercase tracking-widest">
              {lineCount} lines
            </span>
          </div>

          {/* Editor Container */}
          <div className="flex-1 relative overflow-hidden bg-white dark:bg-[#0D1117]">
            {/* Line Numbers */}
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-slate-50 dark:bg-white/3 border-r border-slate-100 dark:border-white/5 overflow-hidden pointer-events-none z-10">
              <div className="p-0 pt-6 flex flex-col items-end pr-3">
                {content.split('\n').map((_, i) => (
                  <span key={i} className="text-14 font-mono text-slate-300 dark:text-slate-700 leading-relaxed select-none h-[25.2px]">
                    {i + 1}
                  </span>
                ))}
              </div>
            </div>

            {/* Highlight layer */}
            <pre
              ref={preRef}
              className="absolute inset-0 left-12 p-6 font-mono text-14 leading-relaxed text-slate-800 dark:text-slate-300 pointer-events-none whitespace-pre-wrap break-all overflow-hidden"
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
              className="absolute inset-0 left-12 w-[calc(100%-3rem)] h-full bg-transparent p-6 font-mono text-14 leading-relaxed text-transparent caret-slate-800 dark:caret-bk-yellow outline-none resize-none whitespace-pre-wrap break-all overflow-auto"
              placeholder={CM.configPlaceholder}
            />
          </div>

          {/* Source Footer */}
          <div className="shrink-0 px-4 py-2 bg-white dark:bg-bk-side border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-12 text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">
            <span>UTF-8 | LF</span>
            <StatusBadge label={CM.sourceEditor} variant="sky" className="border-none bg-transparent" />
          </div>
        </div>

        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-white/80 dark:bg-bk-side/80 backdrop-blur-xs">
            <Spinner size="lg" />
            <span className="text-12 uppercase font-bold tracking-widest text-slate-400 animate-pulse">{CM.loadingConfiguration}</span>
          </div>
        )}
      </div>
    </div>
  );
}
