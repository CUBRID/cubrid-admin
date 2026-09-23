import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { 
  closeCreateDatabaseModal, 
  fetchCreateDatabaseInfo,
  fetchDatabaseStartInfo 
} from '../databaseSlice';

import { databaseJobApi } from '../databaseJobApi';
import { useCmsJob } from '../../../infrastructure/hooks/useCmsJob';
import { getCmsJobLoadingSubtitle } from '../../../infrastructure/cmsJob/cmsJobUi';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { Toggle } from '../../../components/ds/forms/Toggle';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Spinner } from '../../../components/ds/foundation/Spinner';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import { 
  ModalStatusLoading, 
  ModalStatusSuccess, 
  ModalStatusError 
} from '../../../components/ds/feedback/ActionStatus';
import { useCM } from '../../../constants/useCM';

// view states
const VIEW_FORM    = 'form';
const VIEW_LOADING = 'loading';
const VIEW_SUCCESS = 'success';
const VIEW_ERROR   = 'error';

const PAGE_SIZES = [4096, 8192, 16384, 32768];
const BASE_LOCALE_VALUES = ['en_US.iso88591', 'en_US.utf8', 'ko_KR.euckr', 'ko_KR.utf8'];
// Fixed volume type: segment represents a permanent data volume.

const renameVolumesSequentially = (volumes, dbName) => {
  const typeCounters = {};
  return volumes.map((vol, idx) => {
    const type = vol.type;
    typeCounters[type] = (typeCounters[type] || 0) + 1;
    const padNum = String(typeCounters[type]).padStart(3, '0');
    const name = dbName 
      ? `${dbName}_${type}_${padNum}` 
      : `vol_${type}_${padNum}`;
    return { ...vol, name };
  });
};

const INITIAL_FORM_DATA = {
  dbName: '',
  pageSize: 16384,
  locale: 'en_US.utf8',
  userDefinedLocale: '',
  genericVolPath: '',
  genericVolSize: 512,
  logVolPath: '',
  logVolSize: 512,
  logPageSize: 16384,
  autoStart: true,
  volumes: [],
  autoAddVol: {
    permanent: 'ON',
    warn: '0.15',
    // User enters a size (extSize/extUnit); the actual CMS field
    // (data_ext_page/index_ext_page) is a page count, computed from this
    // and formData.pageSize right before submit — see handleFinish.
    extSize: '512',
    extUnit: 'MB',
  },
  baseDir: '',
  dbaPassword: '',
  confirmPassword: ''
};

function SummaryRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-white/4 last:border-0">
      <span className="text-13 text-slate-500 dark:text-slate-400 font-medium">{label}</span>
      <span className={`text-13 font-bold font-mono ${accent ? 'text-amber-500' : 'text-slate-700 dark:text-slate-200'}`}>{value}</span>
    </div>
  );
}

const typeBadge = (t) => {
  if (t === 'data') return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
  if (t === 'index') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
  if (t === 'temp') return 'bg-violet-500/10 text-violet-500 border-violet-500/20';
  return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
};

