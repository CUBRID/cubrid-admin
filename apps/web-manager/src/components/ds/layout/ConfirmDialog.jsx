import React from 'react';
import { Modal } from './Modal';
import { Button } from '../foundation/Button';
import { Typography } from '../foundation/Typography';
import { useCM } from '../../../constants/useCM';

export const ConfirmDialog = ({
  isOpen,
  title,
  description,
  confirmLabel = null,
  cancelLabel = null,
  variant = 'primary',
  onConfirm,
  onCancel,
  testId,
}) => {
  const CM = useCM();
  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';
  const resolvedConfirmLabel = confirmLabel ?? CM.confirm;
  const resolvedCancelLabel = cancelLabel ?? CM.cancel;

  const footer = (
    <>
      <Button data-testid={testId && `${testId}-cancel-btn`} variant="outline" onClick={onCancel}>
        {resolvedCancelLabel}
      </Button>
      <Button data-testid={testId && `${testId}-confirm-btn`} variant={isDanger ? 'danger' : 'primary'} onClick={onConfirm}>
        {resolvedConfirmLabel}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      icon={isDanger || isWarning ? 'warning' : 'info'}
      iconVariant={isDanger ? 'danger' : isWarning ? 'warning' : 'primary'}
      footer={footer}
      maxWidth="max-w-md"
      testId={testId}
    >
      <Typography variant="p" className="text-sm text-slate-600 dark:text-slate-400">
        {description}
      </Typography>
    </Modal>
  );
};
