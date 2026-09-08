import React from 'react';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { Spinner } from '../../../../components/ds/foundation/Spinner';
import { useCM } from '../../../../constants/useCM';

export default function ConfigEditorToolbar({
  hostDisplayName,
  hasChanges,
  loading,
  saving,
  handleUndo,
  fetchConfig,
  handleSave,
}) {
  const CM = useCM();
  return (
    <div className="shrink-0 px-4 py-2.5 bg-white dark:bg-bk-side border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 z-10">

      {/* Left: identity */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
          <Icon name="hub" size="sm" weight={300} className="text-amber-600 dark:text-bk-yellow" />
        </div>
        <div className="min-w-0">
          <h2 className="text-14 font-semibold text-slate-800 dark:text-slate-200 leading-tight">{CM.brokerConfiguration}</h2>
          <p className="text-12 text-slate-500 dark:text-slate-400 font-medium truncate">{hostDisplayName} / cubrid_broker.conf</p>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1 shrink-0">

        {/* Undo — bordered icon */}
        <button
          data-testid="broker-config-undo-btn"
          onClick={handleUndo}
          disabled={!hasChanges || loading || saving}
          title={CM.undoAllChanges}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95 disabled:opacity-30 transition-all shrink-0"
        >
          <Icon name="undo" size="sm" weight={300} />
        </button>

        {/* Refresh — bordered icon */}
        <button
          data-testid="broker-config-refresh-btn"
          onClick={fetchConfig}
          disabled={loading || saving}
          title={CM.reloadConfig}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95 hover:text-amber-600 dark:hover:text-bk-yellow disabled:opacity-30 transition-all shrink-0"
        >
          <Icon name="refresh" size="sm" weight={300} className={loading ? 'animate-spin' : ''} />
        </button>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* Modified badge */}
        {hasChanges && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 mr-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-12 font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">{CM.modified}</span>
          </div>
        )}

        {/* Save */}
        <button
          data-testid="broker-config-save-btn"
          onClick={handleSave}
          disabled={!hasChanges || saving || loading}
          title={CM.saveChanges}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-13 font-bold text-white dark:text-slate-900 bg-slate-800 dark:bg-bk-yellow hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {saving ? <Spinner size="xs" className="text-white dark:text-slate-900" /> : <Icon name="check_circle" size="sm" />}
          {CM.saveChanges}
        </button>
      </div>
    </div>
  );
}
