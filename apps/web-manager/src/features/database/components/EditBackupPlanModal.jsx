import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeEditBackupPlanModal, editBackupSchedule, fetchBackupSchedule } from '../databaseSlice';
import { useCM } from '../../../constants/useCM';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { Toggle } from '../../../components/ds/forms/Toggle';
import { Typography } from '../../../components/ds/foundation/Typography';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
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

const LEVEL_PRESETS_DEF = [
  { value: '0', title: 'Full (L0)', descKey: 'levelFullShortDesc', icon: 'auto_awesome_motion' },
  { value: '1', title: 'Inc. (L1)', descKey: 'levelIncrL0ShortDesc', icon: 'trending_up' },
  { value: '2', title: 'Inc. (L2)', descKey: 'levelIncrL1ShortDesc', icon: 'call_split' }
];

export default function EditBackupPlanModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isEditBackupPlanModalOpen, selectedBackupId } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase } = useSelector((state) => state.database, shallowEqual);
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
    useCompression: false,
    threads: 0,
    backupsToKeep: 0,
    onlineType: 'offline'
  });

  const [formLoaded, setFormLoaded] = useState(false);

  useEffect(() => {
    if (isEditBackupPlanModalOpen && selectedDatabase && selectedHostUid) {
      resetAction();
      setFormLoaded(false);
      dispatch(fetchBackupSchedule({ hostUid: selectedHostUid, dbname: selectedDatabase }))
        .unwrap()
        .then((data) => {
          const backupData = data?.schedules;
          if (backupData) {
            const plans = Array.isArray(backupData) ? backupData : [backupData];
            const info = selectedBackupId ? plans.find(p => p.backupid === selectedBackupId) : plans[0];
            
            if (info) {
              let periodDetail = [];
              if (info.period_type === 'Special') {
                periodDetail = info.period_date || '';
              } else if (info.period_type === 'Weekly' && info.period_date) {
                const dayNameMap = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };
                const days = Array.isArray(info.period_date) ? info.period_date : info.period_date.split(',');
                periodDetail = days.map(day => day.trim()).filter(day => dayNameMap[day]).map(day => dayNameMap[day]);
              } else if (info.period_type === 'Monthly' && info.period_date) {
                const days = Array.isArray(info.period_date) ? info.period_date : info.period_date.split(',');
                periodDetail = days.map(Number).filter(day => !isNaN(day) && day >= 1 && day <= 31);
              }

              setFormData({
                backupId: info.backupid || '',
                backupLevel: String(info.level ?? '0'),
                backupPath: info.path || '',
                periodType: info.period_type === 'Special' ? 'Specific days' : info.period_type,
                periodDetail: periodDetail,
                backupTime: info.time ? `${info.time.slice(0, 2)}:${info.time.slice(2)}` : '12:30',
                deleteArchive: info.archivedel === 'ON',
                updateStatistics: info.updatestatus === 'ON',
                useCompression: info.zip === 'y',
                checkConsistency: info.check === 'y',
                threads: parseInt(info.mt) || 0,
                backupsToKeep: parseInt(info.bknum) || 0,
                onlineType: info.onoff === 'ON' ? 'online' : 'offline'
              });
            }
          }
        })
        .catch(() => {})
        .finally(() => setFormLoaded(true));
    }
  }, [isEditBackupPlanModalOpen, selectedDatabase, selectedHostUid, selectedBackupId, dispatch, resetAction]);

  if (!isEditBackupPlanModalOpen) return null;

  const handleInputChange = (field, value) => {
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
    const details = Array.isArray(formData.periodDetail) ? formData.periodDetail : [];
    setFormData(prev => ({
      ...prev,
      periodDetail: details.includes(day) ? details.filter(d => d !== day) : [...details, day]
    }));
  };

  const setBulkDays = (type) => {
    let days = [];
    switch(type) {
      case 'all': days = Array.from({length: 31}, (_, i) => i + 1); break;
      case 'clear': days = []; break;
      case 'weekdays': days = Array.from({length: 31}, (_, i) => i + 1).filter(d => (d % 7 !== 6 && d % 7 !== 0)); break;
      case 'weekends': days = Array.from({length: 31}, (_, i) => i + 1).filter(d => (d % 7 === 6 || d % 7 === 0)); break;
      default: days = [];
    }
    handleInputChange('periodDetail', days);
  };

  const handleSave = async () => {
    if (!selectedDatabase || !selectedHostUid) return;

    startAction();

    let periodDateValue = '';
    if (formData.periodType === 'Daily') {
      // CMS's nv_get_val treats an empty-string value as if the parameter
      // were absent entirely ("Parameter(period_date) missing in the
      // request") — Daily does no further validation on the value itself,
      // so any non-empty placeholder satisfies it.
      periodDateValue = 'none';
    } else if (formData.periodType === 'Weekly') {
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
      await dispatch(editBackupSchedule({ hostUid: selectedHostUid, dbname: selectedDatabase, payload })).unwrap();
      dispatch(fetchBackupSchedule({ hostUid: selectedHostUid, dbname: selectedDatabase }));
      endSuccess(CM.backupPlanUpdatedMsg(formData.backupId));
    } catch (err) {
      endError(typeof err === 'string' ? err : (err.message || CM.patchRejectedMsg));
    }
  };

  const handleClose = () => dispatch(closeEditBackupPlanModal());

  /* ─── LOADING view ─── */
  if (isLoading) {
    return (
      <Modal isOpen title={CM.editBackupPlanTitle} icon="edit" onClose={handleClose} maxWidth="700px">
        <ModalStatusLoading
          title={CM.updatingSchedule}
          subtitle={formData.backupId}
          onBackground={handleClose}
        />
      </Modal>
    );
  }

  /* ─── SUCCESS view ─── */
  if (isSuccess) {
    return (
      <Modal isOpen title={CM.updateSuccessful} icon="verified" iconVariant="success" onClose={handleClose} maxWidth="700px">
        <ModalStatusSuccess
          title={CM.updateSuccessful}
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
      <Modal isOpen title={CM.executionError} icon="error" iconVariant="danger" onClose={resetAction} maxWidth="700px">
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
      isOpen={isEditBackupPlanModalOpen}
      onClose={handleClose}
      title={CM.editBackupPlanTitle}
      subtitle={CM.editBackupPlanSubtitle(selectedDatabase)}
      icon="edit_calendar"
      maxWidth="700px"
      testId="edit-backup-plan"
      onSubmit={handleSave}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="edit-backup-plan-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          <Button data-testid="edit-backup-plan-save-btn" variant="primary" onClick={handleSave} icon="save" disabled={!formLoaded} className="min-w-[140px]">{CM.saveChanges}</Button>
        </div>
      }
    >
      <div className="space-y-10 pb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        
        {/* Level Presets */}
        <div className="space-y-4">
           <SectionHeader title={CM.type} icon="architecture" />
          <div className="grid grid-cols-3 gap-3">
            {LEVEL_PRESETS_DEF.map(item => (
              <button
                key={item.value}
                onClick={() => handleInputChange('backupLevel', item.value)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-200 ${
                  String(formData.backupLevel) === String(item.value)
                    ? 'bg-amber-500/10 border-amber-500/40 shadow-xs'
                    : 'bg-white dark:bg-white/1 border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10'
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                  String(formData.backupLevel) === String(item.value) ? 'bg-amber-500 text-slate-900 border-amber-500/50' : 'bg-slate-50 dark:bg-white/5 text-slate-400 border-transparent'
                }`}>
                  <Icon name={item.icon} size="15px" weight={300} />
                </div>
                <div className="text-left min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <Typography variant="p" className={`font-black text-13 leading-none ${formData.backupLevel === item.value ? 'text-amber-500' : 'text-slate-700 dark:text-white'}`}>
                      {item.title}
                    </Typography>
                    <Typography variant="caption" className="text-11 text-slate-400 dark:text-slate-500 font-bold leading-none">
                      {CM[item.descKey]}
                    </Typography>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Identity & Path */}
        <div className="grid grid-cols-2 gap-4">
          <Input label={CM.planIdLabel} value={formData.backupId} disabled icon="badge" size="sm" className="opacity-60 bg-slate-50!" />
          <Input label={CM.path} value={formData.backupPath} onChange={(e) => handleInputChange('backupPath', e.target.value)} placeholder="/var/backups" icon="folder_zip" size="sm" className="font-mono!" />
        </div>

        {/* Recurrence */}
        <div className="space-y-4">
           <SectionHeader title={CM.executionSchedule} icon="schedule" />
          <div className="p-5 bg-slate-50/50 dark:bg-white/1 border border-slate-100 dark:border-white/4 rounded-2xl space-y-6 shadow-xs">
            <div className="grid grid-cols-2 gap-4">
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
                size="sm"
              />
              <Input label={CM.targetTime} type="time" value={formData.backupTime} onChange={(e) => handleInputChange('backupTime', e.target.value)} icon="nest_clock_farsight_analog" size="sm" />
            </div>

            <div className="animate-in fade-in duration-300">
              {formData.periodType === 'Monthly' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'all', label: CM.everyDayPreset },
                      { id: 'clear', label: CM.clearAllPreset },
                      { id: 'weekdays', label: CM.weekdaysPreset },
                      { id: 'weekends', label: CM.weekendsPreset },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setBulkDays(id)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/3 text-12 font-bold text-slate-400 hover:border-amber-500/50 hover:text-amber-500 transition-all"
                      >
                         {label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1.5 p-3.5 bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`h-9 rounded-xl border text-13 font-black transition-all flex items-center justify-center ${
                          (Array.isArray(formData.periodDetail) && formData.periodDetail.includes(day))
                            ? 'bg-amber-500 border-amber-500 text-slate-900 shadow-xs scale-105 z-10'
                            : 'bg-white dark:bg-white/3 border-slate-200 dark:border-white/4 text-slate-400 hover:border-amber-500/40'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {formData.periodType === 'Weekly' && (
                <div className="grid grid-cols-7 gap-2 p-3.5 bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl">
                  {CM.weekdaysShort.map((day, index) => {
                    const dayValue = index + 1;
                    const isActive = Array.isArray(formData.periodDetail) && formData.periodDetail.includes(dayValue);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(dayValue)}
                        className={`h-11 rounded-xl border text-13 font-black transition-all flex items-center justify-center ${
                          isActive
                            ? 'bg-amber-500 border-amber-500 text-slate-900 shadow-xs scale-105'
                            : 'bg-white dark:bg-white/3 border-slate-200 dark:border-white/4 text-slate-400 hover:border-amber-500/40'
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
                <Input type="date" label={CM.date} value={formData.periodDetail} onChange={(e) => handleInputChange('periodDetail', e.target.value)} icon="event" size="sm" />
              )}
            </div>
          </div>
        </div>

        {/* Operational Options */}
        <div className="space-y-4">
           <SectionHeader title={CM.optimizationSectionTitle} icon="settings_input_component" />
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: CM.deleteArchiveLogsLabel, field: 'deleteArchive', icon: 'auto_delete', desc: CM.deleteArchiveLogsDesc },
              { label: CM.updateStatisticsLabel, field: 'updateStatistics', icon: 'query_stats', desc: CM.updateStatisticsDesc },
              { label: CM.checkConsistencyLabel, field: 'checkConsistency', icon: 'verified', desc: CM.checkConsistencyDesc },
              { label: CM.compressBackupLabel, field: 'useCompression', icon: 'compress', desc: CM.compressBackupDesc },
            ].map(opt => (
              <div 
                key={opt.field} 
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer group ${
                  formData[opt.field] 
                    ? 'bg-amber-500/5 border-amber-500/30' 
                    : 'bg-white dark:bg-white/1 border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/12'
                }`}
                onClick={() => handleInputChange(opt.field, !formData[opt.field])}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0 border ${
                  formData[opt.field] 
                    ? 'bg-amber-500 text-slate-900 border-amber-500/40' 
                    : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-400 group-hover:text-slate-500'
                }`}>
                  <Icon name={opt.icon} size="13px" weight={300} />
                </div>
                <div className="flex-1 min-w-0">
                  <Typography variant="p" className={`text-13 font-black transition-colors leading-none whitespace-nowrap ${formData[opt.field] ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                    {opt.label}
                  </Typography>
                </div>
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Toggle checked={formData[opt.field]} onChange={(val) => handleInputChange(opt.field, val)} size="sm" variant="primary" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resources */}
        <div className="grid grid-cols-2 gap-6">
          <Input type="number" label={CM.concurrentThreads} value={formData.threads} onChange={(e) => handleInputChange('threads', parseInt(e.target.value) || 0)} icon="speed" suffix="CORES" size="sm" />
          <Input type="number" label={CM.retentionLabel} value={formData.backupsToKeep} onChange={(e) => handleInputChange('backupsToKeep', parseInt(e.target.value) || 0)} icon="history" suffix="SETS" size="sm" />
        </div>

        {/* Mode Selector */}
        <div className="space-y-3 px-1">
          {[
            { value: 'online', label: CM.onlineMode, desc: CM.onlineModeDesc, icon: 'bolt' },
            { value: 'offline', label: CM.offlineMode, desc: CM.offlineModeDesc, icon: 'power_settings_new' }
          ].map(mode => (
            <button
              key={mode.value}
              onClick={() => handleInputChange('onlineType', mode.value)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left shadow-xs ${
                formData.onlineType === mode.value 
                  ? 'bg-amber-500/5 border-amber-500/40' 
                  : 'bg-white dark:bg-white/1 border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/12'
              }`}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all shrink-0 ${
                formData.onlineType === mode.value ? 'bg-amber-500 text-slate-900 border-amber-500/40' : 'bg-slate-50 dark:bg-white/5 text-slate-400 border-transparent'
              }`}>
                <Icon name={mode.icon} size="md" weight={300} />
              </div>
              <div className="flex-1">
                <Typography variant="p" className={`font-black text-14 leading-tight transition-colors ${formData.onlineType === mode.value ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>{mode.label}</Typography>
                <Typography variant="caption" className="text-slate-400 dark:text-slate-500 font-medium leading-relaxed block">{mode.desc}</Typography>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                formData.onlineType === mode.value ? 'border-amber-500 shadow-[0_0_8px_rgba(255,193,7,0.3)]' : 'border-slate-300 dark:border-white/10'
              }`}>
                {formData.onlineType === mode.value && <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs" />}
              </div>
            </button>
          ))}
        </div>

      </div>
    </Modal>
  );
}
