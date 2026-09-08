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
import { Typography } from '../../../components/ds/foundation/Typography';
import { Select } from '../../../components/ds/forms/Select';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import { 
  ModalStatusLoading, 
  ModalStatusSuccess, 
  ModalStatusError 
} from '../../../components/ds/feedback/ActionStatus';

// view states
const VIEW_FORM    = 'form';
const VIEW_LOADING = 'loading';
const VIEW_SUCCESS = 'success';
const VIEW_ERROR   = 'error';

const PURPOSE_OPTIONS = [
  {
    value: 'data',
    labelKey: 'volumeTypeData',
    descKey: 'volumeTypeDataDesc',
    icon: 'database',
    color: 'text-sky-500',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/25',
    activeBg: 'bg-sky-500/8',
    activeBorder: 'border-sky-500/40',
  },
  {
    value: 'temp',
    labelKey: 'volumeTypeTemp',
    descKey: 'volumeTypeTempDesc',
    icon: 'timer',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    activeBg: 'bg-emerald-500/8',
    activeBorder: 'border-emerald-500/40',
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
    state, 
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
  const selectedPurpose = PURPOSE_OPTIONS.find(o => o.value === purpose);

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
  const formatSize = (mb) => mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;

  /* ─── LOADING view ─── */
  if (isLoading) {
    return (
      <Modal isOpen title={CM.volumeAllocation} icon="add_box" onClose={handleClose} maxWidth="720px">
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
      <Modal isOpen title={CM.allocationSuccessful} icon="add_box" iconVariant="success" onClose={handleClose} maxWidth="720px">
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
      <Modal isOpen title={CM.allocationInterrupted} icon="add_box" iconVariant="danger" onClose={resetAction} maxWidth="720px">
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
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-12 font-bold uppercase tracking-widest italic">
            <Icon name="info" size="15px" weight={300} />
            <span>{CM.activeInstanceRequired}</span>
          </div>
          <div className="flex gap-3">
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
        </div>
      }
    >
      <div className="space-y-8 pb-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
        
        {/* Target Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-linear-to-r from-amber-500/8 to-transparent p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Icon name="database" size="md" weight={300} className="text-amber-500" />
              </div>
              <div className="min-w-0">
                <Typography variant="caption" className="font-black uppercase tracking-widest text-amber-600/70 dark:text-amber-400/60 mb-0.5">
                  {CM.addVolumeTargetDb}
                </Typography>
                <Typography variant="h4" className="text-16 font-black text-amber-700 dark:text-amber-400 font-mono truncate">
                  {selectedDatabase}
                </Typography>
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <Typography variant="caption" className="font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 text-11">{CM.availableSpace}</Typography>
              {fetchingStatus ? (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-100 dark:border-white/8">
                  <div className="w-2 h-2 border-[1.5px] border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                  <span className="text-12 text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tighter">{CM.calculating}</span>
                </div>
              ) : (
                <StatusBadge 
                  label={volStatus.freespace || '—'} 
                  variant="emerald" 
                  pulse={true} 
                  className="rounded-full tabular-nums text-14" 
                />
              )}
            </div>
          </div>
        </div>

        {/* Purpose Selector */}
        <div className="space-y-4">
           <SectionHeader title={CM.volumeType} icon="category" />
          <div className="grid grid-cols-2 gap-2.5">
            {PURPOSE_OPTIONS.map((opt) => {
              const isActive = purpose === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPurpose(opt.value)}
                  className={`flex flex-col items-center text-center p-3.5 rounded-2xl border transition-all duration-200 group relative overflow-hidden
                    ${isActive
                      ? `${opt.activeBg} ${opt.activeBorder} shadow-xs`
                      : 'bg-white dark:bg-white/1 border-slate-100 dark:border-white/4 hover:border-slate-200 dark:hover:border-white/10'
                    }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 border transition-all
                    ${isActive ? `${opt.bg} ${opt.border}` : 'bg-slate-50 dark:bg-white/5 border-transparent'}`}
                  >
                    <Icon name={opt.icon} size="xs" weight={300} className={isActive ? opt.color : 'text-slate-400'} />
                  </div>
                  <Typography variant="p" className={`font-black text-13 mb-0.5 transition-colors leading-none tracking-tight ${isActive ? opt.color : 'text-slate-600 dark:text-slate-400'}`}>
                    {CM[opt.labelKey]}
                  </Typography>
                  <span className="text-10 text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tighter">{CM[opt.descKey]}</span>
                  {isActive && (
                    <div className={`absolute top-2 right-2 w-4 h-4 rounded-full ${opt.bg} border ${opt.border} flex items-center justify-center shadow-xs`}>
                      <Icon name="check" size="11px" weight={800} className={opt.color} />
                    </div>
                  )}
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
                className={`px-3 py-1.5 rounded-xl border text-12 font-black transition-all uppercase tracking-[0.1em]
                  ${sizeMB === preset.mb
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-500 shadow-xs'
                    : 'bg-white dark:bg-white/2 border-slate-100 dark:border-white/5 text-slate-400 hover:border-amber-500/30 hover:text-amber-500'
                  }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
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
                  className="text-12 font-black text-slate-400 dark:text-slate-500 hover:text-amber-500 uppercase tracking-widest bg-slate-100 dark:bg-white/5 hover:bg-amber-500/10 px-2 py-0.5 rounded-md border border-slate-200/50 dark:border-white/5 hover:border-amber-500/30 transition-all cursor-pointer"
                  title={CM.switchUnit}
                >
                  {sizeUnit}
                </button>
              }
              min={0}
              size="sm"
            />
            <div className="space-y-1">
              <span className="text-12 font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 block">{CM.blocksAllocated}</span>
              <div className="h-10 px-4 flex items-center justify-between bg-slate-50/50 dark:bg-white/2 border border-slate-100 dark:border-white/5 rounded-xl">
                <span className="text-15 font-black font-mono text-amber-500 tabular-nums">{numberOfPages.toLocaleString()}</span>
                <span className="text-11 text-slate-400 dark:text-slate-500 uppercase tracking-widest font-black">pages</span>
              </div>
            </div>
          </div>

          {/* Progress bar visual */}
          <div className="p-4 bg-slate-50/50 dark:bg-white/1 border border-slate-100 dark:border-white/5 rounded-2xl space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-11 font-black uppercase tracking-[0.2em] text-slate-400">{CM.volumeSizeVisualizer}</span>
              <div className="flex items-center gap-2">
                <span className={`text-15 font-black font-mono ${selectedPurpose?.color || 'text-amber-500'}`}>
                  {formatSize(sizeMB)}
                </span>
                <Icon name="keyboard_double_arrow_right" size="15px" className="text-slate-300 dark:text-white/10" />
              </div>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-white/8 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  purpose === 'data' ? 'bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)]' :
                  'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                }`}
                style={{ width: `${Math.min((sizeMB / 20480) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-10 text-slate-400 dark:text-slate-600 font-black uppercase tracking-widest">
              <span>Empty</span><span>5 GB</span><span>10 GB</span><span>Max (20GB)</span>
            </div>
          </div>
        </div>

        {/* Volume Location */}
        <div className="space-y-4">
           <SectionHeader title={CM.volumeDir} icon="folder_zip" />
          <div className="grid grid-cols-1 gap-4">
            <Input label={CM.volumeDir} value={path} onChange={(e) => setPath(e.target.value)} placeholder="/var/lib/cubrid/volumes" icon="folder_zip" size="sm" className="font-mono!" required />
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
