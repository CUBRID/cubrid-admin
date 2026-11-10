import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { useCM } from '../../../constants/useCM';

/**
 * The password a workspace export is locked with: entered twice to export
 * (`confirm`), once to import. `error` is shown under the password.
 */
export default function WorkspacePasswordDialog({ isOpen, title, submitLabel, confirm = false, busy = false, error = '', onSubmit, onCancel, testId }) {
  const CM = useCM();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [mismatch, setMismatch] = useState(false);

  // A new dialog starts empty; nothing typed is kept once it closes.
  useEffect(() => {
    setPassword('');
    setAgain('');
    setMismatch(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit = !busy && password.length > 0 && (!confirm || again.length > 0);
  const submit = () => {
    if (!canSubmit) return;
    if (confirm && password !== again) {
      setMismatch(true);
      return;
    }
    onSubmit(password);
  };

  return (
    <Modal
      isOpen
      onClose={onCancel}
      onSubmit={submit}
      submitDisabled={!canSubmit}
      title={title}
      icon="lock"
      maxWidth="max-w-[440px]"
      testId={testId}
      footer={(
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>{CM.cancel}</Button>
          <Button data-testid={`${testId}-submit-btn`} variant="primary" onClick={submit} disabled={!canSubmit}>{submitLabel}</Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <Input
          data-testid={`${testId}-password-input`}
          label={CM.workspaceArchivePassword}
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setMismatch(false); }}
          error={confirm ? undefined : error || undefined}
          disabled={busy}
          autoFocus
        />
        {confirm && (
          <Input
            data-testid={`${testId}-confirm-input`}
            label={CM.workspaceArchivePasswordConfirm}
            type="password"
            value={again}
            onChange={(e) => { setAgain(e.target.value); setMismatch(false); }}
            error={mismatch ? CM.workspaceArchivePasswordMismatch : error || undefined}
            disabled={busy}
          />
        )}
      </div>
    </Modal>
  );
}