/* ── main component ─────────────────────────────────────────── */
export default function CreateDatabaseModal() {
  const CM = useCM();
  const locales = useMemo(
    () => [
      ...BASE_LOCALE_VALUES.map((value) => ({
        value,
        label: `${value} — ${CM.localeDescriptions[value]}`,
      })),
      { value: 'user_defined', label: CM.userDefined },
    ],
    [CM]
  );
  // Removed dynamic volume type selection. Fixed to permanent data segment.
  const steps = useMemo(
    () => [
      { id: 1, label: CM.wizardGeneral, icon: 'settings' },
      { id: 2, label: CM.wizardAdditionalVol, icon: 'storage' },
      { id: 3, label: CM.wizardAutoVol, icon: 'auto_mode' },
      { id: 4, label: CM.wizardSetDbaPass, icon: 'lock' },
      { id: 5, label: CM.wizardDbInfo, icon: 'fact_check' },
    ],
    [CM]
  );
  const dispatch = useDispatch();
  const { isCreateDatabaseModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
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

  const { runJob, background } = useCmsJob();
  const [jobStatus, setJobStatus] = useState(null);
  // The database itself can succeed while a follow-up step (auto-start,
  // dba password, auto-add-vol config) fails — the job still reports
  // 'succeeded' for that (see cms-job.service.ts's applyCmsOutcome), so this
  // surfaces which follow-up steps didn't apply instead of the plain
  // success message hiding it.
  const [creationWarning, setCreationWarning] = useState(null);
  // Identifies the most recent handleFinish() call. This modal is a
  // singleton reused for the next database the user opens it for — a
  // shared boolean reset on every reopen (the old jobDismissedRef) meant an
  // older, backgrounded create job could still resolve after the user
  // reopened the modal for a different database, and would flip the modal
  // to its success view using whatever form data is *currently* filled in
  // instead of the database that job actually created.
  const currentCreateInvocationRef = useRef(null);

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  const hostEnv = useSelector((state) => state.host.hostEnvs[selectedHostUid]);

  // Runs once per modal opening — NOT every time hostEnv?.CUBRID_DATABASES
  // changes. It used to depend on that value directly, so the async
  // fetchCreateDatabaseInfo below (or hostEnv arriving later) re-triggered
  // this effect and called setFormData(INITIAL_FORM_DATA) again, silently
  // wiping out whatever the user had already typed (e.g. the db name).
  const hasInitializedRef = useRef(false);
  // Set once the user directly edits genericVolPath/logVolPath — after that,
  // the dbName-driven effect below stops overwriting them with the
  // auto-derived baseDir/dbName path.
  const pathManuallyEditedRef = useRef(false);
  useEffect(() => {
    if (!isCreateDatabaseModalOpen) {
      hasInitializedRef.current = false;
      pathManuallyEditedRef.current = false;
      return;
    }
    if (!selectedHostUid || hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    setStep(1);
    resetAction();
    setFormData(INITIAL_FORM_DATA);
    setCreationWarning(null);

    // Backend fallback in case hostEnv (below) never arrives or is stale.
    // Uses functional merges (prev.x || dir), so it's safe even if the user
    // has already started typing by the time this resolves.
    dispatch(fetchCreateDatabaseInfo({ hostUid: selectedHostUid }))
      .unwrap()
      .then(data => {
        const dir = data?.default_db_dir;
        if (dir) {
          setFormData(prev => ({
            ...prev,
            baseDir: prev.baseDir || dir,
            genericVolPath: prev.genericVolPath || dir,
            logVolPath: prev.logVolPath || dir,
            volumes: prev.volumes.map(vol => ({ ...vol, path: vol.path || dir }))
          }));
        }
      })
      .catch(() => {});
  }, [isCreateDatabaseModalOpen, selectedHostUid, dispatch, resetAction]);

  // Reacts to hostEnv arriving (or changing) independently of the one-time
  // reset above, so a late-resolving fetch still populates the path fields
  // — merging via prev.x || dir rather than replacing, so it never clobbers
  // a value the user (or the fetch above) has already set.
  useEffect(() => {
    if (!isCreateDatabaseModalOpen) return;
    const cachedDir = hostEnv?.CUBRID_DATABASES;
    if (!cachedDir) return;
    setFormData(prev => ({
      ...prev,
      baseDir: prev.baseDir || cachedDir,
      genericVolPath: prev.genericVolPath || cachedDir,
      logVolPath: prev.logVolPath || cachedDir,
      volumes: prev.volumes.map(vol => ({ ...vol, path: vol.path || cachedDir }))
    }));
  }, [isCreateDatabaseModalOpen, hostEnv?.CUBRID_DATABASES]);

  useEffect(() => {
    const { dbName, baseDir } = formData;
    if (baseDir && !pathManuallyEditedRef.current) {
      const fullPath = dbName
        ? (baseDir.endsWith('/') ? `${baseDir}${dbName}` : `${baseDir}/${dbName}`)
        : baseDir;

      setFormData(prev => {
        const renamed = renameVolumesSequentially(prev.volumes, dbName);
        return {
          ...prev,
          genericVolPath: fullPath,
          logVolPath: fullPath,
          volumes: renamed.map(vol => ({ ...vol, path: fullPath }))
        };
      });
    }
  }, [formData.dbName]);

  if (!isCreateDatabaseModalOpen) return null;

  const handleNext = () => setStep(prev => prev + 1);
  const handleBack = () => setStep(prev => prev - 1);
  const handleInputChange = (field, value) => {
    if (field === 'genericVolPath' || field === 'logVolPath') {
      pathManuallyEditedRef.current = true;
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  const handleVolumeChange = (index, field, value) => {
    let newVolumes = [...formData.volumes];
    newVolumes[index] = { ...newVolumes[index], [field]: value };
    if (field === 'type') {
      newVolumes = renameVolumesSequentially(newVolumes, formData.dbName);
    }
    setFormData(prev => ({ ...prev, volumes: newVolumes }));
  };
  const addVolume = () => {
    const type = 'data';
    const newVolumes = [...formData.volumes, { name: '', type, size: 512, path: formData.genericVolPath }];
    const renamed = renameVolumesSequentially(newVolumes, formData.dbName);
    setFormData(prev => ({
      ...prev,
      volumes: renamed
    }));
  };
  const removeVolume = (index) => setFormData(prev => ({ ...prev, volumes: prev.volumes.filter((_, i) => i !== index) }));

  const handleAutoAddVolChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      autoAddVol: { ...prev.autoAddVol, [field]: value }
    }));
  };

  const isFormValid = () => {
    if (step === 1) return formData.dbName && formData.genericVolPath && formData.logVolPath;
    if (step === 4) return formData.dbaPassword === formData.confirmPassword && (formData.dbaPassword === '' || formData.dbaPassword.length >= 8);
    return true;
  };

  const handleFinish = async () => {
    if (!selectedHostUid) return;

    const invocation = { dismissed: false };
    currentCreateInvocationRef.current = invocation;

    startAction();
    try {
      const exvol = formData.volumes.map(vol => ({
        [vol.name]: {
          type: vol.type,
          size: vol.size,
          pagesize: formData.pageSize,
          volpath: vol.path
        }
      }));

      const extSizeBytes = Number(formData.autoAddVol.extSize) * (formData.autoAddVol.extUnit === 'GB' ? 1024 * 1024 * 1024 : 1024 * 1024);
      const extPage = String(Math.floor(extSizeBytes / formData.pageSize));

      const payload = {
        dbname: formData.dbName,
        pagesize: formData.pageSize,
        db_volume_size: formData.genericVolSize,
        genvolpath: formData.genericVolPath,
        logpagesize: formData.logPageSize,
        logsize: formData.logVolSize,
        logvolpath: formData.logVolPath,
        setAutoStart: formData.autoStart,
        overwrite_config_file: 'YES',
        numpage: Math.floor((formData.genericVolSize * 1024 * 1024) / formData.pageSize),
        exvol: exvol,
        charset: formData.locale === 'user_defined' ? formData.userDefinedLocale : formData.locale,
        setAutoAddVol: {
          data: formData.autoAddVol.permanent,
          data_warn_outofspace: formData.autoAddVol.warn,
          data_ext_page: extPage,
          index: formData.autoAddVol.permanent,
          index_warn_outofspace: formData.autoAddVol.warn,
          index_ext_page: extPage,
        },
        username: "dba",
        updateUser: {
          userpass: formData.dbaPassword
        }
      };

      const finishedJob = await runJob(
        () => databaseJobApi.submitCreate(selectedHostUid, payload),
        {
          onProgress: (j) => {
            if (!invocation.dismissed) {
              setJobStatus(j.jobStatus ?? j.status);
            }
          },
        }
      );

      dispatch(fetchDatabaseStartInfo({ hostUid: selectedHostUid, isBackground: true }));

      // The database itself can be created successfully even when a
      // follow-up step (start, dba password, auto-add-vol config) didn't
      // apply — surface which ones so it isn't silently lost.
      const result = finishedJob?.result;
      const failedSteps = [
        result?.startDatabase?.success === false && { label: CM.startDatabase, message: result.startDatabase.error?.message },
        result?.updateUser?.success === false && { label: CM.wizardSetDbaPass, message: result.updateUser.error?.message },
        result?.setAutoAddVol?.success === false && { label: CM.wizardAutoVol, message: result.setAutoAddVol.error?.message },
        result?.setAutoStart?.success === false && { label: CM.autoStart, message: result.setAutoStart.error?.message },
      ].filter(Boolean);
      setCreationWarning(
        failedSteps.length > 0
          ? failedSteps.map((s) => `${s.label}: ${s.message || CM.databaseCreationErrorMsg}`).join(' / ')
          : null
      );

      if (!invocation.dismissed) {
        endSuccess(CM.databaseInitializedMsg(formData.dbName));
      }
    } catch (err) {
      if (!invocation.dismissed) {
        const msg =
          err?.response?.data?.note ||
          err?.response?.data?.message ||
          (typeof err === 'string' ? err : err?.message) ||
          CM.databaseCreationErrorMsg;
        endError(msg);
      }
    }
  };

  const handleClose = () => {
    if (isLoading && currentCreateInvocationRef.current) {
      currentCreateInvocationRef.current.dismissed = true;
    }
    dispatch(closeCreateDatabaseModal());
    setStep(1);
    setFormData(INITIAL_FORM_DATA);
    resetAction();
  };

  // Mirrors the footer's step-dependent primary button: Next (gated by
  // isFormValid) on steps 1-4, Finish on step 5.
  const handleFormSubmit = () => {
    if (step < 5) {
      if (isFormValid()) handleNext();
    } else {
      handleFinish();
    }
  };

  const totalStorage = formData.genericVolSize + formData.logVolSize + formData.volumes.reduce((a, v) => a + v.size, 0);


  /* ─── LOADING view ─── */
  if (isLoading) {
    return (
      <Modal isOpen title={CM.createDatabase} icon="add_circle" onClose={handleClose} maxWidth="600px">
        <ModalStatusLoading
          title={CM.createDatabase}
          subtitle={getCmsJobLoadingSubtitle(formData.dbName, jobStatus, CM)}
          onBackground={() => { background(); handleClose(); }}
        />
      </Modal>
    );
  }

  /* ─── SUCCESS view ─── */
  if (isSuccess) {
    return (
      <Modal
        isOpen
        title={CM.createDatabase}
        icon={creationWarning ? 'warning' : 'add_circle'}
        iconVariant={creationWarning ? 'warning' : 'success'}
        onClose={handleClose}
        maxWidth="600px"
        testId="create-database"
      >
        <ModalStatusSuccess
          title={CM.success}
          message={
            creationWarning
              ? CM.createDbPartialWarningMsg(formData.dbName, creationWarning)
              : CM.createDbJobComplete(CM.createDatabase)
          }
          onConfirm={handleClose}
          confirmText={CM.ok}
        />
      </Modal>
    );
  }

  /* ─── ERROR view ─── */
  if (isError) {
    return (
      <Modal isOpen title={CM.createDatabase} icon="add_circle" iconVariant="danger" onClose={resetAction} maxWidth="600px" testId="create-database">
        <ModalStatusError
          title={CM.failure}
          error={error}
          guidance={CM.createDbGuidance}
          onRetry={handleFinish}
          onCancel={resetAction}
          cancelText={CM.close}
        />
      </Modal>
    );
  }

  /* ─── FORM view ─── */
  return (
    <Modal
      isOpen={isCreateDatabaseModalOpen}
      onClose={handleClose}
      title={CM.createDatabase}
      subtitle={CM.createDatabaseMsg}
      icon="add_circle"
      maxWidth="780px"
      testId="create-database"
      onSubmit={handleFormSubmit}
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-1.5">
            {steps.map(s => (
              <div
                key={s.id}
                className={`rounded-full transition-all duration-300 ${
                  step === s.id ? 'w-5 h-1.5 bg-amber-500' :
                  step > s.id ? 'w-1.5 h-1.5 bg-amber-500/40' :
                  'w-1.5 h-1.5 bg-slate-200 dark:bg-white/10'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button data-testid="create-database-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
            {step > 1 && (
              <Button data-testid="create-database-back-btn" variant="outline" onClick={handleBack}>
                {CM.back}
              </Button>
            )}
            {step < 5 ? (
              <Button
                data-testid="create-database-next-btn"
                variant="primary"
                onClick={handleNext}
                disabled={!isFormValid()}
                icon="chevron_right"
                iconPosition="right"
                className="min-w-[140px]"
              >
                {CM.next}
              </Button>
            ) : (
              <Button data-testid="create-database-finish-btn" variant="primary" onClick={handleFinish} icon="done_all" className="min-w-[140px]">
                {CM.finish}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-0">
        {/* Step Track */}
        <div className="mb-6">
          {/* Step nodes */}
          <div className="flex items-center">
            {steps.map((s, idx) => {
              const isActive  = step === s.id;
              const isDone    = step > s.id;
              const isLast    = idx === steps.length - 1;
              return (
                <React.Fragment key={s.id}>
                  {/* Node column */}
                  <div className="flex flex-col items-center shrink-0" style={{ minWidth: 0 }}>
                    {/* Pill */}
                    <div className={`relative w-9 h-9 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 ${
                      isDone
                        ? 'bg-amber-500 border-amber-500 text-white shadow-[0_0_14px_rgba(245,158,11,0.3)]'
                        : isActive
                        ? 'bg-amber-500/10 border-amber-500 text-amber-500 shadow-[0_0_16px_rgba(245,158,11,0.2)]'
                        : 'bg-transparent border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-600'
                    }`}>
                      <Icon
                        name={isDone ? 'check' : s.icon}
                        size={isDone ? '13px' : '15px'}
                        weight={isDone ? 700 : 300}
                      />
                      {isActive && (
                        <span className="absolute inset-0 rounded-2xl border-2 border-amber-500/50 animate-ping opacity-50" />
                      )}
                    </div>
                    {/* Label — only under active step */}
                    <div className="h-8 flex flex-col items-center justify-center mt-1.5">
                      {isActive && (
                        <span className="text-11 font-black capitalize tracking-widest text-amber-500 text-center leading-tight animate-in fade-in slide-in-from-top-1 duration-200 px-1">
                          {s.label}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Connector line */}
                  {!isLast && (
                    <div className="flex-1 mx-2 mb-7">
                      <div className="relative h-px">
                        <div className="absolute inset-0 bg-slate-100 dark:bg-white/6 rounded-full" />
                        <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-600 ease-in-out ${
                          isDone ? 'right-0 bg-gradient-to-r from-amber-500/60 to-amber-400/40' : 'right-full'
                        }`} />
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* STEP 1: General Info */}
        {step === 1 && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-white/2 border border-slate-100 dark:border-white/5 rounded-2xl p-4">
            <SectionHeader title={CM.wizardGeneral} icon="settings" className="mb-4" />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  data-testid="create-database-name-input"
                  label={CM.databaseName}
                  value={formData.dbName}
                  onChange={(e) => handleInputChange('dbName', e.target.value)}
                  placeholder="e.g. production_db"
                  icon="database"
                />
                <Select
                  label={CM.pageSize}
                  value={formData.pageSize}
                  onChange={(e) => handleInputChange('pageSize', parseInt(e.target.value))}
                  options={PAGE_SIZES.map(s => ({ value: s, label: `${s / 1024} KB` }))}
                />
              </div>
            </div>

            <div className="bg-white dark:bg-white/2 border border-slate-100 dark:border-white/5 rounded-2xl p-4">
            <SectionHeader title={CM.localeCharset} icon="language" className="mb-4" />
              <Select
                label={CM.regionLocale}
                value={formData.locale}
                onChange={(e) => handleInputChange('locale', e.target.value)}
                options={locales}
              />
              {formData.locale === 'user_defined' && (
                <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Input
                    label={CM.userDefined}
                    value={formData.userDefinedLocale}
                    onChange={(e) => handleInputChange('userDefinedLocale', e.target.value)}
                    placeholder="e.g. de_DE.utf8"
                  />
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-white/2 border border-slate-100 dark:border-white/5 rounded-2xl p-4">
            <SectionHeader title={CM.genericVolInfo} icon="folder_open" className="mb-4" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3 p-4 bg-slate-50/50 dark:bg-white/3 border border-slate-200 dark:border-white/5 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-13 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                       <Icon name="storage" size="15px" weight={400} className="text-amber-500" />
                      {CM.genericVolume}
                    </span>
                    <span className="text-11 font-black uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-sm border border-amber-500/20">{CM.systemBadge}</span>
                  </div>
                  <Input data-testid="create-database-generic-path-input" label={CM.genericVolPath} value={formData.genericVolPath} onChange={(e) => handleInputChange('genericVolPath', e.target.value)} size="sm" />
                  <Input data-testid="create-database-generic-size-input" label={CM.volumeSize} type="number" value={formData.genericVolSize} onChange={(e) => handleInputChange('genericVolSize', Number(e.target.value))} size="sm" />
                </div>

                <div className="space-y-3 p-4 bg-slate-50/50 dark:bg-white/3 border border-slate-200 dark:border-white/5 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-13 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Icon name="history" size="15px" weight={400} className="text-amber-500" />
                      {CM.logVolume}
                    </span>
                    <span className="text-11 font-black uppercase bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded-sm border border-rose-500/20">{CM.criticalBadge}</span>
                  </div>
                  <Input label={CM.logVolPath} value={formData.logVolPath} onChange={(e) => handleInputChange('logVolPath', e.target.value)} size="sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input data-testid="create-database-log-size-input" label={CM.volumeSize} type="number" value={formData.logVolSize} onChange={(e) => handleInputChange('logVolSize', Number(e.target.value))} size="sm" />
                    <Select label={CM.logPageSize} value={formData.logPageSize} onChange={(e) => handleInputChange('logPageSize', parseInt(e.target.value))} options={PAGE_SIZES.map(s => ({ value: s, label: `${s / 1024}K` }))} size="sm" />
                  </div>
                </div>
              </div>
            </div>

            <div
              data-testid="create-database-autostart-toggle"
              className={`flex items-center justify-between p-4 border rounded-2xl transition-all duration-200 cursor-pointer select-none
                ${formData.autoStart ? 'bg-amber-500/5 border-amber-500/20' : 'bg-white dark:bg-white/2 border-slate-100 dark:border-white/5'}`}
              onClick={() => handleInputChange('autoStart', !formData.autoStart)}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${formData.autoStart ? 'bg-amber-500 text-white border-amber-400' : 'bg-slate-100 dark:bg-white/5 border-transparent text-slate-400'}`}>
                  <Icon name={formData.autoStart ? 'flash_on' : 'flash_off'} size="sm" weight={300} />
                </div>
                <div>
                  <Typography variant="p" className={`text-14 font-bold transition-colors ${formData.autoStart ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>{CM.startAfterCreationLabel}</Typography>
                  <Typography variant="caption" className="text-slate-400 font-medium leading-none">{CM.startAfterCreationDesc}</Typography>
                </div>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <Toggle checked={formData.autoStart} onChange={(v) => handleInputChange('autoStart', v)} color="amber" />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Volumes */}
        {step === 2 && (
          <div className="animate-in fade-in duration-200 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Typography variant="h4" className="text-16 font-bold text-slate-800 dark:text-white">{CM.wizardAdditionalVol}</Typography>
                <Typography variant="p" className="text-13 text-slate-500 font-medium">{CM.extraVolumesDesc}</Typography>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={addVolume}
                icon="add_box"
              >
                {CM.addVolume}
              </Button>
            </div>

            <div className="max-h-[380px] overflow-y-auto pr-1 space-y-4 custom-scrollbar">
              {formData.volumes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center border border-dashed border-slate-200 dark:border-white/10 rounded-2xl bg-slate-50/30 dark:bg-white/[0.01]">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-slate-500">
                    <Icon name="storage" size="md" weight={300} />
                  </div>
                  <div>
                    <p className="text-15 font-semibold text-slate-600 dark:text-slate-400">{CM.noAdditionalVolumesMsg}</p>
                    <p className="text-12 text-slate-400 dark:text-slate-500 mt-1">{CM.clickAddVolumeHint}</p>
                  </div>
                </div>
              ) : (
                formData.volumes.map((vol, idx) => (
                  <div key={idx} className="p-3.5 bg-white dark:bg-white/2 border border-slate-100 dark:border-white/5 rounded-xl space-y-3 hover:border-amber-500/25 dark:hover:border-amber-500/25 transition-all duration-200 group">
                    
                    {/* Card Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon name="storage" size="15px" className="text-amber-500 shrink-0" />
                        <span className="text-13 font-bold text-slate-700 dark:text-slate-300">
                          {CM.volumeNumberLabel(idx + 1)}
                        </span>
                        <span className="text-11 font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 dark:border-blue-500/30 px-1.5 py-0.5 rounded-md">
                          {CM.permanent}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeVolume(idx)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-rose-500 bg-rose-500/5 hover:bg-rose-500/15 transition-all cursor-pointer border border-transparent hover:border-rose-500/10"
                        title={CM.removeVolume}
                      >
                        <Icon name="delete_outline" size="sm" weight={300} />
                      </button>
                    </div>

                    {/* Card Content Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_2fr] gap-3">
                      <Input
                        value={vol.name}
                        onChange={(e) => handleVolumeChange(idx, 'name', e.target.value)}
                        size="sm"
                        placeholder={CM.identifier}
                        className="font-mono text-13"
                      />
                      <Input
                        type="number"
                        value={vol.unit === 'GB' ? parseFloat((vol.size / 1024).toFixed(3)) : vol.size}
                        onChange={(e) => {
                          const parsed = Number(e.target.value) || 0;
                          handleVolumeChange(idx, 'size', vol.unit === 'GB' ? parsed * 1024 : parsed);
                        }}
                        size="sm"
                        min={0}
                        placeholder={CM.sizeMb}
                        suffix={
                          <button
                            type="button"
                            onClick={() => handleVolumeChange(idx, 'unit', vol.unit === 'GB' ? 'MB' : 'GB')}
                            className="text-12 font-black text-slate-400 dark:text-slate-500 hover:text-amber-500 uppercase tracking-widest bg-slate-100 dark:bg-white/5 hover:bg-amber-500/10 px-2 py-0.5 rounded-md border border-slate-200/50 dark:border-white/5 hover:border-amber-500/30 transition-all cursor-pointer"
                            title={CM.switchUnit}
                          >
                            {vol.unit === 'GB' ? 'GB' : 'MB'}
                          </button>
                        }
                      />
                      <Input
                        value={vol.path}
                        onChange={(e) => handleVolumeChange(idx, 'path', e.target.value)}
                        size="sm"
                        placeholder={CM.absolutePath}
                        className="font-mono text-12"
                        title={vol.path}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Automation Settings */}
        {step === 3 && (
          <div className="animate-in fade-in duration-200 space-y-4">

            {/* Header card */}
            <div className="flex items-start gap-4 p-4 bg-white dark:bg-white/2 border border-slate-100 dark:border-white/5 rounded-2xl">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Icon name="auto_mode" size="sm" weight={300} className="text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-15 font-bold text-slate-800 dark:text-slate-100">{CM.autoVolumeExpansionTitle}</p>
                <p className="text-13 text-slate-400 font-medium mt-0.5">
                  {CM.autoVolumeExpansionDesc}
                </p>
              </div>
            </div>

            {/* PERMANENT volume policy */}
            <div className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
              formData.autoAddVol.permanent === 'ON'
                ? 'bg-white dark:bg-white/2 border-amber-500/20'
                : 'bg-slate-50/50 dark:bg-white/1 border-slate-100 dark:border-white/5'
            }`}>
              <div className={`flex items-center justify-between px-4 py-3 border-b transition-all duration-300 ${
                formData.autoAddVol.permanent === 'ON'
                  ? 'border-amber-500/10 bg-amber-500/[0.03]'
                  : 'border-transparent'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all duration-300 ${
                    formData.autoAddVol.permanent === 'ON'
                      ? 'bg-amber-500/10 border-amber-500/25 text-amber-500'
                      : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/8 text-slate-400'
                  }`}>
                    <Icon name="database" size="sm" weight={300} />
                  </div>
                  <div>
                    <p className={`text-14 font-bold uppercase leading-tight transition-colors ${
                      formData.autoAddVol.permanent === 'ON' ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-600'
                    }`}>{CM.permanent}</p>
                    <p className="text-11 text-slate-400 font-mono">{CM.dataIndexAutoExpansionPolicy}</p>
                  </div>
                </div>
                <Toggle
                  checked={formData.autoAddVol.permanent === 'ON'}
                  onChange={(v) => handleAutoAddVolChange('permanent', v ? 'ON' : 'OFF')}
                  size="sm"
                  color="amber"
                />
              </div>

              <div className={`px-4 py-4 transition-all duration-300 ${formData.autoAddVol.permanent !== 'ON' ? 'opacity-30 pointer-events-none' : ''}`}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-12 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {CM.warningThresholdLabel}
                    </label>
                    <Input
                      value={formData.autoAddVol.warn}
                      onChange={(e) => handleAutoAddVolChange('warn', e.target.value)}
                      size="sm"
                      placeholder="e.g. 0.15"
                    />
                    <p className="text-11 text-slate-400">{CM.ratioHintText}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-12 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {CM.extensionSizeLabel}
                    </label>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        value={formData.autoAddVol.extSize}
                        onChange={(e) => handleAutoAddVolChange('extSize', e.target.value)}
                        size="sm"
                        placeholder="e.g. 512"
                        className="flex-1"
                      />
                      <div className="w-[80px] shrink-0">
                        <Select
                          size="sm"
                          value={formData.autoAddVol.extUnit}
                          options={['MB', 'GB'].map(u => ({ value: u, label: u }))}
                          onChange={(e) => handleAutoAddVolChange('extUnit', e.target.value)}
                          className="w-full"
                        />
                      </div>
                    </div>
                    <p className="text-11 text-slate-400">{CM.pagesPerExtensionDesc}</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* STEP 4: Access Control */}
        {step === 4 && (
          <div className="animate-in fade-in duration-200 space-y-6 max-w-sm mx-auto py-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-[0_8px_32px_rgba(255,193,7,0.1)]">
                <Icon name="admin_panel_settings" size="lg" weight={300} />
              </div>
              <div className="space-y-1">
                <Typography variant="h4" className="text-18 font-bold text-slate-800 dark:text-white">{CM.wizardSetDbaPass}</Typography>
                <Typography variant="p" className="text-13 text-slate-500 font-medium">{CM.dbaPasswordSetupDesc}</Typography>
              </div>
            </div>

            <div className="space-y-4">
              <Input
                data-testid="create-database-dba-password-input"
                type="password"
                label={CM.password}
                value={formData.dbaPassword}
                onChange={(e) => handleInputChange('dbaPassword', e.target.value)}
                placeholder={CM.leaveBlankNoPassword}
                icon="key"
              />
              <Input
                data-testid="create-database-confirm-password-input"
                type="password"
                label={CM.passwordConfirm}
                value={formData.confirmPassword}
                onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                placeholder={CM.repeatPassword}
                icon="verified_user"
                error={(formData.confirmPassword && formData.dbaPassword !== formData.confirmPassword) ? CM.passwordsDoNotMatch : ""}
              />
            </div>
          </div>
        )}

        {/* STEP 5: Commisioning Review */}
        {step === 5 && (
          <div className="animate-in fade-in duration-200 space-y-5">
            <InfoBanner title={CM.wizardDbInfo}>
              {CM.reviewConfigBeforeCreateDesc}
            </InfoBanner>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white dark:bg-white/2 border border-slate-200 dark:border-white/8 rounded-2xl">
                <SectionHeader title={CM.configuration} icon="tune" className="mb-4" />
                <div className="space-y-0.5 mt-1">
                  <SummaryRow label={CM.databaseName} value={formData.dbName} accent />
                  <SummaryRow label={CM.pageSize} value={`${formData.pageSize / 1024} KB`} />
                  <SummaryRow label={CM.localeCharset} value={formData.locale === 'user_defined' ? formData.userDefinedLocale : formData.locale.split('.')[0]} />
                  <SummaryRow label={CM.autoStart} value={formData.autoStart ? CM.yes : CM.no} />
                </div>
              </div>

              <div className="p-4 bg-white dark:bg-white/2 border border-slate-200 dark:border-white/8 rounded-2xl">
                <SectionHeader title={CM.storage} icon="hard_drive" className="mb-4" />
                <div className="space-y-0.5 mt-1">
                  <SummaryRow label={CM.totalVolumes} value={`${formData.volumes.length + 2}`} />
                  <SummaryRow label={CM.genericVolume} value={`${formData.genericVolSize} MB`} />
                  <SummaryRow label={CM.logVolume} value={`${formData.logVolSize} MB`} />
                  <div className="py-2 border-b border-slate-100 dark:border-white/4">
                    <span className="text-13 text-slate-500 dark:text-slate-400 font-medium block mb-1">{CM.genericVolPath}</span>
                    <span
                      title={formData.genericVolPath}
                      className="text-12 font-bold font-mono text-slate-700 dark:text-slate-200 break-all"
                    >
                      {formData.genericVolPath}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-3 mt-1.5 border-t border-slate-100 dark:border-white/4">
                    <span className="text-13 font-black text-slate-500 uppercase tracking-widest">{CM.totalLabel}</span>
                    <span className="text-18 font-black font-mono text-emerald-500 tracking-tight">{totalStorage} MB</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-white/2 border border-slate-200 dark:border-white/8 rounded-2xl">
              <SectionHeader title={CM.wizardAutoVol} icon="auto_mode" className="mb-3" />
              <div className={`rounded-xl border transition-all ${
                formData.autoAddVol.permanent === 'ON'
                  ? 'bg-amber-500/[0.03] border-amber-500/15'
                  : 'bg-slate-50 dark:bg-white/2 border-slate-100 dark:border-white/5'
              }`}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-inherit">
                  <div className="flex items-center gap-2">
                    <Icon name="database" size="sm" weight={300} className={formData.autoAddVol.permanent === 'ON' ? 'text-amber-500' : 'text-slate-400'} />
                    <span className="text-13 font-bold uppercase text-slate-700 dark:text-slate-300">{CM.permanent}</span>
                  </div>
                  <span className={`text-11 font-black px-2 py-0.5 rounded-md border ${
                    formData.autoAddVol.permanent === 'ON'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-slate-500/10 text-slate-500 border-slate-500/15'
                  }`}>{formData.autoAddVol.permanent}</span>
                </div>
                <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-white/5">
                  <div className="px-4 py-3">
                    <p className="text-11 font-semibold uppercase tracking-wider text-slate-400 mb-1">{CM.warningThresholdLabel}</p>
                    <p className="text-15 font-black font-mono text-slate-700 dark:text-slate-200">{formData.autoAddVol.warn}</p>
                    <p className="text-11 text-slate-400 mt-0.5">{CM.ratioSuffixLabel}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-11 font-semibold uppercase tracking-wider text-slate-400 mb-1">{CM.extensionSizeLabel}</p>
                    <p className="text-15 font-black font-mono text-slate-700 dark:text-slate-200">{formData.autoAddVol.extSize} {formData.autoAddVol.extUnit}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-slate-100 dark:border-white/8 rounded-2xl overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-slate-50/50 dark:bg-white/3 border-b border-slate-100 dark:border-white/8">
                <SectionHeader title={CM.wizardAdditionalVol} icon="storage" className="mb-4" />
              </div>
              <div className="divide-y divide-slate-100 dark:divide-white/4 max-h-[160px] overflow-y-auto custom-scrollbar">
                {[
                  { name: `${formData.dbName}_primary`, type: 'generic', size: formData.genericVolSize },
                  { name: `${formData.dbName}_log`, type: 'generic', size: formData.logVolSize },
                  ...formData.volumes
                ].map((vol, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/50 dark:hover:bg-white/2 transition-colors">
                    <Icon name="storage" size="15px" weight={300} className="text-slate-400 shrink-0" />
                    <span className="text-13 font-mono font-bold text-slate-600 dark:text-slate-300 flex-1 truncate">{vol.name}</span>
                    <span className={`text-11 font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border leading-tight ${typeBadge('data')}`}>
                      {CM.permanent}
                    </span>
                    <span className="text-13 font-black font-mono text-slate-700 dark:text-slate-300 w-16 text-right tabular-nums">{vol.size} MB</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
