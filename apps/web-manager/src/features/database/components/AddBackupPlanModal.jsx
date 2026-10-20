import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeAddBackupPlanModal, addBackupSchedule, fetchBackupSchedule, fetchBackupDbInfo } from '../databaseSlice';
import { dbKey } from '../dbKey';
import { deriveBackupDir } from '../backupPathUtils';
import { useCM } from '../../../constants/useCM';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { DatePicker } from '../../../components/ds/forms/DatePicker';
import { TimePicker } from '../../../components/ds/forms/TimePicker';
import { Toggle } from '../../../components/ds/forms/Toggle';
import { Typography } from '../../../components/ds/foundation/Typography';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import { ModalStatusLoading,
  ModalStatusSuccess, 
  ModalStatusError 
} from '../../../components/ds/feedback/ActionStatus';

const LEVEL_PRESETS_DEF = [
  { value: '0', title: 'Full (L0)', descKey: 'levelFullShortDesc', icon: 'auto_awesome_motion' },
  { value: '1', title: 'Inc. (L1)', descKey: 'levelIncrL0ShortDesc', icon: 'trending_up' },
  { value: '2', title: 'Inc. (L2)', descKey: 'levelIncrL1ShortDesc', icon: 'call_split' }
];

const FormSection = ({ title, children }) => (
  <section className="space-y-3">
    <Typography variant="h6" className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
      {title}
    </Typography>
    {children}
  </section>
);

