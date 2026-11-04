import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeCopyDatabaseModal, fetchDatabaseStartInfo } from '../databaseSlice';
import { databaseJobApi } from '../databaseJobApi';
import { databaseApi } from '../databaseApi';
import { useCmsJob } from '../../../infrastructure/hooks/useCmsJob';
import { JobWarnings } from '../../../infrastructure/cmsJob/JobWarnings';
import { getCmsJobLoadingSubtitle } from '../../../infrastructure/cmsJob/cmsJobUi';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Table } from '../../../components/ds/layout/Table';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Checkbox } from '../../../components/ds/forms/Checkbox';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import { 
  ModalStatusLoading, 
  ModalStatusSuccess, 
  ModalStatusError 
} from '../../../components/ds/feedback/ActionStatus';
import { useCM } from '../../../constants/useCM';
import { normalizeCopyVolumes, canCopyIndividualVolumes, buildCopyVolumeMappings } from '../copyDatabaseVolumes';

const getPathSeparator = (path) => (path && path.includes('\\') ? '\\' : '/');

const getParentDirectory = (path) => {
  if (!path) return '';
  const separator = getPathSeparator(path);
  const parts = path.split(separator);
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join(separator);
};

export default function CopyDatabaseModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isCopyDatabaseModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase, databasesByHost, haDbNamesByHost } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);
  // copydb's "delete source" removes an HA member locally while ha_db_list
  // and the peers still name it, like a rename or delete (both blocked for HA).
  const isSourceHa = (haDbNamesByHost?.[selectedHostUid] || []).includes(selectedDatabase);
  const databases = databasesByHost[selectedHostUid] || [];
  const currentDb = databases?.find((db) => db.dbname === selectedDatabase);

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
  // What the job's follow-up could not do (cubrid.conf, stored login); the
  // copy or delete itself succeeded.
  const [warnings, setWarnings] = useState([]);

  const [formData, setFormData] = useState({
    destName: '',
    destPath: '',
    extPath: '',
    logPath: '',
    replaceExisting: false,
    deleteSource: false,
    copyIndividual: false,
  });

  const [manuallyEditedPaths, setManuallyEditedPaths] = useState({
    destPath: false,
    extPath: false,
    logPath: false,
  });
  const [srcLogDir, setSrcLogDir] = useState('');
  const [diskInfo, setDiskInfo] = useState({ freeSpace: '-', dbSize: '-' });
  const [volumes, setVolumes] = useState([]);
  const [volInfoLoading, setVolInfoLoading] = useState(false);

  // Read by the setup effect below, which must not re-run on them.
  const busyRef = useRef(false);
  useEffect(() => { busyRef.current = isLoading || isSuccess; }, [isLoading, isSuccess]);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // Set up when the modal opens, and again if the source changes on the
    // form. A copy that deletes its source drops it from the list while the
    // job runs and after it succeeds, which changes currentDb; that re-run
    // must not throw the job's progress or result back to an empty form.
    const justOpened = isCopyDatabaseModalOpen && !wasOpenRef.current;
    wasOpenRef.current = isCopyDatabaseModalOpen;
    if (isCopyDatabaseModalOpen && (justOpened || !busyRef.current)) {
      resetAction();
      setWarnings([]);
      if (selectedHostUid && !currentDb) {
        dispatch(fetchDatabaseStartInfo(selectedHostUid));
      }
      const defaultPath = currentDb?.dbdir || '';
      setFormData({
        destName: '',
        destPath: defaultPath,
        extPath: defaultPath,
        logPath: defaultPath,
        replaceExisting: false,
        deleteSource: false,
        copyIndividual: false,
      });
      setManuallyEditedPaths({
        destPath: false,
        extPath: false,
        logPath: false,
      });
      setSrcLogDir('');
      setDiskInfo({ freeSpace: '-', dbSize: '-' });
      setVolumes([]);

      if (selectedHostUid && selectedDatabase) {
        setVolInfoLoading(true);
        databaseApi.getVolumeInfo(selectedHostUid, selectedDatabase)
          .then((res) => {
            if (cancelled) return;
            const freeMB = res?.freespace != null ? `${res.freespace} (MiB)` : '-';
            const sizeMB = res?.dbsize != null ? `${Math.round(res.dbsize / (1024 * 1024))} (MiB)` : '-';
            setDiskInfo({ freeSpace: freeMB, dbSize: sizeMB });

            const logVol = (res?.spaceinfo || []).find(s => s?.type?.toLowerCase() === 'active_log');
            if (logVol?.location) {
              setSrcLogDir(logVol.location);
            }
            setVolumes(normalizeCopyVolumes(res?.spaceinfo));
          })
          .catch((err) => {
            if (!cancelled) console.error('Failed to fetch volume info for copy:', err);
          })
          .finally(() => {
            if (!cancelled) setVolInfoLoading(false);
          });
      }
    }
    return () => {
      cancelled = true;
    };
    // currentDb?.dbdir (not currentDb) is the dependency deliberately — see
    // RenameDatabaseModal.jsx for the same convention. handleCopy's success
    // path dispatches fetchDatabaseStartInfo to refresh the tree with the new
    // clone, which replaces the whole `databases` array and gives `currentDb`
    // a new object reference with the same dbdir value. Depending on the
    // object itself re-ran this effect on that refresh alone and called
    // resetAction() right after endSuccess(), silently bouncing the modal
    // from its success view back to the form.
  }, [isCopyDatabaseModalOpen, selectedHostUid, selectedDatabase, currentDb?.dbdir, resetAction, dispatch]);

  // Desktop EditListener alignment: Auto-update target paths and volume mapping when destName changes
  useEffect(() => {
    if (!formData.destName) return;

    const parentDir = getParentDirectory(currentDb?.dbdir || '');
    const separator = getPathSeparator(currentDb?.dbdir || '');
    const targetPath = parentDir ? `${parentDir}${separator}${formData.destName.trim()}` : (currentDb?.dbdir || '');

    setFormData(prev => {
      let changed = false;
      const next = { ...prev };
      if (!manuallyEditedPaths.destPath && targetPath && prev.destPath !== targetPath) {
        next.destPath = targetPath;
        changed = true;
      }
      if (!manuallyEditedPaths.extPath && targetPath && prev.extPath !== targetPath) {
        next.extPath = targetPath;
        changed = true;
      }
      if (!manuallyEditedPaths.logPath && targetPath && prev.logPath !== targetPath) {
        next.logPath = targetPath;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [formData.destName, selectedDatabase, currentDb?.dbdir, manuallyEditedPaths]);

  // Derive defaults from the latest name and metadata, including when the
  // user types a name before getVolumeInfo finishes. Keep explicit edits.
  const parentDir = getParentDirectory(currentDb?.dbdir || '');
  const separator = getPathSeparator(currentDb?.dbdir || '');
  const targetPath = parentDir ? `${parentDir}${separator}${formData.destName.trim()}` : (currentDb?.dbdir || '');
  const copyVolumes = volumes.map(volume => ({
    ...volume,
    newVolumeName: volume.isNameEdited ? volume.newVolumeName
      : formData.destName.trim() ? (volume.volid === 0 ? formData.destName.trim()
        : `${formData.destName.trim()}_x${String(volume.volid).padStart(3, '0')}`) : volume.spacename,
    newLocation: volume.isLocationEdited ? volume.newLocation
      : formData.destName.trim() ? targetPath : volume.location,
  }));
  const individualVolumesValid = !volInfoLoading && canCopyIndividualVolumes(copyVolumes);
  const isDestinationSameAsSource = !!formData.destName.trim() && formData.destName.trim() === selectedDatabase;
  const canSubmit = !!formData.destName.trim() && !isDestinationSameAsSource &&
    (!formData.copyIndividual || individualVolumesValid);

  if (!isCopyDatabaseModalOpen) return null;

  const handleInputChange = (field, value) => {
    if (['destPath', 'extPath', 'logPath'].includes(field)) {
      setManuallyEditedPaths(prev => ({ ...prev, [field]: true }));
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleVolumeChange = (index, field, value) => {
    setVolumes(prev => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };
      if (field === 'newVolumeName') {
        item.isNameEdited = true;
      } else if (field === 'newLocation') {
        item.isLocationEdited = true;
      }
      next[index] = item;
      return next;
    });
  };

  const volumeColumns = [
    {
      header: CM.tblColumnCurrentVolName,
      accessor: 'fullPath',
      width: '40%',
      className: 'font-semibold!',
      cellClassName: 'min-w-[180px] max-w-[260px] font-mono truncate',
      render: (fullPath) => <span title={fullPath}>{fullPath}</span>,
    },
    {
      header: CM.tblColumnCopyNewVolName,
      accessor: 'newVolumeName',
      width: '30%',
      className: 'font-semibold!',
      cellClassName: 'min-w-[160px] p-1.5!',
      render: (value, volume) => (
        <Input
          size="sm"
          disabled={!formData.copyIndividual}
          value={value}
          aria-label={`${CM.tblColumnCopyNewVolName}: ${volume.fullPath}`}
          onChange={event => handleVolumeChange(volume.volumeIndex, 'newVolumeName', event.target.value)}
        />
      ),
    },
    {
      header: CM.tblColumnCopyNewDirPath,
      accessor: 'newLocation',
      width: '30%',
      className: 'font-semibold!',
      cellClassName: 'min-w-[180px] p-1.5!',
      render: (value, volume) => (
        <Input
          size="sm"
          disabled={!formData.copyIndividual}
          value={value}
          aria-label={`${CM.tblColumnCopyNewDirPath}: ${volume.fullPath}`}
          inputClassName="font-mono"
          onChange={event => handleVolumeChange(volume.volumeIndex, 'newLocation', event.target.value)}
        />
      ),
    },
  ];

  const volumeRows = copyVolumes.map((volume, volumeIndex) => ({
    ...volume,
    rowKey: volume.fullPath || volumeIndex,
    volumeIndex,
  }));

  const handleCopy = async () => {
    if (!canSubmit) return;

    startAction();
    const advanced = formData.copyIndividual ? 'on' : 'off';
    const volumeList = formData.copyIndividual ? buildCopyVolumeMappings(copyVolumes) : undefined;

    const payload = {
      srcdbname: selectedDatabase,
      destdbname: formData.destName.trim(),
      destdbpath: formData.destPath,
      exvolpath: formData.extPath,
      logpath: formData.logPath,
      overwrite: formData.replaceExisting ? 'y' : 'n',
      move: formData.deleteSource && !isSourceHa ? 'y' : 'n',
      advanced,
      ...(volumeList && { volume: volumeList }),
    };

    try {
      const job = await runJob(
        () => databaseJobApi.submitCopy(selectedHostUid, payload),
        { onProgress: (j) => setJobStatus(j.jobStatus ?? j.status) }
      );
      if (!wasBackgrounded()) {
        dispatch(fetchDatabaseStartInfo(selectedHostUid));
        setWarnings(job?.warnings ?? []);
        endSuccess(`${CM.copyCompleted}: ${formData.destName}`);
      }
    } catch (err) {
      if (!wasBackgrounded()) endError(typeof err === 'string' ? err : (err.message || CM.operationFailed));
    }
  };

  const handleClose = () => {
    dispatch(closeCopyDatabaseModal());
    resetAction();
  };

  /* ─── LOADING view ─── */
  if (isLoading) {
    return (
      <Modal isOpen title={CM.copyDatabase || CM.cloneDatabase} icon="content_copy" onClose={handleClose} maxWidth="640px">
        <ModalStatusLoading
          title={CM.synchronizingVolumes}
          subtitle={getCmsJobLoadingSubtitle(formData.destName, jobStatus, CM)}
          onBackground={() => { background(); handleClose(); }}
        />
      </Modal>
    );
  }

  /* ─── SUCCESS view ─── */
  if (isSuccess) {
    return (
      <Modal isOpen title={CM.cloningComplete} icon="content_copy" iconVariant="success" onClose={handleClose} maxWidth="640px">
        <ModalStatusSuccess
          title={CM.copyCompleted}
          message={`${CM.copyCompleted}: ${formData.destName}`}
          onConfirm={handleClose}
          confirmText={CM.ok}
        >
          <JobWarnings warnings={warnings} />
        </ModalStatusSuccess>
      </Modal>
    );
  }

  /* ─── ERROR view ─── */
  if (isError) {
    return (
      <Modal isOpen title={CM.cloningFailed} icon="content_copy" iconVariant="danger" onClose={resetAction} maxWidth="640px">
        <ModalStatusError
          title={CM.operationInterrupted}
          error={error}
          guidance={CM.copyDbGuidance}
          onRetry={handleCopy}
          onCancel={resetAction}
          retryText={CM.retryClone}
          cancelText={CM.dismiss}
        />
      </Modal>
    );
  }

  /* ─── FORM view ─── */
  return (
    <Modal
      isOpen={isCopyDatabaseModalOpen}
      onClose={handleClose}
      title={CM.copyDatabase}
      subtitle={CM.msgCopyDbDialog}
      icon="content_copy"
      maxWidth="820px"
      testId="copy-database"
      onSubmit={handleCopy}
      submitDisabled={!canSubmit}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="copy-database-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          <Button 
            data-testid="copy-database-execute-btn"
            variant="primary" 
            onClick={handleCopy} 
            icon="content_copy"
            className="min-w-[140px]"
            disabled={!canSubmit}
          >
            {CM.ok}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Source Database Group */}
        <div>
          <SectionHeader title={CM.grpDbSourceName} icon="database" />
          <div className="bg-slate-50 dark:bg-white/4 border border-slate-200 dark:border-white/8 rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-3 gap-3 items-center">
              <label className="text-14 font-medium text-slate-600 dark:text-slate-400">
                {CM.lblSrcDbName}
              </label>
              <div className="col-span-2">
                <Input
                  value={selectedDatabase}
                  disabled
                  size="md"
                  className="font-bold text-15"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 items-center">
              <label className="text-14 font-medium text-slate-600 dark:text-slate-400">
                {CM.lblSrcDbPathName}
              </label>
              <div className="col-span-2">
                <Input
                  value={currentDb?.dbdir || '-'}
                  disabled
                  size="md"
                  className="font-mono text-14"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 items-center">
              <label className="text-14 font-medium text-slate-600 dark:text-slate-400">
                {CM.lblSrcLogPathName}
              </label>
              <div className="col-span-2">
                <Input
                  value={srcLogDir || currentDb?.dbdir || '-'}
                  disabled
                  size="md"
                  className="font-mono text-14"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Destination Database Group */}
        <div>
          <SectionHeader title={CM.grpDbDestName} icon="move_to_inbox" />
          <div className="bg-white dark:bg-white/2 border border-slate-200 dark:border-white/8 rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-3 gap-3 items-center">
              <label className="text-14 font-medium text-slate-600 dark:text-slate-400">
                {CM.lblDescDbName}
              </label>
              <div className="col-span-2">
                <Input
                  data-testid="copy-database-dest-name-input"
                  value={formData.destName}
                  error={isDestinationSameAsSource ? CM.copyDestinationSameAsSource : undefined}
                  onChange={e => handleInputChange('destName', e.target.value)}
                  placeholder={CM.examplePlaceholder('demodb_copy')}
                  autoFocus
                  size="md"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 items-center">
              <label className="text-14 font-medium text-slate-600 dark:text-slate-400">
                {CM.lblDescDbPathName}
              </label>
              <div className="col-span-2">
                <Input
                  value={formData.destPath}
                  onChange={e => handleInputChange('destPath', e.target.value)}
                  disabled={formData.copyIndividual}
                  size="md"
                  className="font-mono text-14"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 items-center">
              <label className="text-14 font-medium text-slate-600 dark:text-slate-400">
                {CM.lblVolumePathName}
              </label>
              <div className="col-span-2">
                <Input
                  value={formData.extPath}
                  onChange={e => handleInputChange('extPath', e.target.value)}
                  disabled={formData.copyIndividual}
                  size="md"
                  className="font-mono text-14"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 items-center">
              <label className="text-14 font-medium text-slate-600 dark:text-slate-400">
                {CM.lblDescLogPathName}
              </label>
              <div className="col-span-2">
                <Input
                  value={formData.logPath}
                  onChange={e => handleInputChange('logPath', e.target.value)}
                  size="md"
                  className="font-mono text-14"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Disk Space Indicator */}
        <div className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-13 text-slate-600 dark:text-slate-300">
          <Icon name="sd_card" size="xs" className="text-amber-500" />
          <span>{typeof CM.lblCopyFreeDiskSize === 'function' ? CM.lblCopyFreeDiskSize(diskInfo.freeSpace) : `Free disk space: ${diskInfo.freeSpace}`}</span>
        </div>

        {/* Copy Individual Volumes Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Checkbox
              data-testid="copy-database-individual-toggle"
              label={CM.btnCopyVolume}
              checked={formData.copyIndividual}
              onChange={e => handleInputChange('copyIndividual', e.target.checked)}
              disabled={!formData.destName.trim()}
            />
          </div>

          {formData.copyIndividual && !volInfoLoading && !individualVolumesValid && (
            <p role="alert" className="text-14 text-rose-600 dark:text-rose-400">{CM.copyVolumeMappingInvalid}</p>
          )}
          <div className={`border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden mt-2 bg-white dark:bg-white/2 transition-all ${
            !formData.copyIndividual ? 'opacity-50 pointer-events-none select-none bg-slate-50/50 dark:bg-white/[0.01]' : ''
          }`}>
            {volInfoLoading ? (
              <div className="p-4 text-center text-slate-400 text-14">{CM.loadingLabel}</div>
            ) : (
              <Table
                columns={volumeColumns}
                data={volumeRows}
                emptyMessage={CM.noVolumesDetected}
                showEmptyStateAsRow
                bordered
                stickyHeader
                selectable
                className="max-h-[180px] overflow-auto"
              />
            )}
          </div>
        </div>

        {/* Options */}
        <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-white/5">
          <Checkbox
            label={CM.btnReplaceDb}
            checked={formData.replaceExisting}
            onChange={e => handleInputChange('replaceExisting', e.target.checked)}
          />
          <Checkbox
            label={CM.btnDeleteSrcDb}
            checked={formData.deleteSource && !isSourceHa}
            disabled={isSourceHa}
            onChange={e => handleInputChange('deleteSource', e.target.checked)}
          />
        </div>
      </div>
    </Modal>
  );
}
