import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeRenameDatabaseModal, fetchDatabaseStartInfo } from '../databaseSlice';
import { databaseJobApi } from '../databaseJobApi';
import { useCmsJob } from '../../../infrastructure/hooks/useCmsJob';
import { getCmsJobLoadingSubtitle } from '../../../infrastructure/cmsJob/cmsJobUi';

import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Checkbox } from '../../../components/ds/forms/Checkbox';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import {
  ModalStatusLoading,
  ModalStatusSuccess,
  ModalStatusError
} from '../../../components/ds/feedback/ActionStatus';
import { useCM } from '../../../constants/useCM';

const getPathSeparator = (path) => {
  if (path && path.includes('\\')) return '\\';
  return '/';
};

const getParentDirectory = (path) => {
  if (!path) return '';
  const separator = getPathSeparator(path);
  const parts = path.split(separator);
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join(separator);
};

const validateDbName = (name) => {
  if (!name) return false;
  if (name.includes(' ')) return false;
  if (name.startsWith('#') || name.startsWith('-')) return false;
  if (name === '.' || name === '..') return false;
  if (name.length > 17) return false;
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name);
};

export default function RenameDatabaseModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isRenameDatabaseModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase, databases } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);
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

  const [newDbName, setNewDbName] = useState('');
  const [forcedel, setForcedel] = useState(false);
  // Snapshot of the name being renamed, for the success screen. Redux's
  // selectedDatabase can't be used there — a successful rename dispatches
  // fetchDatabaseStartInfo, which nulls selectedDatabase out once the old
  // name no longer matches any database (see databaseCoreSlice's
  // parseDbResponse), so by the time the success view renders it's gone.
  const [renamedFromDb, setRenamedFromDb] = useState('');

  useEffect(() => {
    if (isRenameDatabaseModalOpen) {
      setNewDbName('');
      setForcedel(false);
      setRenamedFromDb('');
      resetAction();
    }
    // Only (re)initialize when the modal opens — NOT whenever selectedDatabase
    // changes while it's already open. A successful rename dispatches
    // fetchDatabaseStartInfo, which clears state.database.selectedDatabase to
    // null once the old name no longer matches any database (see
    // databaseCoreSlice's parseDbResponse). That change used to re-trigger
    // this effect mid-flow, call resetAction(), and bounce the modal off its
    // success screen back onto a blank form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRenameDatabaseModalOpen]);

  if (!isRenameDatabaseModalOpen) return null;

  const handleRename = async () => {
    if (!selectedHostUid || !selectedDatabase || !isFormValid) return;
    startAction();
    try {
      const payload = {
        rename: newDbName.trim(),
        exvolpath: getParentDirectory(currentDb?.dbdir || '').trim(),
        advanced: 'off',
        forcedel: forcedel ? 'y' : 'n',
      };
      await runJob(
        () => databaseJobApi.submitRename(selectedHostUid, selectedDatabase, payload),
        { onProgress: (j) => setJobStatus(j.jobStatus ?? j.status) }
      );
      // This job may have been backgrounded (and the modal reopened for a
      // different database) by the time it settles — its outcome then
      // belongs to the global job tray, not this now-reused modal instance.
      if (!wasBackgrounded()) {
        setRenamedFromDb(selectedDatabase);
        dispatch(fetchDatabaseStartInfo(selectedHostUid));
        endSuccess(CM.databaseRenamedMsg(selectedDatabase, newDbName.trim()));
      }
    } catch (err) {
      if (!wasBackgrounded()) {
        endError(
          typeof err === 'string' ? err
            : err?.message || err?.note || CM.renameFailedMsg
        );
      }
    }
  };

  const handleClose = () => {
    dispatch(closeRenameDatabaseModal());
    resetAction();
  };

  const isNameValid = validateDbName(newDbName);
  const isNameChanged = newDbName.trim() !== selectedDatabase;

  const isFormValid = isNameValid && isNameChanged;

  /* ─── LOADING view ─── */
  if (isLoading) {
    return (
      <Modal isOpen title={CM.renamingDatabase} icon="drive_file_rename_outline" onClose={handleClose} maxWidth="640px">
        <ModalStatusLoading
          title={CM.updatingIdentity}
          subtitle={getCmsJobLoadingSubtitle(selectedDatabase, jobStatus, CM)}
          onBackground={() => { background(); handleClose(); }}
        />
      </Modal>
    );
  }

  /* ─── SUCCESS view ─── */
  if (isSuccess) {
    return (
      <Modal isOpen title={CM.renameComplete} icon="drive_file_rename_outline" iconVariant="success" onClose={handleClose} maxWidth="640px">
        <ModalStatusSuccess
          title={CM.renameSuccessful}
          message={CM.databaseRenamedMsg(renamedFromDb, newDbName.trim())}
          onConfirm={handleClose}
          confirmText={CM.ok}
        />
      </Modal>
    );
  }

  /* ─── ERROR view ─── */
  if (isError) {
    return (
      <Modal isOpen title={CM.renameFailed} icon="drive_file_rename_outline" iconVariant="danger" onClose={handleClose} maxWidth="640px">
        <ModalStatusError
          title={CM.operationFailed}
          error={error}
          guidance={CM.renameDbGuidance}
          onRetry={handleRename}
          onCancel={handleClose}
          retryText={CM.retryRename}
          cancelText={CM.dismiss}
        />
      </Modal>
    );
  }

  /* ─── FORM view ─── */
  return (
    <Modal
      isOpen={isRenameDatabaseModalOpen}
      onClose={handleClose}
      title={CM.renameDatabase}
      icon="drive_file_rename_outline"
      maxWidth="560px"
      testId="rename-database"
      onSubmit={handleRename}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="rename-database-cancel-btn" variant="secondary" onClick={handleClose}>{CM.cancel}</Button>
          <Button
            data-testid="rename-database-execute-btn"
            variant="primary"
            onClick={handleRename}
            icon="drive_file_rename_outline"
            disabled={!isFormValid}
            className="min-w-[140px]"
          >
            {CM.executeRename}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-15 py-2">

        {/* Downtime Warning */}
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-14 text-amber-700 dark:text-amber-400">
          <span className="material-symbols-outlined text-18 shrink-0 mt-0.5">warning</span>
          <span>{CM.renameDowntimeHint}</span>
        </div>

        {/* New Database Name Row */}
        <div className="grid grid-cols-[170px_1fr] items-center gap-4">
          <label className="font-medium text-slate-700 dark:text-slate-200">
            {CM.newDatabaseName || 'New database name:'}
          </label>
          <Input
            data-testid="rename-database-new-name-input"
            value={newDbName}
            onChange={(e) => setNewDbName(e.target.value)}
            placeholder={`${selectedDatabase}_v2`}
            className="w-full"
            autoFocus
            error={newDbName && !validateDbName(newDbName) ? "Name must be 1-17 alphanumeric, underscore or hyphen characters" : undefined}
          />
        </div>

        {/* Force Delete Checkbox */}
        <div className="pt-2 flex flex-col gap-2">
          <Checkbox
            label={CM.forceDeleteBackupVolume}
            description={CM.forceDeleteBackupVolumeDesc}
            checked={forcedel}
            onChange={(e) => setForcedel(e.target.checked)}
          />
          {forcedel && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-14 text-rose-700 dark:text-rose-400">
              <span className="material-symbols-outlined text-18 shrink-0 mt-0.5">delete_forever</span>
              <span>{CM.forceDeleteBackupVolumeWarning}</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