export default function AddBackupPlanModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isAddBackupPlanModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase, databasesByHost } = useSelector((state) => state.database, shallowEqual);
  const { backupDbInfo: databaseBackupInfo } = useSelector((state) => state.databaseOperation, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);
  const databases = databasesByHost[selectedHostUid] || [];
  const currentDb = databases?.find((db) => db.dbname === selectedDatabase);

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
  
  const [formData, setFormData] = useState({
    backupId: '',
    backupLevel: '0',
    backupPath: '',
    periodType: 'Monthly',
    periodDetail: [1],
    backupTime: '12:30',
    deleteArchive: false,
    checkConsistency: false,
    updateStatistics: false,
    useCompression: true,
    threads: 0,
    backupsToKeep: 0,
    onlineType: 'online'
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isAddBackupPlanModalOpen && selectedDatabase) {
      resetAction();
      setErrors({});
      const initialPath = deriveBackupDir(currentDb?.dbdir || databaseBackupInfo?.[dbKey(selectedHostUid, selectedDatabase)]?.dbdir);
      setFormData({
        backupLevel: '0',
        backupPath: initialPath,
        backupId: `backup_${selectedDatabase}_${Date.now().toString().slice(-4)}`,
        periodType: 'Monthly',
        periodDetail: [1],
        backupTime: '12:30',
        deleteArchive: false,
        checkConsistency: false,
        updateStatistics: false,
        useCompression: false,
        threads: 0,
        backupsToKeep: 0,
        onlineType: 'offline'
      });

      if (selectedHostUid && !initialPath) {
        dispatch(fetchBackupDbInfo({ hostUid: selectedHostUid, dbname: selectedDatabase }))
          .unwrap()
          .then((info) => {
            if (info?.dbdir) {
              setFormData(prev => prev.backupPath ? prev : { ...prev, backupPath: deriveBackupDir(info.dbdir) });
            }
          })
          .catch(() => undefined);
      }
    }
  }, [isAddBackupPlanModalOpen, selectedDatabase, currentDb, selectedHostUid, databaseBackupInfo, dispatch, resetAction]);

  if (!isAddBackupPlanModalOpen) return null;

  const validate = () => {
    const errs = {};
    if (!formData.backupId.trim()) errs.backupId = CM.backupPlanIdRequiredMsg;
    if (!formData.backupPath.trim()) errs.backupPath = CM.backupDirRequiredMsg;
    return errs;
  };

  const handleInputChange = (field, value) => {
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
    if (field === 'periodType') {
      setFormData(prev => ({ 
        ...prev, 
        periodType: value,
        periodDetail: value === 'Daily' ? [] : (value === 'Specific days' ? new Date().toISOString().split('T')[0] : [1])
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const toggleDay = (day) => {
    setFormData(prev => ({
      ...prev,
      periodDetail: prev.periodDetail.includes(day)
        ? prev.periodDetail.filter(d => d !== day)
        : [...prev.periodDetail, day]
    }));
  };

  const setBulkDays = (type) => {
    let days = [];
    switch(type) {
      case 'all': days = Array.from({length: 31}, (_, i) => i + 1); break;
      case 'clear': days = []; break;
      case 'weekdays': 
        days = Array.from({length: 31}, (_, i) => i + 1).filter(d => (d % 7 !== 6 && d % 7 !== 0)); 
        break;
      case 'weekends':
        days = Array.from({length: 31}, (_, i) => i + 1).filter(d => (d % 7 === 6 || d % 7 === 0));
        break;
      default: days = [];
    }
    handleInputChange('periodDetail', days);
  };

  const handleSave = async () => {
    if (!selectedDatabase || !selectedHostUid) return;
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    startAction();

    let periodDateValue = '';
    if (formData.periodType === 'Daily') {
      // CMS's nv_get_val treats an empty-string value as if the parameter
      // were absent entirely ("Parameter(period_date) missing in the
      // request") — Daily does no further validation on the value itself,
      // so any non-empty placeholder satisfies it.
      periodDateValue = 'none';
    } else if (formData.periodType === 'Weekly') {
      // CMS matches these against a fixed English day-name list via strcmp
      // (cm_job_task.cpp's _check_backup_info) — must NOT use the UI's
      // localized CM.weekdaysFull labels, which send Korean text in ko locale.
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const selectedDays = Array.isArray(formData.periodDetail) ? formData.periodDetail : [];
      periodDateValue = selectedDays.map(dayNum => dayNames[dayNum - 1]).join(',');
    } else if (formData.periodType === 'Monthly') {
      periodDateValue = Array.isArray(formData.periodDetail) ? formData.periodDetail.join(',') : '';
    } else if (formData.periodType === 'Specific days') {
      periodDateValue = formData.periodDetail || '';
    }

    const payload = {
      backupid: formData.backupId,
      level: formData.backupLevel,
      path: formData.backupPath,
      period_type: formData.periodType === 'Specific days' ? 'Special' : formData.periodType,
      period_date: periodDateValue,
      time: formData.backupTime.replace(':', ''),
      archivedel: formData.deleteArchive ? 'ON' : 'OFF',
      updatestatus: formData.updateStatistics ? 'ON' : 'OFF',
      zip: formData.useCompression ? 'y' : 'n',
      check: formData.checkConsistency ? 'y' : 'n',
      storeold: 'OFF',
      mt: String(formData.threads),
      bknum: String(formData.backupsToKeep),
      onoff: formData.onlineType === 'online' ? 'ON' : 'OFF',
    };

    try {
      await dispatch(addBackupSchedule({ hostUid: selectedHostUid, dbname: selectedDatabase, payload })).unwrap();
      dispatch(fetchBackupSchedule({ hostUid: selectedHostUid, dbname: selectedDatabase }));
      endSuccess(`${formData.backupId}`);
    } catch (err) {
      endError(typeof err === 'string' ? err : (err.message || CM.operationFailed));
    }
  };

  const handleClose = () => dispatch(closeAddBackupPlanModal());

  /* ─── LOADING view ─── */
  if (isLoading) {
    return (
      <Modal isOpen title={CM.initializingSchedule} icon="backup_table" onClose={handleClose} maxWidth="700px">
        <ModalStatusLoading
          title={CM.savingSchedule}
          subtitle={formData.backupId}
          onBackground={handleClose}
        />
      </Modal>
    );
  }

  /* ─── SUCCESS view ─── */
  if (isSuccess) {
    return (
      <Modal isOpen title={CM.scheduleCommitted} icon="backup_table" iconVariant="success" onClose={handleClose} maxWidth="700px">
        <ModalStatusSuccess
          title={CM.scheduleCommitted}
          message={`${selectedDatabase}: ${formData.backupId}`}
          onConfirm={handleClose}
          confirmText={CM.ok}
        />
      </Modal>
    );
  }

  /* ─── ERROR view ─── */
  if (isError) {
    return (
      <Modal isOpen title={CM.executionError} icon="backup_table" iconVariant="danger" onClose={resetAction} maxWidth="700px">
        <ModalStatusError
          title={CM.operationInterrupted}
          error={actionError}
          guidance={CM.backupPlanGuidance}
          onRetry={handleSave}
          onCancel={resetAction}
          retryText={CM.retry}
          cancelText={CM.dismiss}
        />
      </Modal>
    );
  }

  /* ─── FORM view ─── */
  return (
    <Modal
      isOpen={isAddBackupPlanModalOpen}
      onClose={handleClose}
      title={CM.createBackupPlan}
      subtitle={CM.addBackupPlanSubtitle(selectedDatabase)}
      icon="backup_table"
      maxWidth="700px"
      testId="add-backup-plan"
      onSubmit={handleSave}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="add-backup-plan-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          <Button data-testid="add-backup-plan-save-btn" variant="primary" onClick={handleSave} icon="backup_table" className="min-w-[140px]">{CM.createBackupPlan}</Button>
        </div>
      }
    >
      <div className="space-y-7 animate-in fade-in duration-200">
        
        <FormSection title={CM.destination}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={CM.planIdLabel} value={formData.backupId} onChange={(e) => handleInputChange('backupId', e.target.value)} error={errors.backupId} placeholder={CM.backupPlanIdPlaceholder} icon="badge" required />
            <Input label={CM.path} value={formData.backupPath} onChange={(e) => handleInputChange('backupPath', e.target.value)} error={errors.backupPath} placeholder={CM.backupDirPlaceholder} icon="folder_zip" className="font-mono!" required />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label={CM.type}>
            {LEVEL_PRESETS_DEF.map(item => (
              <button
                type="button"
                key={item.value}
                onClick={() => handleInputChange('backupLevel', item.value)}
                role="radio"
                aria-checked={formData.backupLevel === item.value}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                  formData.backupLevel === item.value
                    ? 'bg-amber-500/8 border-amber-500/50'
                    : 'bg-slate-50 dark:bg-white/4 border-slate-200 dark:border-white/10 hover:border-amber-500/40'
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  formData.backupLevel === item.value ? 'bg-amber-500 text-slate-900' : 'bg-white dark:bg-white/8 text-slate-400'
                }`}>
                  <Icon name={item.icon} size="15px" weight={300} />
                </div>
                <div className="text-left min-w-0">
                  <Typography variant="p" className="font-medium text-14 leading-tight text-slate-700 dark:text-slate-200">{item.title}</Typography>
                  <Typography variant="caption" className="block truncate leading-tight">{CM[item.descKey]}</Typography>
                </div>
              </button>
            ))}
          </div>
        </FormSection>

        <div className="h-px bg-slate-200 dark:bg-white/10" />

        <FormSection title={CM.executionSchedule}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label={CM.rotationLabel}
                value={formData.periodType}
                onChange={(e) => handleInputChange('periodType', e.target.value)}
                options={[
                  { value: 'Monthly', label: CM.monthly },
                  { value: 'Weekly', label: CM.weekly },
                  { value: 'Daily', label: CM.daily },
                  { value: 'Specific days', label: CM.specificDays }
                ]}
              />
              <TimePicker label={CM.targetTime} value={formData.backupTime} onChange={(e) => handleInputChange('backupTime', e.target.value)} icon="nest_clock_farsight_analog" />
            </div>

            <div className="animate-in fade-in duration-200">
              {formData.periodType === 'Monthly' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'all', label: CM.everyDayPreset, icon: 'select_all' },
                      { id: 'clear', label: CM.clearAllPreset, icon: 'backspace' },
                      { id: 'weekdays', label: CM.weekdaysPreset, icon: 'work' },
                      { id: 'weekends', label: CM.weekendsPreset, icon: 'beach_access' },
                    ].map(preset => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setBulkDays(preset.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-13 font-medium text-slate-500 dark:text-slate-400 hover:border-amber-500/50 hover:text-amber-500 transition-colors"
                      >
                         {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1.5 p-3 bg-slate-50 dark:bg-white/4 border border-slate-200 dark:border-white/10 rounded-xl">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        aria-pressed={formData.periodDetail.includes(day)}
                        className={`h-8 rounded-lg border text-13 font-medium transition-colors flex items-center justify-center ${
                          formData.periodDetail.includes(day)
                            ? 'bg-amber-500 border-amber-500 text-slate-900'
                            : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-amber-500/40'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {formData.periodType === 'Weekly' && (
                <div className="grid grid-cols-7 gap-2 p-3 bg-slate-50 dark:bg-white/4 border border-slate-200 dark:border-white/10 rounded-xl">
                  {CM.weekdaysShort.map((day, index) => {
                    const dayValue = index + 1;
                    const isActive = formData.periodDetail.includes(dayValue);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(dayValue)}
                        aria-pressed={isActive}
                        className={`h-9 rounded-lg border text-13 font-medium transition-colors flex items-center justify-center ${
                          isActive
                            ? 'bg-amber-500 border-amber-500 text-slate-900'
                            : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-amber-500/40'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              )}

              {formData.periodType === 'Daily' && (
                <InfoBanner title={CM.daily24hCycleLabel}>
                  {CM.dailyScheduleInfoBanner(formData.backupTime)}
                </InfoBanner>
              )}

              {formData.periodType === 'Specific days' && (
                <DatePicker label={CM.date} value={formData.periodDetail} onChange={(e) => handleInputChange('periodDetail', e.target.value)} icon="event" />
              )}
            </div>
        </FormSection>

        <div className="h-px bg-slate-200 dark:bg-white/10" />

        <FormSection title={CM.optimizationSectionTitle}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
            {[
              { label: CM.deleteArchiveLogsLabel, field: 'deleteArchive', icon: 'auto_delete' },
              { label: CM.updateStatisticsLabel, field: 'updateStatistics', icon: 'query_stats' },
              { label: CM.checkConsistencyLabel, field: 'checkConsistency', icon: 'verified' },
              { label: CM.compressBackupLabel, field: 'useCompression', icon: 'compress' },
            ].map(opt => (
              <div key={opt.field} className="flex items-center gap-3 min-h-10">
                <Icon name={opt.icon} size="16px" weight={300} className={formData[opt.field] ? 'text-amber-500' : 'text-slate-400'} />
                <Typography variant="p" className="flex-1 min-w-0 text-14 font-medium text-slate-700 dark:text-slate-200 leading-tight">{opt.label}</Typography>
                <div className="shrink-0">
                  <Toggle checked={formData[opt.field]} onChange={(val) => handleInputChange(opt.field, val)} size="sm" variant="primary" />
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2" role="radiogroup" aria-label={CM.type}>
          {[
            { value: 'online', label: CM.onlineMode, icon: 'bolt' },
            { value: 'offline', label: CM.offlineMode, icon: 'power_settings_new' }
          ].map(mode => (
            <button
              type="button"
              key={mode.value}
              onClick={() => handleInputChange('onlineType', mode.value)}
              role="radio"
              aria-checked={formData.onlineType === mode.value}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                formData.onlineType === mode.value 
                  ? 'bg-amber-500/8 border-amber-500/50'
                  : 'bg-slate-50 dark:bg-white/4 border-slate-200 dark:border-white/10 hover:border-amber-500/40'
              }`}
            >
              <Icon name={mode.icon} size="18px" weight={300} className={formData.onlineType === mode.value ? 'text-amber-500' : 'text-slate-400'} />
              <Typography variant="p" className="flex-1 font-medium text-14 leading-tight text-slate-700 dark:text-slate-200">{mode.label}</Typography>
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                formData.onlineType === mode.value ? 'border-amber-500' : 'border-slate-300 dark:border-white/20'
              }`}>
                {formData.onlineType === mode.value && <div className="w-2 h-2 rounded-full bg-amber-500" />}
              </div>
            </button>
          ))}
          </div>
        </FormSection>

        <details className="group rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[12px] font-medium text-slate-700 dark:text-slate-200 hover:text-amber-600 dark:hover:text-amber-400">
            <span className="flex items-center gap-2">
              <Icon name="tune" size="16px" weight={300} />
              {CM.advancedParamsTab}
            </span>
            <Icon name="expand_more" size="18px" className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-200 dark:border-white/10 px-4 py-4">
            <Input type="number" label={CM.concurrentThreads} value={formData.threads} onChange={(e) => handleInputChange('threads', parseInt(e.target.value) || 0)} icon="speed" suffix="CORES" />
            <Input type="number" label={CM.retentionLabel} value={formData.backupsToKeep} onChange={(e) => handleInputChange('backupsToKeep', parseInt(e.target.value) || 0)} icon="history" suffix="SETS" />
          </div>
        </details>

      </div>
    </Modal>
  );
}
