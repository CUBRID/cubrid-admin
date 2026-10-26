import React, { useState, useEffect, useCallback, memo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeSetAutomationVolumeModal, fetchAutoVolumeConfig, updateAutoVolumeConfig } from '../databaseSlice';
import { dbKey } from '../dbKey';
import { useCM } from '../../../constants/useCM';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Toggle } from '../../../components/ds/forms/Toggle';
import { Typography } from '../../../components/ds/foundation/Typography';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import { 
  ModalStatusLoading, 
  ModalStatusSuccess, 
  ModalStatusError 
} from '../../../components/ds/feedback/ActionStatus';

const PAGE_SIZE_BYTES = 16384;
const BYTES_TO_MB = 1024 * 1024;

// ── Slider Field ───────────────────────────────────────────────
const SliderField = memo(({ label, value, min, max, step = 1, onChange, unit = '%', disabled }) => {
  const pct = Math.max(0, ((value - min) / (max - min)) * 100);
  return (
    <div className={`space-y-2 transition-opacity duration-300 ${disabled ? 'opacity-30 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between">
        <Typography variant="caption" className="text-12 font-semibold text-slate-400">
          {label}
        </Typography>
        <div className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
          <span className="text-13 font-bold font-mono text-amber-600 dark:text-amber-400">{Math.max(min, value)}{unit}</span>
        </div>
      </div>
      <div className="relative h-4 flex items-center">
        <div className="absolute inset-x-0 h-[3px] bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
          <div className="h-full bg-amber-500 rounded-full transition-all duration-150" style={{ width: `${pct}%` }} />
        </div>
        <input
          type="range" min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="absolute inset-x-0 w-full h-4 opacity-0 cursor-pointer z-10"
        />
        <div
          className="absolute w-3.5 h-3.5 bg-white dark:bg-slate-200 border-2 border-amber-500 rounded-full shadow-md pointer-events-none transition-all duration-150 z-0"
          style={{ left: `calc(${pct}% - 7px)` }}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-11 text-slate-300 dark:text-slate-600 font-mono">{min}{unit}</span>
        <span className="text-11 text-slate-300 dark:text-slate-600 font-mono">{max}{unit}</span>
      </div>
    </div>
  );
});

// ── Policy Card ────────────────────────────────────────────────
const PolicyCard = memo(({ title, icon, description, enabled, onToggle, threshold, onThresholdChange, addSize, onSizeChange }) => {
  const CM = useCM();
  const extensionUnits = Math.floor(addSize * BYTES_TO_MB / PAGE_SIZE_BYTES);
  return (
    <div className={`rounded-sm border transition-all duration-300 overflow-hidden
      ${enabled
        ? 'bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/8'
        : 'bg-slate-50/50 dark:bg-black/10 border-slate-100 dark:border-white/4'
      }`}>

      {/* Card Header */}
      <div className={`px-4 py-3 flex items-center justify-between border-b transition-all duration-300
        ${enabled ? 'border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01]' : 'border-transparent'}`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded flex items-center justify-center transition-all duration-300
            ${enabled ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500' : 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 text-slate-400'}`}>
            <Icon name={icon} size="15px" weight={300} />
          </div>
          <div>
            <Typography variant="p" className={`text-14 font-bold leading-tight transition-colors
              ${enabled ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-600'}`}>
              {title}
            </Typography>
            <Typography variant="caption" className="text-11 text-slate-400 font-mono block">
              {description}
            </Typography>
          </div>
        </div>
        <Toggle checked={enabled} onChange={onToggle} variant="primary" />
      </div>

      {/* Card Body */}
      <div className={`px-4 py-4 space-y-4 transition-all duration-300 ${!enabled ? 'opacity-25 pointer-events-none' : ''}`}>
        <SliderField
          label={CM.triggerThreshold}
          value={threshold}
          min={5} max={30}
          onChange={onThresholdChange}
          unit="%"
        />

        <div className="grid grid-cols-2 gap-3 items-end">
          <div className="space-y-1">
            <Typography variant="caption" className="text-12 font-semibold text-slate-400 block">
              {CM.expansionSize}
            </Typography>
            <Input
              type="number"
              value={addSize}
              onChange={(e) => onSizeChange(parseInt(e.target.value) || 0)}
              placeholder="0"
              size="sm"
              suffix={<span className="text-11 font-bold text-slate-400">MB</span>}
            />
          </div>
            <Input
              label={CM.extensionPages}
              size="sm"
              readOnly
              value={extensionUnits.toLocaleString()}
              suffix="pages"
              inputClassName="font-mono font-bold text-slate-600 dark:text-slate-300"
            />
        </div>
      </div>
    </div>
  );
});

