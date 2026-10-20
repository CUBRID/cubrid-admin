import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeAddVolumeModal } from '../databaseSlice';
import { databaseJobApi } from '../databaseJobApi';
import { useCmsJob } from '../../../infrastructure/hooks/useCmsJob';
import { getCmsJobLoadingSubtitle } from '../../../infrastructure/cmsJob/cmsJobUi';
import { databaseApi } from '../databaseApi';
import { useCM } from '../../../constants/useCM';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { FormField } from '../../../components/ds/forms/FormField';
import { Typography } from '../../../components/ds/foundation/Typography';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import { ModalStatusLoading,
  ModalStatusSuccess, 
  ModalStatusError 
} from '../../../components/ds/feedback/ActionStatus';

const PURPOSE_OPTIONS = [
  {
    value: 'data',
    labelKey: 'volumeTypeData',
    icon: 'database',
  },
  {
    value: 'temp',
    labelKey: 'volumeTypeTemp',
    icon: 'timer',
  },
];

const SIZE_PRESETS = [
  { label: '128 MB', mb: 128 },
  { label: '256 MB', mb: 256 },
  { label: '512 MB', mb: 512 },
  { label: '1 GB', mb: 1024 },
  { label: '4 GB', mb: 4096 },
  { label: '10 GB', mb: 10240 },
  { label: '20 GB', mb: 20480 },
];

