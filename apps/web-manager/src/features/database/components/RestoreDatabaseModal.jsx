import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeRestoreDatabaseModal, fetchBackupList } from '../databaseSlice';
import { dbKey } from '../dbKey';
import { databaseJobApi } from '../databaseJobApi';
import { useCmsJob } from '../../../infrastructure/hooks/useCmsJob';
import { getCmsJobLoadingSubtitle } from '../../../infrastructure/cmsJob/cmsJobUi';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Toggle } from '../../../components/ds/forms/Toggle';
import { Checkbox } from '../../../components/ds/forms/Checkbox';
import { Radio } from '../../../components/ds/forms/Radio';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Spinner } from '../../../components/ds/foundation/Spinner';
import { EmptyState } from '../../../components/ds/feedback/EmptyState';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import { 
  ModalStatusLoading, 
  ModalStatusSuccess, 
  ModalStatusError 
} from '../../../components/ds/feedback/ActionStatus';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { useCM } from '../../../constants/useCM';
import {
  CaDialogField,
  CaDialogFieldGrid,
  CaDialogGroup,
} from '../../../components/ds/layout/CaDialogLayout';
import { DatePicker } from '../../../components/ds/forms/DatePicker';
import { TimePicker } from '../../../components/ds/forms/TimePicker';

// view states
const VIEW_FORM    = 'form';
const VIEW_LOADING = 'loading';
const VIEW_SUCCESS = 'success';
const VIEW_ERROR   = 'error';

