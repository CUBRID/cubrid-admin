import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeCopyDatabaseModal, fetchDatabaseStartInfo } from '../databaseSlice';
import { databaseJobApi } from '../databaseJobApi';
import { databaseApi } from '../databaseApi';
import { useCmsJob } from '../../../infrastructure/hooks/useCmsJob';
import { getCmsJobLoadingSubtitle } from '../../../infrastructure/cmsJob/cmsJobUi';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
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

  useEffect(() => {
    let cancelled = false;
    if (isCopyDatabaseModalOpen) {
      resetAction();
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
            const freeMB = res?.freespace != null ? `${res.freespace} (MB)` : '-';
            const sizeMB = res?.dbsize != null ? `${Math.round(res.dbsize / (1024 * 1024))} (MB)` : '-';
            setDiskInfo({ freeSpace: freeMB, dbSize: sizeMB });

            const validTypes = ['generic', 'data', 'index', 'temp', 'permanent'];
            const logVol = (res?.spaceinfo || []).find(s => s?.type?.toLowerCase() === 'active_log');
            if (logVol?.location) {
              setSrcLogDir(logVol.location);
            }

            const filteredSpaces = (res?.spaceinfo || []).filter(space =>
              space.type && validTypes.includes(space.type.toLowerCase())
            ).map(space => ({
              spacename: space.spacename,
              type: space.type,
              location: space.location,
              newVolumeName: space.spacename,
              newLocation: space.location || defaultPath,
              isNameEdited: false,
              isLocationEdited: false,
            }));
            setVolumes(filteredSpaces);
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
    const targetPath = parentDir ? `${parentDir}${separator}${formData.destName}` : (currentDb?.dbdir || '');

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

    setVolumes(prev => prev.map((vol, idx) => {
      let newName = vol.newVolumeName;
      if (!vol.isNameEdited) {
        if (idx === 0) {
          newName = formData.destName;
        } else {
          const numStr = String(idx).padStart(3, '0');
          newName = `${formData.destName}_x${numStr}`;
        }
      }

      const newLoc = !vol.isLocationEdited && targetPath ? targetPath : vol.newLocation;
      if (newName === vol.newVolumeName && newLoc === vol.newLocation) {
        return vol;
      }

      return {
        ...vol,
        newVolumeName: newName,
        newLocation: newLoc,
      };
    }));
  }, [formData.destName, selectedDatabase, currentDb?.dbdir, manuallyEditedPaths]);

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

  const handleCopy = async () => {
    if (!formData.destName.trim()) return;

    startAction();

    let advanced = 'off';
    let volumeList;

    if (formData.copyIndividual) {
      advanced = 'on';
      const volumeMap = {};
      volumes.forEach((vol) => {
        const separator = getPathSeparator(vol.location || formData.destPath || '/');
        const oldLoc = vol.location || '';
        const oldPath = oldLoc
          ? (oldLoc.endsWith('/') || oldLoc.endsWith('\\') ? `${oldLoc}${vol.spacename}` : `${oldLoc}${separator}${vol.spacename}`)
          : vol.spacename;
        const newLoc = vol.newLocation || formData.destPath;
        const newVolName = vol.newVolumeName || vol.spacename;
        const newPath = newLoc
          ? (newLoc.endsWith('/') || newLoc.endsWith('\\') ? `${newLoc}${newVolName}` : `${newLoc}${separator}${newVolName}`)
          : newVolName;
        volumeMap[oldPath] = newPath;
      });
      if (Object.keys(volumeMap).length > 0) {
        volumeList = [volumeMap];
      }
    }

    const payload = {
      srcdbname: selectedDatabase,
      destdbname: formData.destName.trim(),
      destdbpath: formData.destPath,
      exvolpath: formData.extPath,
      logpath: formData.logPath,
      overwrite: formData.replaceExisting ? 'y' : 'n',
      move: formData.deleteSource ? 'y' : 'n',
      advanced,
      ...(volumeList && { volume: volumeList }),
    };

    try {
      await runJob(
        () => databaseJobApi.submitCopy(selectedHostUid, payload),
        { onProgress: (j) => setJobStatus(j.jobStatus ?? j.status) }
      );
      if (!wasBackgrounded()) {
        dispatch(fetchDatabaseStartInfo(selectedHostUid));
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
        />
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
      title={CM.copyDatabase || 'Copy Database'}
      subtitle={CM.msgCopyDbDialog || 'Please enter the database information.'}
      icon="content_copy"
      maxWidth="820px"
      testId="copy-database"
      onSubmit={handleCopy}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="copy-database-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          <Button 
            data-testid="copy-database-execute-btn"
            variant="primary" 
            onClick={handleCopy} 
            icon="content_copy"
            className="min-w-[140px]"
            disabled={!formData.destName.trim()}
          >
            {CM.ok}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Source Database Group */}
        <div>
          <SectionHeader title={CM.grpDbSourceName || 'Source database'} icon="database" />
          <div className="bg-slate-50 dark:bg-white/4 border border-slate-200 dark:border-white/8 rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-3 gap-3 items-center">
              <label className="text-14 font-medium text-slate-600 dark:text-slate-400">
                {CM.lblSrcDbName || 'Database name:'}
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
                {CM.lblSrcDbPathName || 'Database path:'}
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
                {CM.lblSrcLogPathName || 'Log file path:'}
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
          <SectionHeader title={CM.grpDbDestName || 'Destination database'} icon="move_to_inbox" />
          <div className="bg-white dark:bg-white/2 border border-slate-200 dark:border-white/8 rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-3 gap-3 items-center">
              <label className="text-14 font-medium text-slate-600 dark:text-slate-400">
                {CM.lblDescDbName || 'Database name:'}
              </label>
              <div className="col-span-2">
                <Input
                  data-testid="copy-database-dest-name-input"
                  value={formData.destName}
                  onChange={e => handleInputChange('destName', e.target.value)}
                  placeholder="e.g. demodb_copy"
                  autoFocus
                  size="md"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 items-center">
              <label className="text-14 font-medium text-slate-600 dark:text-slate-400">
                {CM.lblDescDbPathName || 'Database path:'}
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
                {CM.lblVolumePathName || 'Extend volume path:'}
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
                {CM.lblDescLogPathName || 'Log file path:'}
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
              label={CM.btnCopyVolume || 'Copy individual volumes'}
              checked={formData.copyIndividual}
              onChange={e => handleInputChange('copyIndividual', e.target.checked)}
              disabled={!formData.destName.trim()}
            />
          </div>

          <div className={`border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden mt-2 bg-white dark:bg-white/2 transition-all ${
            !formData.copyIndividual ? 'opacity-50 pointer-events-none select-none bg-slate-50/50 dark:bg-white/[0.01]' : ''
          }`}>
            {volInfoLoading ? (
              <div className="p-4 text-center text-slate-400 text-14">Loading volumes...</div>
            ) : volumes.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-14">No volume information available</div>
            ) : (
              <div className="max-h-[180px] overflow-y-auto">
                <table className="w-full text-13 text-left">
                  <thead className="bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 uppercase sticky top-0 border-b border-slate-200 dark:border-white/10">
                    <tr>
                      <th className="px-3 py-2 font-semibold w-2/5">{CM.tblColumnCurrentVolName || 'Current volume name'}</th>
                      <th className="px-3 py-2 font-semibold w-3/10">{CM.tblColumnCopyNewVolName || 'New volume name'}</th>
                      <th className="px-3 py-2 font-semibold w-3/10">{CM.tblColumnCopyNewDirPath || 'New directory path'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {volumes.map((vol, idx) => {
                      const fullVolPath = vol.location 
                        ? `${vol.location.endsWith('/') || vol.location.endsWith('\\') ? vol.location : vol.location + '/'}${vol.spacename}`
                        : vol.spacename;
                      return (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-white/4">
                          <td className="px-3 py-1.5 font-medium font-mono text-13 text-slate-700 dark:text-slate-300 truncate max-w-[200px]" title={fullVolPath}>
                            {fullVolPath}
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              disabled={!formData.copyIndividual}
                              value={vol.newVolumeName}
                              onChange={e => handleVolumeChange(idx, 'newVolumeName', e.target.value)}
                              className="w-full h-8 px-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-14 font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500 disabled:bg-slate-100 dark:disabled:bg-white/2"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              disabled={!formData.copyIndividual}
                              value={vol.newLocation}
                              onChange={e => handleVolumeChange(idx, 'newLocation', e.target.value)}
                              className="w-full h-8 px-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg font-mono text-14 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500 disabled:bg-slate-100 dark:disabled:bg-white/2"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Options */}
        <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-white/5">
          <Checkbox
            label={CM.btnReplaceDb || 'Replace an existing database'}
            checked={formData.replaceExisting}
            onChange={e => handleInputChange('replaceExisting', e.target.checked)}
          />
          <Checkbox
            label={CM.btnDeleteSrcDb || 'Delete a source database'}
            checked={formData.deleteSource}
            onChange={e => handleInputChange('deleteSource', e.target.checked)}
          />
        </div>
      </div>
    </Modal>
  );
}
