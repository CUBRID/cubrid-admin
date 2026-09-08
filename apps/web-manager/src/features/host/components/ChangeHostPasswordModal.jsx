import { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { setHostPassword, editHost, loginToHostWithSideEffects, closeChangePasswordModal, clearHostError } from '../hostSlice';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';

export default function ChangeHostPasswordModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isChangePasswordModalOpen, changePasswordHostUid, hosts, loading, error: apiError } = useSelector((state) => state.host, shallowEqual);

  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isChangePasswordModalOpen) {
      setFormData({
        password: '',
        confirmPassword: '',
      });
      setErrors({});
      setIsSuccess(false);
    }
  }, [isChangePasswordModalOpen]);

  if (!isChangePasswordModalOpen) return null;

  const currentHost = hosts.find(h => h.uid === changePasswordHostUid);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    if (apiError) dispatch(clearHostError());
  };

  const validate = () => {
    const errs = {};
    if (!formData.password) errs.password = CM.passwordRequired;
    if (formData.password !== formData.confirmPassword) {
      errs.confirmPassword = CM.passwordsDoNotMatch;
    }
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    
    if (!currentHost) return;

    try {
      // 1. Change the passcode on the remote host (CUBRID CMS)
      // Aligned with api-server SetDbmtPasswdRequest structure: targetid, newpassword
      const payload = {
        targetid: currentHost.id,
        newpassword: formData.password,
      };
      
      await dispatch(setHostPassword({ hostUid: changePasswordHostUid, payload })).unwrap();

      // 2. Synchronize local connection settings in the manager without modifying api-server code
      const localPayload = {
        id: currentHost.id,
        address: currentHost.address,
        port: Number(currentHost.port),
        alias: currentHost.alias,
        password: formData.password, // Update with the new passcode
      };
      
      await dispatch(editHost({ hostUid: changePasswordHostUid, payload: localPayload })).unwrap();

      // 3. Finally revalidate host login so the session picks up the new credentials
      await dispatch(loginToHostWithSideEffects(changePasswordHostUid)).unwrap().catch(() => {});

      setIsSuccess(true);
    } catch (err) {
      console.error('Failed to update host password:', err);
    }
  };
  
  const handleClose = () => {
    dispatch(closeChangePasswordModal());
    dispatch(clearHostError());
    setIsSuccess(false);
  };

  return (
    <Modal
      isOpen={isChangePasswordModalOpen}
      onClose={handleClose}
      onSubmit={!isSuccess ? handleSubmit : undefined}
      title={isSuccess ? CM.success : CM.changeManagerPasscode}
      icon={isSuccess ? "check_circle" : "lock"}
      loading={loading}
      maxWidth="max-w-[440px]"
      testId="change-host-password"
      footer={
        isSuccess ? (
          <Button
            data-testid="change-host-password-close-btn"
            variant="primary"
            onClick={handleClose}
            className="w-full"
          >
            {CM.close}
          </Button>
        ) : (
          <>
            <Button
              data-testid="change-host-password-cancel-btn"
              variant="secondary"
              onClick={handleClose}
              disabled={loading}
            >
              {CM.cancel}
            </Button>
            <Button
              data-testid="change-host-password-submit-btn"
              variant="primary"
              onClick={handleSubmit}
              loading={loading}
              icon="verified_user"
              className="min-w-[120px]"
            >
              {CM.updatePasscode}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-6">
        {isSuccess ? (
          <div className="py-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
             <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
               <Icon name="check_circle" size="33px" className="text-emerald-500" />
             </div>
             <Typography variant="h3" className="text-lg font-bold text-slate-900 dark:text-white mb-2">{CM.passcodeUpdated}</Typography>
             <Typography variant="p" className="text-slate-500 dark:text-slate-400 max-w-[280px]">
               {CM.passcodeChangedSuccessMsg(currentHost?.alias || currentHost?.id)}
             </Typography>
          </div>
        ) : (
          <>
            {apiError && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-500/5 border border-rose-500/10 rounded-lg animate-in fade-in slide-in-from-top-1">
                <Icon name="error" size="sm" className="text-rose-500" weight={300} />
                <Typography variant="caption" className="text-rose-500 font-medium">{apiError}</Typography>
                <button onClick={() => dispatch(clearHostError())} className="ml-auto text-rose-500/50 hover:text-rose-500 transition-colors">
                  <Icon name="close" size="sm" weight={300} />
                </button>
              </div>
            )}

            <div className="relative overflow-hidden p-4 rounded-2xl border border-amber-500/15 bg-linear-to-r from-amber-500/8 via-amber-500/4 to-transparent dark:from-amber-500/10 dark:via-amber-500/5 dark:to-transparent flex items-start gap-4 shadow-xs">
              <div className="absolute right-0 top-0 w-32 h-full bg-linear-to-l from-amber-500/5 to-transparent pointer-events-none" />
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
                <Icon name="dns" size="md" className="text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <Typography variant="caption" className="font-bold text-amber-600/70 dark:text-amber-400/60 uppercase tracking-widest block mb-0.5">{CM.targetHost}</Typography>
                <Typography variant="span" className="text-sm font-black text-slate-900 dark:text-white truncate block tracking-tight font-mono">
                  {currentHost?.alias || currentHost?.id || 'N/A'}
                </Typography>
              </div>
            </div>

            <div className="space-y-4">
              <Input
                data-testid="change-host-password-new-input"
                label={CM.newPasscode}
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                error={errors.password}
                placeholder="••••••••"
                disabled={loading}
                icon="key"
                autoFocus
              />
              <Input
                data-testid="change-host-password-confirm-input"
                label={CM.verifyNewPasscode}
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                error={errors.confirmPassword}
                placeholder="••••••••"
                disabled={loading}
                icon="verified_user"
              />
            </div>
            
            <div className="flex items-start gap-3 p-3.5 bg-slate-50 dark:bg-white/2 border border-slate-200 dark:border-white/8 rounded-xl">
              <Icon name="info" size="sm" className="text-sky-500 shrink-0 mt-0.5" weight={300} />
              <Typography variant="caption" className="text-slate-500 font-medium leading-relaxed italic">
                {CM.passcodeUpdateNote}
              </Typography>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
