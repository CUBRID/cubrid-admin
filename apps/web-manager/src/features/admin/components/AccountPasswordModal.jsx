import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Checkbox } from '../../../components/ds/forms/Checkbox';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';
import { requestErrorText } from '../../../infrastructure/errors/serverErrorText';
import { generateAccountPassword, isValidAccountPassword } from '../accountPasswordPolicy';

/**
 * Asks an administrator for a temporary password: for a new account
 * (`accountId` null: also its id and whether it is an administrator) or to
 * reset an existing one. The password is typed twice, or generated (shown
 * once, with Copy). `onSubmit({ id, password, role, generated })` does the
 * request; a failure is shown here and the dialog stays open.
 */
export default function AccountPasswordModal({ isOpen, accountId = null, onSubmit, onClose }) {
  const CM = useCM();
  const creating = accountId === null;
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // The generated password while it is in use; null when typed by hand.
  const [generated, setGenerated] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setId('');
      setPassword('');
      setConfirm('');
      setMakeAdmin(false);
      setBusy(false);
      setError(null);
      setGenerated(null);
      setCopied(false);
    }
  }, [isOpen, accountId]);

  if (!isOpen) return null;

  // Same rule as the sign-up page.
  const idProblem = creating && id.trim().length > 0 && id.trim().length < 3 ? CM.minChars3 : null;
  const passwordOk = isValidAccountPassword(password);
  const canSubmit =
    !busy &&
    (!creating || id.trim().length >= 3) &&
    passwordOk &&
    password === confirm;

  const generate = () => {
    const next = generateAccountPassword();
    setGenerated(next);
    setPassword(next);
    setConfirm(next);
    setCopied(false);
  };
  const typeOwn = () => {
    setGenerated(null);
    setPassword('');
    setConfirm('');
    setCopied(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
    } catch {
      // No clipboard (insecure origin, denied): select it to copy by hand.
      const range = document.createRange();
      const node = document.querySelector('[data-testid="admin-generated-password"]');
      if (node) {
        range.selectNodeContents(node);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        id: creating ? id.trim() : accountId,
        password,
        role: makeAdmin ? 'admin' : 'user',
        generated: generated !== null,
      });
    } catch (err) {
      setError(requestErrorText(err, CM));
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => undefined : onClose}
      showCloseButton={!busy}
      title={creating ? CM.createAccountBtn : CM.resetAccountPasswordBtn}
      subtitle={creating ? undefined : accountId}
      icon={creating ? 'person_add' : 'lock_reset'}
      maxWidth="max-w-[420px]"
      testId={creating ? 'admin-create-account' : 'admin-reset-password'}
      zIndexClass="z-[2050]"
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {CM.cancel}
          </Button>
          <Button
            data-testid="admin-account-password-submit-btn"
            icon={creating ? 'person_add' : 'lock_reset'}
            loading={busy}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {creating ? CM.createAccountBtn : CM.resetAccountPasswordBtn}
          </Button>
        </>
      }
    >
      <div className="space-y-3 p-1">
        {error && (
          <div role="alert" className="flex items-start gap-3 px-4 py-3 bg-rose-500/5 border border-rose-500/15 rounded-xl">
            <Icon name="error_outline" size="sm" weight={300} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-13 text-rose-500 font-medium flex-1 leading-relaxed">{error}</p>
          </div>
        )}

        {creating && (
          <Input
            data-testid="admin-account-id-input"
            label={CM.userIdLabel}
            icon="badge"
            value={id}
            onChange={(e) => setId(e.target.value)}
            disabled={busy}
            error={idProblem}
            autoFocus
          />
        )}
        {generated !== null ? (
          <div>
            <p className="text-13 font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{CM.temporaryPasswordLabel}</p>
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <Icon name="key" size="17px" weight={300} className="text-amber-500 shrink-0" />
              <code data-testid="admin-generated-password" className="flex-1 min-w-0 font-mono text-15 tracking-wider text-slate-800 dark:text-slate-100 break-all select-all">
                {generated}
              </code>
              <Button size="sm" variant="outline" icon={copied ? 'check' : 'content_copy'} data-testid="admin-copy-password" onClick={copy} disabled={busy}>
                {copied ? CM.copiedLabel : CM.copyPasswordBtn}
              </Button>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <button type="button" data-testid="admin-regenerate-password" onClick={generate} disabled={busy} className="inline-flex items-center gap-1 text-12 font-bold text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50">
                <Icon name="autorenew" size="14px" weight={300} />
                {CM.regeneratePasswordBtn}
              </button>
              <button type="button" data-testid="admin-type-own-password" onClick={typeOwn} disabled={busy} className="text-12 font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:underline disabled:opacity-50">
                {CM.typeOwnPasswordBtn}
              </button>
            </div>
            <p className="text-12 text-amber-600 dark:text-amber-400 mt-2">{CM.generatedPasswordHint}</p>
          </div>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <Input
                  data-testid="admin-account-password-input"
                  type="password"
                  label={CM.temporaryPasswordLabel}
                  icon={password && passwordOk ? 'verified_user' : 'key'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  placeholder="••••••••"
                  error={password && !passwordOk ? CM.passwordPolicyHint : null}
                  autoFocus={!creating}
                />
              </div>
              <Button
                variant="outline"
                icon="password"
                data-testid="admin-generate-password"
                onClick={generate}
                disabled={busy}
                className={password && !passwordOk ? 'mb-6' : ''}
              >
                {CM.generatePasswordBtn}
              </Button>
            </div>
            <Input
              data-testid="admin-account-password-confirm-input"
              type="password"
              label={CM.confirmNewPassword}
              icon="key_vertical"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
              placeholder="••••••••"
              error={confirm && password !== confirm ? CM.passwordsDoNotMatch : null}
            />
          </>
        )}
        {creating && (
          <Checkbox
            data-testid="admin-account-admin-checkbox"
            label={CM.administratorLabel}
            checked={makeAdmin}
            onChange={(e) => setMakeAdmin(e.target.checked)}
            disabled={busy}
          />
        )}
        <p className="text-12 text-slate-400 leading-relaxed">{CM.temporaryPasswordHint}</p>
      </div>
    </Modal>
  );
}
