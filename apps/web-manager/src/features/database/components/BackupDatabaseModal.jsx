import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeBackupDatabaseModal, fetchBackupDbInfo, setPendingBackupJob, clearPendingBackupJob } from '../databaseSlice';
import { dbKey } from '../dbKey';
import { databaseJobApi } from '../databaseJobApi';
import { useCmsJobs } from '../../../infrastructure/context/CmsJobContext';
import { getCmsJobLoadingSubtitle } from '../../../infrastructure/cmsJob/cmsJobUi';
import { deriveBackupDir } from '../backupPathUtils';

import { Modal } from '../../../components/ds/layout/Modal';
import {
  CaDialogField,
  CaDialogFieldGrid,
  CaDialogTable,
  CaDialogTabs,
} from '../../../components/ds/layout/CaDialogLayout';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { Checkbox } from '../../../components/ds/forms/Checkbox';
import { Typography } from '../../../components/ds/foundation/Typography';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import { 
  ModalStatusLoading, 
  ModalStatusSuccess, 
  ModalStatusError 
} from '../../../components/ds/feedback/ActionStatus';
import { useCM } from '../../../constants/useCM';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';

const TAB_INFO = 'info';
const TAB_HISTORY = 'history';

const formatBackupDate = (value) => {
  if (!value) return '-';
  const parts = String(value).split('.');
  if (parts.length === 5) {
    return `${parts[0]}.${parts[1]}.${parts[2]} ${parts[3]}:${parts[4]}`;
  }
  return value;
};

const formatBackupSize = (value) => {
  const size = Number(value);
  if (!Number.isFinite(size)) return '-';
  return (size / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 2 });
};