/* ── meta config ─────────────────────────────────────────────── */
const LEVEL_META = {
  0: {
    label: 'L0', titleKey: 'backupLevelFullTitle', descKey: 'backupLevelFullLongDesc',
    icon: 'database', iconColor: 'text-blue-500',
    ring: 'border-blue-500/25 bg-blue-500/8 dark:bg-blue-500/10',
    ringSelected: 'bg-blue-500 text-white border-blue-400 shadow-blue-500/20',
    badge: 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  1: {
    label: 'L1', titleKey: 'backupLevelIncrL1Title', descKey: 'backupLevelIncrL1LongDesc',
    icon: 'trending_up', iconColor: 'text-violet-500',
    ring: 'border-violet-500/25 bg-violet-500/8 dark:bg-violet-500/10',
    ringSelected: 'bg-violet-500 text-white border-violet-400 shadow-violet-500/20',
    badge: 'bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-400',
    dot: 'bg-violet-500',
  },
  2: {
    label: 'L2', titleKey: 'backupLevelIncrL2Title', descKey: 'backupLevelIncrL2LongDesc',
    icon: 'call_split', iconColor: 'text-cyan-500',
    ring: 'border-cyan-500/25 bg-cyan-500/8 dark:bg-cyan-500/10',
    ringSelected: 'bg-cyan-500 text-white border-cyan-400 shadow-cyan-500/20',
    badge: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-600 dark:text-cyan-400',
    dot: 'bg-cyan-500',
  },
};

/* ── date helpers ────────────────────────────────────────────── */
// Handles multiple CMS date formats (best-effort; no timezone conversion):
//   "dd-mm-yyyy:HH:MM:SS"   — restoredb date param
//   "yyyy.MM.dd.HH.mm"      — getbackuplist date field (no seconds)
//   "yyyy.MM.dd.HH.mm.ss"   — getbackuplist date field (with seconds)
const parseCmsDate = (cmsDate) => {
  if (!cmsDate) return null;

  let m = cmsDate.match(/^(\d{2})-(\d{2})-(\d{4}):(\d{2}):(\d{2}):(\d{2})$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`);

  m = cmsDate.match(/^(\d{4})\.(\d{2})\.(\d{2})\.(\d{2})\.(\d{2})(?:\.(\d{2}))?$/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}`);

  return null;
};

// "dd-mm-yyyy:HH:MM:SS" → "yyyy-MM-ddTHH:mm" (datetime-local min value)
const toDatetimeLocal = (cmsDate) => {
  const d = parseCmsDate(cmsDate);
  if (!d || isNaN(d.getTime())) return undefined;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// datetime-local "yyyy-MM-ddTHH:mm" → CMS "dd-mm-yyyy:HH:mm:ss"
const formatCmsDate = (datetimeLocal) => {
  const [datePart, timePart] = datetimeLocal.split('T');
  const [year, month, day] = datePart.split('-');
  return `${day}-${month}-${year}:${timePart}:00`;
};

// restoredb's -B/pathname expects a DIRECTORY of backup volumes, not a file —
// getbackuplist reports the backup FILE path, so this strips the filename.
const dirnameOf = (filePath) => {
  if (!filePath) return '';
  const normalized = filePath.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : '';
};

/* ── helpers ─────────────────────────────────────────────────── */
const SectionLabel = ({ children, count }) => (
  <div className="flex items-center gap-3 mb-3">
    <span className="text-11 font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 whitespace-nowrap">{children}</span>
    {count !== undefined && (
      <span className="text-11 font-black px-1.5 py-0.5 rounded-xs bg-amber-500/10 border border-amber-500/20 text-amber-500">{count}</span>
    )}
    <div className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
  </div>
);

/* ── main component ─────────────────────────────────────────── */
export default function RestoreDatabaseModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isRestoreDatabaseModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase, databases } = useSelector((state) => state.database, shallowEqual);
  const currentDb = databases?.find((db) => db.dbname === selectedDatabase);
  const {
    databaseBackups,
    databaseBackupsLoading,
  } = useSelector((state) => state.databaseOperation);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);

  const {
    state,
    error: actionError,
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
    selectedBackup: null,
    recoveryPath: '',
    isPartial: false,
    usePointInTime: false,
    restoreDate: '',
    restoreDateOnly: '',
    restoreTimeOnly: '00:00',
    selectRecoveryDateTime: true,
    recoveryTimeType: 'backupTime',
    selectBackupFilePath: false,
    manualBackupLevel: '0',
    manualLevel0Path: '',
    manualLevel1Path: '',
    manualLevel2Path: '',
    changeRestorePath: false
  });
  const [filter, setFilter] = useState('all'); // 'all' | 0 | 1 | 2

  const parseBackupString = (str, level) => {
    if (!str || str === 'none' || typeof str !== 'string') return [];
    return str.split('|').filter(Boolean).map(item => {
      if (item.includes(';')) {
        const [date, pathname, recoverypath] = item.split(';');
        return { date: date || '', pathname: pathname || '', recoverypath: recoverypath || '', level };
      }
      return { date: '', pathname: item, recoverypath: '', level };
    });
  };

  const backupData = databaseBackups[dbKey(selectedHostUid, selectedDatabase)] || {};
  const allBackups = useMemo(() => {
    return [
      ...(Array.isArray(backupData.level0) ? backupData.level0.map(b => ({ ...b, level: 0 })) : parseBackupString(backupData.level0, 0)),
      ...(Array.isArray(backupData.level1) ? backupData.level1.map(b => ({ ...b, level: 1 })) : parseBackupString(backupData.level1, 1)),
      ...(Array.isArray(backupData.level2) ? backupData.level2.map(b => ({ ...b, level: 2 })) : parseBackupString(backupData.level2, 2)),
    ].filter(b => b.pathname).sort((a, b) => {
      const tA = parseCmsDate(a.date)?.getTime() ?? 0;
      const tB = parseCmsDate(b.date)?.getTime() ?? 0;
      return tB - tA;
    });
  }, [backupData]);


  const backups = filter === 'all' ? allBackups : allBackups.filter(b => b.level === filter);
  const isLoadingBackups = databaseBackupsLoading[dbKey(selectedHostUid, selectedDatabase)];

  useEffect(() => {
    if (isRestoreDatabaseModalOpen && selectedHostUid && selectedDatabase) {
      const now = new Date();
      const localYear = now.getFullYear();
      const localMonth = String(now.getMonth() + 1).padStart(2, '0');
      const localDay = String(now.getDate()).padStart(2, '0');
      const localHours = String(now.getHours()).padStart(2, '0');
      const localMinutes = String(now.getMinutes()).padStart(2, '0');

      const currentDateOnly = `${localYear}-${localMonth}-${localDay}`;
      const currentTimeOnly = `${localHours}:${localMinutes}`;

      setFormData({
        selectedBackup: null,
        recoveryPath: '',
        isPartial: false,
        usePointInTime: false,
        restoreDate: '',
        restoreDateOnly: currentDateOnly,
        restoreTimeOnly: currentTimeOnly,
        selectRecoveryDateTime: true,
        recoveryTimeType: 'backupTime',
        selectBackupFilePath: false,
        manualBackupLevel: '0',
        manualLevel0Path: '',
        manualLevel1Path: '',
        manualLevel2Path: '',
        changeRestorePath: false
      });
      setFilter('all');
      resetAction();
      dispatch(fetchBackupList({ hostUid: selectedHostUid, dbname: selectedDatabase }));
    }
  }, [isRestoreDatabaseModalOpen, selectedHostUid, selectedDatabase, dispatch, resetAction]);
  // Auto-populate manual path inputs from the catalog. restoredb's -B takes a
  // directory (not the backup file itself), so store the containing folder.
  useEffect(() => {
    if (allBackups && allBackups.length > 0) {
      const b0 = allBackups.find(b => b.level === 0);
      const b1 = allBackups.find(b => b.level === 1);
      const b2 = allBackups.find(b => b.level === 2);

      setFormData(prev => {
        const updates = {};
        if (b0 && !prev.manualLevel0Path) {
          updates.manualLevel0Path = dirnameOf(b0.pathname);
        }
        if (b1 && !prev.manualLevel1Path) {
          updates.manualLevel1Path = dirnameOf(b1.pathname);
        }
        if (b2 && !prev.manualLevel2Path) {
          updates.manualLevel2Path = dirnameOf(b2.pathname);
        }

        if (Object.keys(updates).length > 0) {
          return { ...prev, ...updates };
        }
        return prev;
      });
    }
  }, [allBackups]);

  // A restore above level 0 needs every lower level's volumes reachable from the
  // SAME -B directory (restoredb only accepts one). CUBRID's own default backup
  // layout puts each level in its own {dbname}_backup_lv{N} folder, so warn when
  // the selected level's folder differs from the level(s) it depends on.
  const scatteredLevelsWarning = useMemo(() => {
    if (!formData.selectBackupFilePath) return null;
    const level = formData.manualBackupLevel;
    if (level === '0') return null;

    const activePath = level === '1' ? formData.manualLevel1Path : formData.manualLevel2Path;
    const dependencyPaths = level === '1'
      ? [formData.manualLevel0Path]
      : [formData.manualLevel0Path, formData.manualLevel1Path];

    const mismatched = dependencyPaths.some((p) => p && activePath && p !== activePath);
    return mismatched ? CM.scatteredBackupLevelsWarning : null;
  }, [formData.selectBackupFilePath, formData.manualBackupLevel, formData.manualLevel0Path, formData.manualLevel1Path, formData.manualLevel2Path, CM]);

  const validationError = useMemo(() => {
    // 1. Date & Time validation (only if selectRecoveryDateTime is checked and specify restore date is active)
    if (formData.selectRecoveryDateTime && formData.recoveryTimeType === 'specificTime') {
      if (!formData.restoreDateOnly || !formData.restoreTimeOnly) {
        return CM.restoreDateRequired;
      }
      const parts = formData.restoreDateOnly.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (isNaN(year) || year < 1 || year > new Date().getFullYear()) {
        return CM.errYear || 'The year value of date is not valid.';
      }
      if (isNaN(month) || month < 1 || month > 12) {
        return CM.errMonth || 'The month value of date is not valid.';
      }
      if (isNaN(day) || day < 1 || day > 31) {
        return CM.errDay || 'The day value of date is not valid.';
      }

      // Calendar check for leap years and month lengths
      const testDate = new Date(year, month - 1, day);
      if (testDate.getFullYear() !== year || (testDate.getMonth() + 1) !== month || testDate.getDate() !== day) {
        return CM.errDay || 'The day value of date is not valid.';
      }

      // Check if restore date is before the backup date
      let backupDate = null;
      if (formData.selectBackupFilePath) {
        const activeLevel = formData.manualBackupLevel;
        const activePath = activeLevel === '0' ? formData.manualLevel0Path :
                           activeLevel === '1' ? formData.manualLevel1Path :
                           formData.manualLevel2Path;
        const matchingBackup = allBackups.find(b => {
          if (!b.pathname || !activePath) return false;
          const filePath = b.pathname.replace(/\\/g, '/').toLowerCase();
          const dirPath = activePath.replace(/\\/g, '/').toLowerCase();
          return filePath === dirPath || filePath.startsWith(dirPath + '/');
        });
        if (matchingBackup?.date) {
          backupDate = parseCmsDate(matchingBackup.date);
        } else {
          const latestL0 = allBackups.filter(b => b.level === 0).sort((a, b) => {
            const tA = parseCmsDate(a.date)?.getTime() ?? 0;
            const tB = parseCmsDate(b.date)?.getTime() ?? 0;
            return tB - tA;
          })[0];
          if (latestL0?.date) {
            backupDate = parseCmsDate(latestL0.date);
          }
        }
      } else {
        const latestL0 = allBackups.filter(b => b.level === 0).sort((a, b) => {
          const tA = parseCmsDate(a.date)?.getTime() ?? 0;
          const tB = parseCmsDate(b.date)?.getTime() ?? 0;
          return tB - tA;
        })[0];
        if (latestL0?.date) {
          backupDate = parseCmsDate(latestL0.date);
        }
      }
      const combinedDateTime = formData.restoreDateOnly + 'T' + formData.restoreTimeOnly;
      if (backupDate && new Date(combinedDateTime) < backupDate) {
        return CM.restoreDateBeforeBackup || 'Recovery date must be on or after the backup date.';
      }
    }

    // 2. Backup File Validation (only if selectBackupFilePath is checked)
    if (formData.selectBackupFilePath) {
      const levelVal = formData.manualBackupLevel;
      const path = levelVal === '0' ? formData.manualLevel0Path :
                   levelVal === '1' ? formData.manualLevel1Path :
                   formData.manualLevel2Path;
      if (!path) {
        if (levelVal === '0') return CM.errLevel0File || 'The level 0 file is not valid.';
        if (levelVal === '1') return CM.errLevel1File || 'The level 1 file is not valid.';
        return CM.errLevel2File || 'The level 2 file is not valid.';
      }
    }

    // 3. Recovery Path Validation (only if changeRestorePath is checked)
    if (formData.changeRestorePath) {
      if (!formData.recoveryPath) {
        return CM.errRecoveryPath || 'The user-defined recovery path is not valid.';
      }
    }

    return null;
  }, [formData, allBackups]);

  const isExecuteDisabled = !!validationError;

  if (!isRestoreDatabaseModalOpen) return null;

  const handleInputChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleRestorePathToggle = (checked) => {
    setFormData(prev => ({
      ...prev,
      changeRestorePath: checked,
      recoveryPath: checked ? (prev.recoveryPath || currentDb?.dbdir || allBackups.find(b => b.recoverypath)?.recoverypath || '') : ''
    }));
  };

  const handleBackupSelect = (backup) => {
    const isSel = formData.selectedBackup === backup.pathname;
    const nextBackup = isSel ? null : backup.pathname;
    
    let nextDate = '';
    let nextTime = '00:00';
    if (nextBackup && backup.date) {
      const dt = toDatetimeLocal(backup.date);
      if (dt) {
        const [dPart, tPart] = dt.split('T');
        nextDate = dPart;
        nextTime = tPart;
      }
    }
    
    setFormData(prev => ({
      ...prev,
      selectedBackup: nextBackup,
      restoreDateOnly: nextDate,
      restoreTimeOnly: nextTime
    }));
  };

  const handleRestore = async () => {
    let levelVal = '';
    let pathnameVal = '';
    let backupDate = null;

    if (formData.selectBackupFilePath) {
      levelVal = formData.manualBackupLevel;
      if (levelVal === '0') {
        pathnameVal = formData.manualLevel0Path;
      } else if (levelVal === '1') {
        pathnameVal = formData.manualLevel1Path;
      } else {
        pathnameVal = formData.manualLevel2Path;
      }

      if (!pathnameVal) {
        if (levelVal === '0') endError(CM.errLevel0File || 'The level 0 file is not valid.');
        else if (levelVal === '1') endError(CM.errLevel1File || 'The level 1 file is not valid.');
        else endError(CM.errLevel2File || 'The level 2 file is not valid.');
        return;
      }

      // Check backup date for point-in-time recovery verification
      const matchingBackup = allBackups.find(b => {
        if (!b.pathname || !pathnameVal) return false;
        const filePath = b.pathname.replace(/\\/g, '/').toLowerCase();
        const dirPath = pathnameVal.replace(/\\/g, '/').toLowerCase();
        return filePath === dirPath || filePath.startsWith(dirPath + '/');
      });
      if (matchingBackup?.date) {
        backupDate = parseCmsDate(matchingBackup.date);
      } else {
        const latestL0 = allBackups.filter(b => b.level === 0).sort((a, b) => {
          const tA = parseCmsDate(a.date)?.getTime() ?? 0;
          const tB = parseCmsDate(b.date)?.getTime() ?? 0;
          return tB - tA;
        })[0];
        if (latestL0?.date) {
          backupDate = parseCmsDate(latestL0.date);
        }
      }
    } else {
      // Default catalog restore (no selectedBackup, matches desktop when selectBackupButton is false)
      levelVal = '0';
      pathnameVal = 'none';

      const latestL0 = allBackups.filter(b => b.level === 0).sort((a, b) => {
        const tA = parseCmsDate(a.date)?.getTime() ?? 0;
        const tB = parseCmsDate(b.date)?.getTime() ?? 0;
        return tB - tA;
      })[0];
      if (latestL0?.date) {
        backupDate = parseCmsDate(latestL0.date);
      }
    }

    let dateParam = 'backuptime';
    if (formData.selectRecoveryDateTime) {
      if (formData.recoveryTimeType === 'specificTime') {
        if (!formData.restoreDateOnly || !formData.restoreTimeOnly) {
          endError(CM.restoreDateRequired);
          return;
        }
        
        const combinedDateTime = formData.restoreDateOnly + 'T' + formData.restoreTimeOnly;
        if (backupDate && new Date(combinedDateTime) < backupDate) {
          endError(CM.restoreDateBeforeBackup);
          return;
        }
        dateParam = formatCmsDate(combinedDateTime);
      }
    }

    if (formData.changeRestorePath && !formData.recoveryPath) {
      endError(CM.errRecoveryPath || 'The user-defined recovery path is not valid.');
      return;
    }
    const recoverypathParam = formData.changeRestorePath ? formData.recoveryPath : 'none';
    const partialParam = formData.isPartial ? 'y' : 'n';

    startAction();
    try {
      const payload = {
        date: dateParam,
        level: levelVal,
        partial: partialParam,
        pathname: pathnameVal,
        recoverypath: recoverypathParam,
      };
      await runJob(
        () => databaseJobApi.submitRestore(selectedHostUid, selectedDatabase, payload),
        { onProgress: (j) => setJobStatus(j.jobStatus ?? j.status) }
      );
      if (!wasBackgrounded()) endSuccess(selectedDatabase);
    } catch (error) {
      if (!wasBackgrounded()) endError(typeof error === 'string' ? error : (error.message || CM.restoreErrorFallback));
    }
  };

  const handleClose = () => dispatch(closeRestoreDatabaseModal());

  const levelCounts = { 0: allBackups.filter(b => b.level === 0).length, 1: allBackups.filter(b => b.level === 1).length, 2: allBackups.filter(b => b.level === 2).length };

  /* ─── LOADING view ─── */
  if (isLoading) {
    return (
      <Modal isOpen title={CM.restoringDatabase} icon="settings_backup_restore" onClose={handleClose} maxWidth="600px" iconVariant="danger">
        <ModalStatusLoading
          title={CM.reconstructingInstance}
          subtitle={getCmsJobLoadingSubtitle(selectedDatabase, jobStatus, CM)}
          variant="danger"
          onBackground={() => { background(); handleClose(); }}
        />
      </Modal>
    );
  }

  /* ─── SUCCESS view ─── */
  if (isSuccess) {
    return (
      <Modal isOpen title={CM.restoreSuccessful} icon="settings_backup_restore" iconVariant="success" onClose={handleClose} maxWidth="600px">
        <ModalStatusSuccess 
          title={CM.restoreCompleted}
          message={selectedDatabase}
          onConfirm={handleClose}
          confirmText={CM.close}
        />
      </Modal>
    );
  }

  /* ─── ERROR view ─── */
  if (isError) {
    return (
      <Modal isOpen title={CM.recoveryFailed} icon="restore" iconVariant="danger" onClose={resetAction} maxWidth="900px">
        <ModalStatusError
          title={CM.transactionDropped}
          error={actionError}
          guidance={CM.restoreDbGuidance}
          onRetry={handleRestore}
          onCancel={resetAction}
          retryText={CM.retryRecovery}
          cancelText={CM.dismiss}
        />
      </Modal>
    );
  }

  /* ─── FORM view ─── */
  return (
    <Modal
      isOpen={isRestoreDatabaseModalOpen}
      onClose={handleClose}
      title={CM.restoreDatabase}
      subtitle={CM.restoreSubtitle}
      icon="settings_backup_restore"
      maxWidth="680px"
      testId="restore-database"
      onSubmit={handleRestore}
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <div className="flex items-center gap-2 text-12 text-slate-400 font-medium">
            <Icon name="info" size="13px" weight={300} />
            <span>{CM.databaseMustBeStopped}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button data-testid="restore-database-cancel-btn" variant="secondary" onClick={handleClose}>{CM.cancel}</Button>
            <Button
              data-testid="restore-database-execute-btn"
              variant="primary"
              onClick={handleRestore}
              icon="settings_backup_restore"
              disabled={isExecuteDisabled}
              className="px-6 min-w-[150px]"
            >
              {CM.executeRestore}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 pb-2 text-left">
        {validationError && (
          <div className="mb-2 p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-13 rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
            <Icon name="error" size="15px" className="shrink-0" />
            <span className="font-medium">{validationError}</span>
          </div>
        )}

        {/* ── Database Name Group ── */}
        <CaDialogGroup title={CM.grpDbName || 'Database Name'}>
          <CaDialogFieldGrid labelWidth="130px" className="pt-2">
            <CaDialogField label={CM.lblDbNameRestore || 'Database name:'}>
              <Input
                value={selectedDatabase}
                disabled
                icon="database"
                className="flex-1"
                inputClassName="font-mono text-rose-700 dark:text-rose-400 bg-rose-500/5 dark:bg-rose-500/8 border-rose-500/20"
              />
            </CaDialogField>
          </CaDialogFieldGrid>
        </CaDialogGroup>

        {/* ── Date and Time Option Group ── */}
        <CaDialogGroup title={CM.grpRestoredData || 'Restored Data'}>
          <CaDialogFieldGrid labelWidth="130px" className="gap-y-4 pt-2">
            <CaDialogField fullWidth>
              <Checkbox
                label={CM.selectRestoreDateTime}
                checked={formData.selectRecoveryDateTime}
                onChange={(e) => handleInputChange('selectRecoveryDateTime', e.target.checked)}
              />
            </CaDialogField>

            {formData.selectRecoveryDateTime && (
              <CaDialogField fullWidth>
                <div className="pl-6 space-y-3 pt-2 border-t border-slate-200/50 dark:border-white/5 animate-in slide-in-from-top-1 duration-200">
                  <div className="flex gap-4">
                    <Radio
                      name="recoveryTimeType"
                      label={CM.backupTimeLabel}
                      value="backupTime"
                      checked={formData.recoveryTimeType === 'backupTime'}
                      onChange={(val) => handleInputChange('recoveryTimeType', val)}
                    />
                    <Radio
                      name="recoveryTimeType"
                      label={CM.specifyRestoreDate}
                      value="specificTime"
                      checked={formData.recoveryTimeType === 'specificTime'}
                      onChange={(val) => handleInputChange('recoveryTimeType', val)}
                    />
                  </div>
                  {formData.recoveryTimeType === 'specificTime' && (
                    <div className="space-y-3 animate-in slide-in-from-top-1 duration-200">
                      <div className="flex gap-4 max-w-md">
                        <DatePicker
                          label={CM.lblDate || 'Date:'}
                          value={formData.restoreDateOnly}
                          onChange={(e) => handleInputChange('restoreDateOnly', e.target.value)}
                          className="flex-1"
                        />
                        <TimePicker
                          label={CM.lblTime || 'Time:'}
                          value={formData.restoreTimeOnly}
                          onChange={(e) => handleInputChange('restoreTimeOnly', e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </CaDialogField>
            )}

            <CaDialogField fullWidth>
              <Checkbox
                label={CM.selectBackupInfoLabel}
                checked={formData.selectBackupFilePath}
                onChange={(e) => handleInputChange('selectBackupFilePath', e.target.checked)}
              />
            </CaDialogField>
            
            <CaDialogField fullWidth>
              <div className="pl-6 space-y-3 pt-2 border-t border-slate-200/50 dark:border-white/5 animate-in slide-in-from-top-1 duration-200">
                <div className="flex gap-4 mb-2">
                  {['0', '1', '2'].map((lvl) => (
                    <Radio
                      key={lvl}
                      name="manualBackupLevel"
                      label={`L${lvl}`}
                      value={lvl}
                      checked={formData.manualBackupLevel === lvl}
                      onChange={(val) => handleInputChange('manualBackupLevel', val)}
                      disabled={!formData.selectBackupFilePath}
                    />
                  ))}
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-[110px_1fr] items-center gap-3">
                    <Typography variant="label" className={`text-14 ${formData.selectBackupFilePath ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'}`}>
                      {CM.level0FileLabel}
                    </Typography>
                    <Input
                      value={formData.manualLevel0Path}
                      onChange={(e) => handleInputChange('manualLevel0Path', e.target.value)}
                      disabled={!formData.selectBackupFilePath || formData.manualBackupLevel !== '0'}
                      icon="folder_open"
                      placeholder="e.g. /path/to/demodb_backup_lv0"
                    />
                  </div>
                  <div className="grid grid-cols-[110px_1fr] items-center gap-3">
                    <Typography variant="label" className={`text-14 ${formData.selectBackupFilePath ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'}`}>
                      {CM.level1FileLabel}
                    </Typography>
                    <Input
                      value={formData.manualLevel1Path}
                      onChange={(e) => handleInputChange('manualLevel1Path', e.target.value)}
                      disabled={!formData.selectBackupFilePath || formData.manualBackupLevel !== '1'}
                      icon="folder_open"
                      placeholder="e.g. /path/to/demodb_backup_lv1"
                    />
                  </div>
                  <div className="grid grid-cols-[110px_1fr] items-center gap-3">
                    <Typography variant="label" className={`text-14 ${formData.selectBackupFilePath ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'}`}>
                      {CM.level2FileLabel}
                    </Typography>
                    <Input
                      value={formData.manualLevel2Path}
                      onChange={(e) => handleInputChange('manualLevel2Path', e.target.value)}
                      disabled={!formData.selectBackupFilePath || formData.manualBackupLevel !== '2'}
                      icon="folder_open"
                      placeholder="e.g. /path/to/demodb_backup_lv2"
                    />
                  </div>
                  {scatteredLevelsWarning && (
                    <InfoBanner variant="warning" icon="warning">
                      {scatteredLevelsWarning}
                    </InfoBanner>
                  )}
                </div>
              </div>
            </CaDialogField>

        </CaDialogFieldGrid>
      </CaDialogGroup>

      {/* ── Recovery Path Group ── */}
      {(() => {
        const defaultDir = currentDb?.dbdir || allBackups.find(b => b.recoverypath)?.recoverypath || '';
        if (!defaultDir) return null;

        return (
          <CaDialogGroup title={CM.grpDbPath || 'Recovery Path'}>
            <CaDialogFieldGrid labelWidth="130px" className="pt-2">
              <CaDialogField fullWidth>
                <div className="flex items-center gap-4 w-full">
                  <div className="shrink-0 min-w-[130px]">
                    <Checkbox
                      label={CM.changeRestorePathLabel}
                      checked={formData.changeRestorePath}
                      onChange={(e) => handleRestorePathToggle(e.target.checked)}
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      placeholder={CM.recoveryPathPlaceholder}
                      value={formData.changeRestorePath ? formData.recoveryPath : defaultDir}
                      onChange={(e) => handleInputChange('recoveryPath', e.target.value)}
                      disabled={!formData.changeRestorePath}
                      icon="drive_file_move"
                    />
                  </div>
                </div>
              </CaDialogField>
            </CaDialogFieldGrid>
          </CaDialogGroup>
        );
      })()}

      {/* ── Partial Recovery Group ── */}
      <CaDialogGroup title={CM.grpPartialRecovery || 'Partial Recovery'}>
        <CaDialogFieldGrid labelWidth="130px" className="pt-2">
          <CaDialogField fullWidth>
            <Checkbox
              label={CM.performPartialRecovery}
              checked={formData.isPartial}
              onChange={(e) => handleInputChange('isPartial', e.target.checked)}
            />
          </CaDialogField>
        </CaDialogFieldGrid>
      </CaDialogGroup>


    </div>

    </Modal>
  );

}