// ── Main Component ─────────────────────────────────────────────
export default function SetAutomationVolumeModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isSetAutomationVolumeModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase } = useSelector((state) => state.database, shallowEqual);
  const { autoVolumeConfigs, autoVolumeLoading } = useSelector((state) => state.databaseConfiguration, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);

  const { 
    error: actionError, 
    startAction, 
    endSuccess, 
    endError, 
    resetAction,
    isLoading,
    isSuccess,
    isError
  } = useActionState();

  const [combinedEnabled, setCombinedEnabled] = useState(false);
  const [combinedThreshold, setCombinedThreshold] = useState(15);
  const [combinedAddSize, setCombinedAddSize] = useState(2048);

  useEffect(() => {
    if (isSetAutomationVolumeModalOpen && selectedHostUid && selectedDatabase) {
      resetAction();
      // Reset local state before fetching new config to avoid stale view
      setCombinedEnabled(false);
      dispatch(fetchAutoVolumeConfig({ hostUid: selectedHostUid, dbname: selectedDatabase }));
    }
  }, [isSetAutomationVolumeModalOpen, selectedHostUid, selectedDatabase, dispatch, resetAction]);

  useEffect(() => {
    if (!selectedDatabase || !autoVolumeConfigs) return;
    const config = autoVolumeConfigs[dbKey(selectedHostUid, selectedDatabase)];
    if (config) {
      const primaryVolume = config.data === 'ON' ? 'data' : (config.index === 'ON' ? 'index' : 'data');
      const fallbackVolume = primaryVolume === 'data' ? 'index' : 'data';
      const warnOutOfSpace = config[`${primaryVolume}_warn_outofspace`] || config[`${fallbackVolume}_warn_outofspace`];
      const extensionPages = config[`${primaryVolume}_ext_page`] || config[`${fallbackVolume}_ext_page`];

      setCombinedEnabled(config.data === 'ON' || config.index === 'ON');
      setCombinedThreshold(warnOutOfSpace ? Math.max(5, Math.round(parseFloat(warnOutOfSpace) * 100)) : 15);
      setCombinedAddSize(extensionPages ? Math.round(parseInt(extensionPages) * PAGE_SIZE_BYTES / BYTES_TO_MB) : 2048);
    }
  }, [autoVolumeConfigs, selectedHostUid, selectedDatabase]);

  const handleSave = useCallback(async () => {
    startAction();
    const enabledValue = combinedEnabled ? 'ON' : 'OFF';
    const thresholdValue = (combinedThreshold / 100).toFixed(2);
    const extensionPageValue = Math.floor(combinedAddSize * BYTES_TO_MB / PAGE_SIZE_BYTES).toString();
    const payload = {
      data: enabledValue,
      data_warn_outofspace: thresholdValue,
      data_ext_page: extensionPageValue,
      index: enabledValue,
      index_warn_outofspace: thresholdValue,
      index_ext_page: extensionPageValue,
    };
    try {
      await dispatch(updateAutoVolumeConfig({ hostUid: selectedHostUid, dbname: selectedDatabase, payload })).unwrap();
      endSuccess(CM.autoVolumePoliciesSavedMsg(selectedDatabase));
    } catch (err) {
      endError(typeof err === 'string' ? err : (err?.message || CM.saveConfigFailedRetryMsg));
    }
  }, [combinedEnabled, combinedThreshold, combinedAddSize, selectedHostUid, selectedDatabase, dispatch, startAction, endSuccess, endError]);

  const handleClose = () => dispatch(closeSetAutomationVolumeModal());

  if (!isSetAutomationVolumeModalOpen) return null;

  /* ── LOADING ── */
  if (isLoading) {
    return (
      <Modal isOpen title={CM.setAutomationVolume} icon="settings_suggest" onClose={handleClose} maxWidth="max-w-md" showCloseButton={false}>
        <ModalStatusLoading
          title={CM.savingPolicies}
          subtitle={selectedDatabase}
        />
      </Modal>
    );
  }

  /* ── SUCCESS ── */
  if (isSuccess) {
    return (
      <Modal isOpen title={CM.policiesSaved} icon="settings_suggest" iconVariant="success" onClose={handleClose} maxWidth="max-w-md">
        <ModalStatusSuccess
          title={CM.savedSuccessfully}
          message={selectedDatabase}
          onConfirm={handleClose}
          confirmText={CM.ok}
        />
      </Modal>
    );
  }

  /* ── ERROR ── */
  if (isError) {
    return (
      <Modal isOpen title={CM.executionError} icon="settings_suggest" iconVariant="danger" onClose={resetAction} maxWidth="max-w-md">
        <ModalStatusError
          title={CM.saveInterrupted}
          error={actionError}
          guidance={CM.autoVolumeGuidance}
          onRetry={handleSave}
          onCancel={resetAction}
          retryText={CM.retry}
          cancelText={CM.dismiss}
        />
      </Modal>
    );
  }

  /* ── FORM ── */
  return (
    <Modal
      isOpen={isSetAutomationVolumeModalOpen}
      onClose={handleClose}
      title={CM.autoVolume}
      subtitle={selectedDatabase ? CM.setAutomationVolumeSubtitle(selectedDatabase) : ''}
      icon="settings_suggest"
      maxWidth="max-w-[580px]"
      onSubmit={handleSave}
      footer={
        <div className="flex items-center justify-between w-full">
          <Typography variant="caption" className="text-11 text-slate-400 font-mono hidden sm:block">
            {CM.pageSize16kLabel}
          </Typography>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={autoVolumeLoading}
              icon="save"
              className="min-w-[140px] shadow-sm shadow-amber-500/20"
            >
              {CM.savePolicies}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 animate-in fade-in duration-300">

        {/* Database target banner */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-linear-to-r from-amber-500/10 to-transparent border border-amber-500/15 rounded-sm">
          <div className="w-7 h-7 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Icon name="database" size="15px" weight={300} className="text-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <Typography variant="caption" className="text-11 font-semibold text-amber-600/70 uppercase tracking-widest block">{CM.targetDatabase}</Typography>
            <Typography variant="p" className="text-14 font-bold text-amber-700 dark:text-amber-400 font-mono truncate">{selectedDatabase}</Typography>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={`w-1.5 h-1.5 rounded-full ${combinedEnabled ? 'bg-amber-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`} />
            <span className="text-11 font-semibold text-amber-600 dark:text-amber-400">
              {combinedEnabled ? CM.autoVolumeEnabled : CM.autoVolumeDisabled}
            </span>
          </div>
        </div>

        {/* Loading overlay for initial config fetch */}
        <div className="relative">
          {autoVolumeLoading && (
            <div className="absolute inset-0 z-20 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xs flex items-center justify-center rounded-sm border border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-slate-100 dark:border-white/5 border-t-amber-500 animate-spin" />
                <Typography variant="caption" className="text-12 text-slate-500">{CM.loadingConfig}</Typography>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <PolicyCard
              title={CM.dataIndexVolume}
              icon="database"
              description={CM.dataIndexVolumeDescription}
              enabled={combinedEnabled}
              onToggle={setCombinedEnabled}
              threshold={combinedThreshold}
              onThresholdChange={setCombinedThreshold}
              addSize={combinedAddSize}
              onSizeChange={setCombinedAddSize}
            />
          </div>
        </div>

        {/* Note */}
        <div className="flex items-center gap-2 px-1">
          <Icon name="info" size="12px" weight={300} className="text-slate-300 dark:text-slate-600 shrink-0" />
          <Typography variant="caption" className="text-11 text-slate-400">
            {CM.autoVolumeExpandDesc}
          </Typography>
        </div>
      </div>
    </Modal>
  );
}
