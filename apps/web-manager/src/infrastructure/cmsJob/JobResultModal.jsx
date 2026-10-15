import React from 'react';
import { Modal } from '../../components/ds/layout/Modal';
import { ModalStatusSuccess, ModalStatusError } from '../../components/ds/feedback/ActionStatus';
import { useCM } from '../../constants/useCM';
import { getCmsJobTypeLabel, getCmsJobGuidance } from './cmsJobLabels';
import { MaintenanceDetails } from './MaintenanceDetails';

export function JobResultModal({ result, onClose }) {
  const CM = useCM();
  const op = getCmsJobTypeLabel(result.type, CM);
  const db = result.dbname || '—';

  if (result.status === 'succeeded' && !result.outcomeUnknown) {
    return (
      <Modal
        isOpen
        title={op}
        icon="check_circle"
        iconVariant="success"
        onClose={onClose}
        maxWidth="480px"
        zIndexClass="z-[2100]"
        testId="job-result"
      >
        <ModalStatusSuccess
          title={result.successMessage || CM.jobNotifySucceeded(op, db)}
          message={db !== '—' ? `"${db}"` : undefined}
          onConfirm={onClose}
          confirmText={CM.ok}
        >
          <MaintenanceDetails key={result.jobId} job={result} />
        </ModalStatusSuccess>
      </Modal>
    );
  }

  const errMsg = result.errorMessage || result.error?.message;
  return (
    <Modal
      isOpen
      title={op}
      icon="error"
      iconVariant="danger"
      onClose={onClose}
      maxWidth="480px"
      zIndexClass="z-[2100]"
      testId="job-result"
    >
      <ModalStatusError
        title={result.outcomeUnknown ? CM.jobOutcomeUnknown : CM.jobNotifyFailed(op, db)}
        message={result.outcomeUnknown ? CM.jobOutcomeUnknownMessage : undefined}
        error={errMsg}
        guidance={result.outcomeUnknown ? undefined : getCmsJobGuidance(result.type, CM)}
        onCancel={onClose}
        cancelText={CM.dismiss}
      >
        <MaintenanceDetails key={result.jobId} job={result} />
      </ModalStatusError>
    </Modal>
  );
}