export default function BackupDatabaseModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isBackupDatabaseModalOpen, pendingBackupJob } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase } = useSelector((state) => state.database, shallowEqual);
  const { backupDbInfo: databaseBackupInfo } = useSelector((state) => state.databaseOperation, shallowEqual);
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
  const { trackJob } = useCmsJobs();
  const [jobStatus, setJobStatus] = useState(null);
  // Identifies the most recent handleBackup() call. This modal has no
  // runJob()/background() concept (unlike the other CMS-job modals) — its
  // own "background" button just closes the modal while `trackJob` keeps
  // polling underneath, and it's a singleton reused for the next database
  // the user opens it for. Without this, an older backup's trackJob() call
  // (for e.g. "demodb") can still resolve after the user has reopened the
  // modal and started a second backup (for "test2"), and would flip the
  // modal to its success view using whatever database is *currently*
  // selected — not the one that backup actually ran against.
  const latestBackupTokenRef = useRef(null);

  const [formData, setFormData] = useState({
    backupLevel: '0',
    backupDir: '',
    parallelBackup: '0',
    checkConsistency: true,
    deleteUnnecessary: false,
    compress: true
  });
  const [activeTab, setActiveTab] = useState(TAB_INFO);
  const [backupInfoFetchError, setBackupInfoFetchError] = useState(false);

  const backupInfo = selectedDatabase ? databaseBackupInfo[dbKey(selectedHostUid, selectedDatabase)] : null;

  // Keep a ref so the modal-open effect can read the latest backupInfo
  // synchronously without adding it to its own dependency array.
  const backupInfoRef = useRef(null);
  useEffect(() => { backupInfoRef.current = backupInfo; }, [backupInfo]);
  const hasUserEditedDirRef = useRef(false);
  const backupHistory = useMemo(() => {
    if (!backupInfo) return [];
    return [0, 1, 2].flatMap((level) => {
      const entries = backupInfo[`level${level}`];
      return Array.isArray(entries)
        ? entries.map((entry, index) => ({
          ...entry,
          rowKey: `${level}-${entry.path || index}`,
          level: CM.levelNumberLabel(level),
          levelNum: level,
          date: formatBackupDate(entry.date || entry.data),
          size: formatBackupSize(entry.size),
          path: entry.path || '-',
        }))
        : [];
    });
  }, [backupInfo, CM]);

  const availableLevels = useMemo(() => {
    const levels = ['0'];
    if (backupHistory.some((entry) => entry.levelNum === 0)) levels.push('1');
    if (backupHistory.some((entry) => entry.levelNum === 1)) levels.push('2');
    return levels;
  }, [backupHistory]);

  const backupLevelOptions = useMemo(() => (
    availableLevels.map((level) => ({ value: level, label: CM.levelNumberLabel(level) }))
  ), [availableLevels, CM]);

  // CMS has no "delete existing backup" API, so a same-level backup to the
  // same directory just overwrites in place — warn instead of silently
  // proceeding (PM report: backing up to a previous location at the same
  // level ran with no notice that it would replace an existing backup).
  const existingBackupAtLevel = useMemo(() => {
    const dir = (formData.backupDir || '').replace(/\/+$/, '');
    if (!dir) return null;
    return backupHistory.find((entry) => (
      entry.levelNum === Number(formData.backupLevel) &&
      typeof entry.path === 'string' &&
      entry.path.startsWith(dir)
    )) || null;
  }, [backupHistory, formData.backupDir, formData.backupLevel]);

  const backupHistoryColumns = useMemo(() => [
    { header: CM.backupLevel, accessor: 'level', width: '100px' },
    { header: CM.backupDate, accessor: 'date', width: '150px' },
    { header: CM.backupSizeColumn, accessor: 'size', width: '110px' },
    { header: CM.backupPath, accessor: 'path', cellClassName: 'font-mono break-all' },
  ], [CM]);

  // When backupInfo loads (fetch completes after modal open), fill backupDir only if still empty.
  // Uses functional updater so prev.backupDir is always current — no stale-closure race.
  useEffect(() => {
    if (!isBackupDatabaseModalOpen || !backupInfo?.dbdir || hasUserEditedDirRef.current) return;
    setFormData(prev => {
      if (prev.backupDir) return prev;
      return { ...prev, backupDir: deriveBackupDir(backupInfo.dbdir) };
    });
  }, [backupInfo, isBackupDatabaseModalOpen]);

  useEffect(() => {
    if (!availableLevels.includes(formData.backupLevel)) {
      const nextLevel = availableLevels[availableLevels.length - 1] || '0';
      setFormData(prev => ({ ...prev, backupLevel: nextLevel }));
    }
  }, [availableLevels, formData.backupLevel]);

  useEffect(() => {
    if (!isBackupDatabaseModalOpen) return;
    resetAction();
    setActiveTab(TAB_INFO);
    setBackupInfoFetchError(false);
    hasUserEditedDirRef.current = false;
    // Init backupDir immediately from cached backupInfo so the field is never
    // blank when reopening the same DB. If no cache, stays '' until fetch returns.
    setFormData(prev => ({ ...prev, backupDir: deriveBackupDir(backupInfoRef.current?.dbdir) }));
    if (selectedDatabase && selectedHostUid) {
      dispatch(fetchBackupDbInfo({ hostUid: selectedHostUid, dbname: selectedDatabase }))
        .unwrap()
        .catch(() => setBackupInfoFetchError(true));
    }
  }, [isBackupDatabaseModalOpen, selectedDatabase, selectedHostUid, dispatch, resetAction]);

  if (!isBackupDatabaseModalOpen) return null;

  const handleInputChange = (field, value) => {
    if (field === 'backupDir') hasUserEditedDirRef.current = true;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleLevelChange = (level) => {
    setFormData(prev => ({ ...prev, backupLevel: level }));
  };

  const handleBackup = async () => {
    if (!formData.backupDir) {
      endError(CM.backupDirRequiredMsg);
      return;
    }

    startAction();
    const invocationToken = {};
    latestBackupTokenRef.current = invocationToken;
    const progressOpts = { onProgress: (j) => setJobStatus(j.jobStatus ?? j.status) };
    try {
      const payload = {
        level: formData.backupLevel,
        backupdir: formData.backupDir,
        removelog: formData.deleteUnnecessary ? 'y' : 'n',
        check: formData.checkConsistency ? 'y' : 'n',
        mt: formData.parallelBackup,
        zip: formData.compress ? 'y' : 'n',
        safereplication: 'n'
      };

      // Reuse an accepted job only when host, db, AND full payload all match.
      // Any change (different host, path, level, or flags) means a new backup is needed.
      const exactMatch =
        pendingBackupJob?.hostUid === selectedHostUid &&
        pendingBackupJob?.dbname === selectedDatabase &&
        JSON.stringify(pendingBackupJob?.payload) === JSON.stringify(payload);

      let jobId;
      if (exactMatch) {
        jobId = pendingBackupJob.jobId;
      } else {
        const created = await databaseJobApi.submitBackup(selectedHostUid, selectedDatabase, payload);
        jobId = created?.jobId;
        if (!jobId) throw new Error('Backup could not be started. Please try again.');
        // Replace only after confirmed acceptance — preserves the previous pending job if submit fails
        dispatch(setPendingBackupJob({ jobId, hostUid: selectedHostUid, dbname: selectedDatabase, payload }));
      }

      await trackJob(jobId, progressOpts);
      if (latestBackupTokenRef.current !== invocationToken) return; // superseded by a newer backup request
      dispatch(clearPendingBackupJob());
      endSuccess(CM.databaseBackedUpMsg(selectedDatabase, formData.backupDir));
    } catch (err) {
      if (latestBackupTokenRef.current !== invocationToken) return; // superseded by a newer backup request
      if (!err?.cancelled) {
        // Terminal job failure on the server — clear pending so retry submits a new backup.
        // Transient polling failures keep pendingBackupJob to allow reconnect on retry.
        if (err?.jobTerminalFailure) dispatch(clearPendingBackupJob());
        endError(typeof err === 'string' ? err : err.message || CM.failure);
      }
    }
  };

  // Don't clear pendingBackupJob on close — the open effect reconnects on reopen
  const handleClose = () => dispatch(closeBackupDatabaseModal());

  const flags = [
    { field: 'checkConsistency', label: CM.checkDatabaseConsistency },
    { field: 'deleteUnnecessary', label: CM.deleteArchivedLogs },
    { field: 'compress', label: CM.compressBackupVolume },
  ];

  const backupInfoContent = (
    <CaDialogFieldGrid>
      <CaDialogField label={CM.backupDatabaseNameLabel}>
        <Input
          value={selectedDatabase || ''}
          disabled
          icon="database"
        />
      </CaDialogField>

      <CaDialogField label={CM.backupLevel}>
        <Select
          testId="backup-database-level-select"
          value={formData.backupLevel}
          onChange={(e) => handleLevelChange(e.target.value)}
          options={backupLevelOptions}
        />
      </CaDialogField>

      <CaDialogField label={CM.backupDirectory}>
        <Input
          data-testid="backup-database-dir-input"
          value={formData.backupDir}
          onChange={(e) => handleInputChange('backupDir', e.target.value)}
        />
      </CaDialogField>

      {backupInfoFetchError && !formData.backupDir && (
        <CaDialogField fullWidth>
          <InfoBanner variant="warning" title={CM.warning} icon="warning">
            {CM.backupDirFetchError}
          </InfoBanner>
        </CaDialogField>
      )}

      {existingBackupAtLevel && (
        <CaDialogField fullWidth>
          <InfoBanner variant="danger" title={CM.warning} icon="warning">
            {CM.existingBackupWarningMsg(formData.backupLevel)}
          </InfoBanner>
        </CaDialogField>
      )}

      <CaDialogField label={CM.parallelThreads}>
        <Input
          type="number"
          value={formData.parallelBackup}
          onChange={(e) => handleInputChange('parallelBackup', e.target.value)}
        />
      </CaDialogField>

      <CaDialogField fullWidth>
        <div className="space-y-2 pt-1">
          {flags.map((opt) => (
            <Checkbox
              key={opt.field}
              checked={formData[opt.field]}
              onChange={(e) => handleInputChange(opt.field, e.target.checked)}
              label={opt.label}
            />
          ))}
        </div>
      </CaDialogField>
    </CaDialogFieldGrid>
  );

  const backupHistoryContent = (
    <div className="space-y-3">
      <Typography variant="p" className="text-14 text-slate-600 dark:text-slate-400">
        {CM.backupHistoryListHint}
      </Typography>
      <CaDialogTable
        columns={backupHistoryColumns}
        data={backupHistory}
        emptyMessage={CM.noBackupRecords}
      />
    </div>
  );

  const tabs = [
    { id: TAB_INFO, label: CM.backupInformation, content: backupInfoContent },
    { id: TAB_HISTORY, label: CM.backupHistoryInformation, content: backupHistoryContent },
  ];

  if (isLoading) {
    return (
      <Modal isOpen title={CM.backupDatabase} icon="backup" onClose={handleClose} maxWidth="720px">
        <ModalStatusLoading
          title={CM.snapshotInProgress}
          subtitle={getCmsJobLoadingSubtitle(selectedDatabase, jobStatus, CM)}
          onBackground={handleClose}
        />
      </Modal>
    );
  }

  if (isSuccess) {
    return (
      <Modal isOpen title={CM.backupCompleted} icon="backup" iconVariant="success" onClose={handleClose} maxWidth="720px">
        <ModalStatusSuccess 
          title={CM.snapshotSecured}
          message={`A complete backup of ${selectedDatabase} has been written to: ${formData.backupDir}.`}
          onConfirm={handleClose}
          confirmText={CM.ok}
        />
      </Modal>
    );
  }

  if (isError) {
    return (
      <Modal isOpen title={CM.backupFailed} icon="backup" iconVariant="danger" onClose={resetAction} maxWidth="720px">
        <ModalStatusError
          title={CM.operationInterrupted}
          error={error}
          guidance={CM.backupDbGuidance}
          onRetry={handleBackup}
          onCancel={resetAction}
          retryText={CM.retryBackup}
          cancelText={CM.dismiss}
        />
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isBackupDatabaseModalOpen}
      onClose={handleClose}
      title={CM.backupDatabase}
      icon="backup"
      maxWidth="720px"
      testId="backup-database"
      onSubmit={handleBackup}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="backup-database-cancel-btn" variant="secondary" onClick={handleClose}>{CM.cancel}</Button>
          <Button data-testid="backup-database-run-btn" variant="primary" onClick={handleBackup} icon="play_circle" className="min-w-[140px]">
            {CM.ok}
          </Button>
        </div>
      }
    >
      <CaDialogTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
    </Modal>
  );
}
