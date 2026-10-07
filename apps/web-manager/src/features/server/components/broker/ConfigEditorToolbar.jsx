import React from 'react';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { Spinner } from '../../../../components/ds/foundation/Spinner';
import { useCM } from '../../../../constants/useCM';
import { PageToolbar } from '../../../../components/ds/layout/PageToolbar';

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
    <PageToolbar
      icon="hub"
      title={CM.brokerConfiguration}
      subtitle={`${hostDisplayName} / cubrid_broker.conf`}
      actions={(
        <>

        {/* Undo — bordered icon */}
        <button
          type="button"
          data-testid="broker-config-undo-btn"
          onClick={handleUndo}
          disabled={!hasChanges || loading || saving}
          title={CM.undoAllChanges}
          aria-label={CM.undoAllChanges}
          className="w-8 h-8 flex items-center justify-center rounded-lg border bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-400 hover:text-amber-600 dark:hover:text-bk-yellow hover:border-amber-500/50 dark:hover:border-bk-yellow/50 hover:bg-white dark:hover:bg-white/5 shadow-xs active:scale-[0.98] disabled:opacity-30 transition-all shrink-0"
        >
          <Icon name="undo" size="18px" weight={300} />
        </button>

        {/* Refresh — bordered icon */}
        <button
          type="button"
          data-testid="broker-config-refresh-btn"
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
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 mr-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">{CM.modified}</span>
          </div>
        )}

        {/* Save */}
        <button
          type="button"
          data-testid="broker-config-save-btn"
          onClick={handleSave}
          disabled={!hasChanges || saving || loading}
          title={CM.saveChanges}
          className="page-toolbar-primary-action h-8 flex items-center gap-1.5 px-4 rounded-lg text-[11px] font-bold text-white dark:text-slate-900 bg-slate-800 dark:bg-bk-yellow hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {saving ? <Spinner size="xs" className="text-white dark:text-slate-900" /> : <Icon name="check_circle" size="sm" />}
          <span className="page-toolbar-primary-label">{CM.saveChanges}</span>
        </button>
        </>
      )}
    />
  );
}