export default function AddVolumeModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isAddVolumeModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);

  const { 
    error, 
    startAction, 
    endSuccess, 
    endError, 
    resetAction,
    isLoading,
    isSuccess,
    isError
  } = useActionState();
  const { runJob, background, wasBackgrounded } = useCmsJob();
  const [jobStatus, setJobStatus] = useState(null);

  const [volStatus, setVolStatus] = useState({ freespace: '', volpath: '' });
  const [purpose, setPurpose] = useState('data');
  const [path, setPath] = useState('');
  const [sizeMB, setSizeMB] = useState(512);
  const [sizeUnit, setSizeUnit] = useState('MB');
  const [fetchingStatus, setFetchingStatus] = useState(false);

  // Custom-capacity input displays/accepts whichever unit is selected, but
  // sizeMB itself (used for numberOfPages/payload/presets) always stays in MB.
  const displaySize = sizeUnit === 'GB' ? parseFloat((sizeMB / 1024).toFixed(3)) : sizeMB;
  const handleDisplaySizeChange = (value) => {
    const parsed = parseFloat(value) || 0;
    setSizeMB(sizeUnit === 'GB' ? parsed * 1024 : parsed);
  };

  const numberOfPages = Math.floor(sizeMB * 1024 / 16);
  useEffect(() => {
    if (isAddVolumeModalOpen && selectedHostUid && selectedDatabase) {
      resetAction();
      const fetchStatus = async () => {
        setFetchingStatus(true);
        try {
          const response = await databaseApi.getAddVolStatus(selectedHostUid, selectedDatabase);
          setVolStatus(response);
          setPath(response.volpath || '');
        } catch (err) {
          console.error('Failed to fetch add volume status:', err);
        } finally {
          setFetchingStatus(false);
        }
      };
      fetchStatus();
      setPurpose('data');
      setSizeMB(512);
    }
  }, [isAddVolumeModalOpen, selectedHostUid, selectedDatabase, resetAction]);

  if (!isAddVolumeModalOpen) return null;

  const handleAdd = async () => {
    if (!selectedHostUid || !selectedDatabase) return;
    
    startAction();

    try {
      const payload = {
        volname: '',
        purpose,
        path,
        numberofpages: numberOfPages.toString(),
        size_need_mb: `${sizeMB.toFixed(3)}(MB)`
      };
      await runJob(
        () => databaseJobApi.submitAddVol(selectedHostUid, selectedDatabase, payload),
        { onProgress: (j) => setJobStatus(j.jobStatus ?? j.status) }
      );
      // This job may have been backgrounded (and the modal reopened for a
      // different database) by the time it settles — its outcome then
      // belongs to the global job tray, not this now-reused modal instance.
      if (!wasBackgrounded()) endSuccess();
    } catch (err) {
      if (!wasBackgrounded()) endError(typeof err === 'string' ? err : err.message || CM.failure);
    }
  };

  const handleClose = () => {
    dispatch(closeAddVolumeModal());
    resetAction();
  };
  /* ─── LOADING view ─── */
  if (isLoading) {
    return (
      <Modal isOpen title={CM.volumeAllocation} icon="add_box" onClose={handleClose} maxWidth="560px" showCloseButton={false}>
        <ModalStatusLoading
          title={CM.scalingFoundation}
          subtitle={getCmsJobLoadingSubtitle(selectedDatabase, jobStatus, CM)}
          onBackground={() => { background(); handleClose(); }}
        />
      </Modal>
    );
  }

  /* ─── SUCCESS view ─── */
  if (isSuccess) {
    return (
      <Modal isOpen title={CM.allocationSuccessful} icon="add_box" iconVariant="success" onClose={handleClose} maxWidth="560px">
        <ModalStatusSuccess
          title={CM.storageExpanded}
          message={CM.addVolumeSuccessMessage('', selectedDatabase)}
          onConfirm={handleClose}
          confirmText={CM.ok}
        />
      </Modal>
    );
  }

  /* ─── ERROR view ─── */
  if (isError) {
    return (
      <Modal isOpen title={CM.allocationInterrupted} icon="add_box" iconVariant="danger" onClose={resetAction} maxWidth="560px">
        <ModalStatusError
          title={CM.scalingFailed}
          error={error}
          guidance={CM.addVolumeGuidance}
          onRetry={handleAdd}
          onCancel={resetAction}
          retryText={CM.retryAddVolume}
          cancelText={CM.dismiss}
        />
      </Modal>
    );
  }

  /* ─── FORM view ─── */
  return (
    <Modal
      isOpen={isAddVolumeModalOpen}
      onClose={handleClose}
      title={CM.provisionVolume}
      subtitle={CM.extendDiskCapacity(selectedDatabase)}
      icon="add_to_drive"
      maxWidth="560px"
      testId="add-volume"
      onSubmit={handleAdd}
      submitDisabled={!path || !sizeMB || fetchingStatus}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="add-volume-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          <Button
            data-testid="add-volume-save-btn"
            variant="primary"
            onClick={handleAdd}
            icon="add_to_drive"
            disabled={!path || !sizeMB || fetchingStatus}
            className="min-w-[140px]"
          >
            {CM.addVolume}
          </Button>
        </div>
      }
    >
      <div className="space-y-7 animate-in fade-in duration-200">
        
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/4 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon name="database" size="16px" weight={300} className="text-amber-500 shrink-0" />
            <Typography variant="p" className="text-14 font-medium text-slate-700 dark:text-slate-200 font-mono truncate">{selectedDatabase}</Typography>
          </div>
          <Typography variant="p" className="text-14 font-medium text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
            {fetchingStatus ? CM.calculating : `${CM.availableSpace}: ${volStatus.freespace || '—'}`}
          </Typography>
        </div>

        {/* Purpose Selector */}
        <div className="space-y-4">
           <SectionHeader title={CM.volumeType} icon="category" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label={CM.volumeType}>
            {PURPOSE_OPTIONS.map((opt) => {
              const isActive = purpose === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPurpose(opt.value)}
                  role="radio"
                  aria-checked={isActive}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors
                    ${isActive
                      ? 'bg-amber-500/8 border-amber-500/40'
                      : 'bg-slate-50 dark:bg-white/4 border-slate-200 dark:border-white/10 hover:border-amber-500/40'
                    }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0
                    ${isActive ? 'bg-amber-500/10 border-amber-500/25' : 'bg-white dark:bg-white/5 border-transparent'}`}
                  >
                    <Icon name={opt.icon} size="14px" weight={300} className={isActive ? 'text-amber-500' : 'text-slate-400'} />
                  </div>
                  <Typography variant="p" className="flex-1 text-14 font-medium text-slate-700 dark:text-slate-200">
                    {CM[opt.labelKey]}
                  </Typography>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isActive ? 'border-amber-500/40' : 'border-slate-300 dark:border-white/20'}`}>
                    {isActive && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Allocation Size */}
        <div className="space-y-5">
           <SectionHeader title={CM.volumeSize} icon="straighten" />

          <div className="flex flex-wrap gap-1.5 px-0.5">
            {SIZE_PRESETS.map((preset) => (
              <button
                key={preset.mb}
                type="button"
                onClick={() => setSizeMB(preset.mb)}
                className={`px-3 py-1.5 rounded-lg border text-13 font-medium transition-colors
                  ${sizeMB === preset.mb
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-500 shadow-xs'
                    : 'bg-white dark:bg-white/2 border-slate-100 dark:border-white/5 text-slate-400 hover:border-amber-500/30 hover:text-amber-500'
                  }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              type="number"
              label={CM.customCapacity}
              value={displaySize}
              onChange={(e) => handleDisplaySizeChange(e.target.value)}
              icon="memory"
              suffix={
                <button
                  type="button"
                  onClick={() => setSizeUnit((u) => (u === 'MB' ? 'GB' : 'MB'))}
                  className="text-12 font-medium text-slate-400 dark:text-slate-500 hover:text-amber-500 uppercase tracking-widest bg-slate-100 dark:bg-white/5 hover:bg-amber-500/10 px-2 py-0.5 rounded-md border border-slate-200/50 dark:border-white/5 hover:border-amber-500/30 transition-all cursor-pointer"
                  title={CM.switchUnit}
                >
                  {sizeUnit}
                </button>
              }
              min={0}
            />
            <FormField label={CM.blocksAllocated} labelId="add-volume-page-count-label">
              <output
                aria-labelledby="add-volume-page-count-label"
                className="h-10 px-4 flex items-center justify-between bg-slate-50/50 dark:bg-white/2 border border-slate-100 dark:border-white/5 rounded-xl"
              >
                <span className="text-15 font-medium font-mono text-slate-700 dark:text-slate-200 tabular-nums">{numberOfPages.toLocaleString()}</span>
                <span className="text-12 text-slate-400 dark:text-slate-500">{CM.pagesLabel}</span>
              </output>
            </FormField>
          </div>
        </div>

        {/* Volume Location */}
        <div className="space-y-4">
           <SectionHeader title={CM.volumeDir} icon="folder_zip" />
          <div className="grid grid-cols-1 gap-4">
            <Input label={CM.volumeDir} value={path} onChange={(e) => setPath(e.target.value)} placeholder="/var/lib/cubrid/volumes" icon="folder_zip" className="font-mono!" required />
          </div>
        </div>

        {/* Guidance Disclaimer */}
        <InfoBanner title={CM.privilegedOperation} icon="shield_lock">
          {CM.addVolumeNote}
        </InfoBanner>

      </div>
    </Modal>
  );
}
