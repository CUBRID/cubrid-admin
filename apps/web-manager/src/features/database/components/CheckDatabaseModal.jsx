import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeCheckDatabaseModal } from '../databaseSlice';
import { databaseJobApi } from '../databaseJobApi';
import { useCmsJob } from '../../../infrastructure/hooks/useCmsJob';
import { getCmsJobLoadingSubtitle } from '../../../infrastructure/cmsJob/cmsJobUi';
import { MaintenanceDetails } from '../../../infrastructure/cmsJob/MaintenanceDetails';
import { getCmsJobErrorResult } from '../../../infrastructure/cmsJob/cmsJobUtils';
import { useCM } from '../../../constants/useCM';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Toggle } from '../../../components/ds/forms/Toggle';
import { Typography } from '../../../components/ds/foundation/Typography';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import {
  ModalStatusLoading,
  ModalStatusError,
} from '../../../components/ds/feedback/ActionStatus';

export default function CheckDatabaseModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isCheckDatabaseModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);

  const { error, startAction, endError, resetAction, isLoading, isError } =
    useActionState();
  const { runJob, background, wasBackgrounded } = useCmsJob({ sharedResult: true });
  const [jobStatus, setJobStatus] = useState(null);
  const [resultJob, setResultJob] = useState(null);
  const [repair, setRepair] = useState(false);

  useEffect(() => {
    if (isCheckDatabaseModalOpen) {
      setRepair(false);
      setResultJob(null);
      setJobStatus(null);
      resetAction();
    }
  }, [isCheckDatabaseModalOpen, resetAction]);

  if (!isCheckDatabaseModalOpen) return null;

  const previewJob = {
    type: 'check',
    dbname: selectedDatabase,
    maintenanceSummary: {
      operation: 'consistency-check',
      scope: 'entire-database',
      repairRequested: repair,
    },
  };

  const handleCheck = async () => {
    if (!selectedHostUid || !selectedDatabase) return;
    startAction();
    setJobStatus(null);
    setResultJob(previewJob);
    let lastJob = previewJob;
    try {
      await runJob(
        () =>
          databaseJobApi.submitCheck(selectedHostUid, selectedDatabase, {
            repairdb: repair ? 'y' : 'n',
          }),
        { initialJob: { ...previewJob, jobStatus: 'queued' }, onProgress: (j) => { lastJob = j; setJobStatus(j.jobStatus ?? j.status); } }
      );
      if (!wasBackgrounded()) {
        handleClose();
      }
    } catch (err) {
      if (!wasBackgrounded()) {
        if (err?.job || err?.jobId || lastJob?.jobId || err?.cancelled) {
          handleClose();
          return;
        }
        setResultJob(getCmsJobErrorResult(err, lastJob, previewJob));
        endError(typeof err === 'string' ? err : err.message || CM.failure);
      }
    }
  };

  const handleClose = () => {
    dispatch(closeCheckDatabaseModal());
    resetAction();
  };

  if (isLoading) {
    return (
      <Modal isOpen title={CM.checkDatabase} icon="verified" onClose={handleClose} maxWidth="480px">
        <ModalStatusLoading
          title={CM.checkDatabase}
          subtitle={getCmsJobLoadingSubtitle(selectedDatabase, jobStatus, CM)}
          onBackground={() => { background(); handleClose(); }}
        />
        <MaintenanceDetails job={resultJob || previewJob} preview />
      </Modal>
    );
  }

  if (isError) {
    return (
      <Modal isOpen title={CM.checkDatabase} icon="verified" iconVariant="danger" onClose={resetAction} maxWidth="480px">
        <ModalStatusError
          title={resultJob?.outcomeUnknown ? CM.jobOutcomeUnknown : CM.failure}
          message={resultJob?.outcomeUnknown ? CM.jobOutcomeUnknownMessage : undefined}
          error={error}
          guidance={resultJob?.outcomeUnknown ? undefined : CM.checkDbGuidance}
          onRetry={resultJob?.outcomeUnknown ? undefined : handleCheck}
          onCancel={resetAction}
          cancelText={CM.close}
        >
          <MaintenanceDetails key={resultJob?.jobId} job={resultJob} />
        </ModalStatusError>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isCheckDatabaseModalOpen}
      onClose={handleClose}
      title={CM.checkDatabase}
      icon="verified"
      maxWidth="480px"
      testId="check-database"
      onSubmit={handleCheck}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button data-testid="check-database-cancel-btn" variant="secondary" onClick={handleClose}>{CM.cancel}</Button>
          <Button data-testid="check-database-run-btn" variant="primary" onClick={handleCheck} icon="play_circle">{CM.ok}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-3.5 py-3 bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/5 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Icon name="database" size="sm" weight={300} className="text-amber-500" />
          </div>
          <div className="min-w-0">
            <Typography variant="caption" className="text-slate-400 text-12 uppercase font-semibold">
              {CM.databaseName}
            </Typography>
            <Typography variant="p" className="font-bold text-15 text-slate-900 dark:text-white font-mono truncate">
              {selectedDatabase}
            </Typography>
          </div>
        </div>

        <Typography variant="p" className="text-14 text-slate-600 dark:text-slate-400 leading-relaxed">
          {CM.checkDatabaseDesc}
        </Typography>

        <div
          className={`flex items-center gap-3 px-3.5 py-3 border rounded-xl cursor-pointer select-none transition-all ${
            repair
              ? 'bg-amber-500/5 border-amber-500/25'
              : 'bg-white dark:bg-white/2 border-slate-100 dark:border-white/5 hover:border-slate-200'
          }`}
          onClick={() => setRepair(!repair)}
        >
          <Icon name="build" size="sm" weight={300} className={repair ? 'text-amber-500' : 'text-slate-400'} />
          <Typography variant="p" className={`flex-1 text-14 font-medium ${repair ? 'text-amber-600' : 'text-slate-800 dark:text-slate-100'}`}>
            {CM.repairWhenInconsistency}
          </Typography>
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle checked={repair} onChange={setRepair} />
          </div>
        </div>
        <MaintenanceDetails job={previewJob} preview />
      </div>
    </Modal>
  );
}
