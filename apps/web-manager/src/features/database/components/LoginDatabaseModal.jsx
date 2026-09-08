import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { loginDatabase, registerDatabase, closeLoginDatabaseModal, fetchBackupSchedule, fetchQueryPlan } from '../databaseSlice';
import { fetchDatabaseUsers } from '../../user/userSlice';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Toggle } from '../../../components/ds/forms/Toggle';
import { Typography } from '../../../components/ds/foundation/Typography';
import { useCM } from '../../../constants/useCM';

import { useActionState } from '../../../infrastructure/hooks/useActionState';
import {
  ModalStatusLoading,
  ModalStatusSuccess,
  ModalStatusError,
} from '../../../components/ds/feedback/ActionStatus';

export default function LoginDatabaseModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isLoginDatabaseModalOpen, loginDatabaseName } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);

  const {
    error,
    startAction,
    endSuccess,
    endError,
    resetAction,
    isLoading,
    isSuccess,
    isError,
  } = useActionState();

  const [formData, setFormData] = useState({ dbuser: 'dba', dbpasswd: '' });
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isLoginDatabaseModalOpen) {
      resetAction();
      setFormData({ dbuser: 'dba', dbpasswd: '' });
      setRememberMe(true);
      setShowPassword(false);
    }
  }, [isLoginDatabaseModalOpen, resetAction]);

  if (!isLoginDatabaseModalOpen) return null;

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!formData.dbuser) return;

    startAction();
    try {
      if (rememberMe) {
        dispatch(registerDatabase({
          hostUid: selectedHostUid,
          dbname: loginDatabaseName,
          payload: { id: formData.dbuser, password: formData.dbpasswd },
        }));
      }

      await dispatch(loginDatabase({
        hostUid: selectedHostUid,
        dbname: loginDatabaseName,
        payload: {
          id: formData.dbuser,
          password: formData.dbpasswd,
        },
      })).unwrap();

      dispatch(fetchDatabaseUsers({ hostUid: selectedHostUid, dbname: loginDatabaseName }));
      dispatch(fetchBackupSchedule({ hostUid: selectedHostUid, dbname: loginDatabaseName }));
      dispatch(fetchQueryPlan({ hostUid: selectedHostUid, dbname: loginDatabaseName }));

      endSuccess();
      setTimeout(() => dispatch(closeLoginDatabaseModal()), 800);
    } catch (err) {
      endError(typeof err === 'string' ? err : (err.message || CM.error));
    }
  };

  const handleClose = () => dispatch(closeLoginDatabaseModal());

  if (isLoading) {
    return (
      <Modal isOpen title={CM.loginDatabase} icon="lock" onClose={handleClose} maxWidth="440px" showCloseButton={false}>
        <ModalStatusLoading title={CM.loginDatabase} subtitle={CM.loggingInto(loginDatabaseName)} />
      </Modal>
    );
  }

  if (isSuccess) {
    return (
      <Modal isOpen title={CM.loginDatabase} icon="lock_open" iconVariant="success" onClose={handleClose} maxWidth="440px">
        <ModalStatusSuccess
          title={CM.success}
          message={CM.connectionSuccessful}
          onConfirm={handleClose}
          confirmText={CM.ok}
        />
      </Modal>
    );
  }

  if (isError) {
    return (
      <Modal isOpen title={CM.loginDatabase} icon="lock" iconVariant="danger" onClose={resetAction} maxWidth="440px">
        <ModalStatusError
          title={CM.error}
          error={error}
          guidance={CM.loginDatabaseGuidance}
          onRetry={handleLogin}
          onCancel={resetAction}
          cancelText={CM.close}
        />
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isLoginDatabaseModalOpen}
      onClose={handleClose}
      title={CM.loginDatabase}
      subtitle={CM.loginDatabaseMsg}
      icon="lock"
      maxWidth="440px"
      testId="login-database"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button data-testid="login-database-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          <Button data-testid="login-database-submit-btn" variant="primary" onClick={handleLogin} icon="login">{CM.ok}</Button>
        </div>
      }
    >
      <form onSubmit={handleLogin} className="space-y-4">
        <Input
          label={CM.databaseName}
          value={loginDatabaseName}
          disabled
          size="sm"
        />
        <Input
          label={CM.userName}
          value={formData.dbuser}
          onChange={(e) => handleInputChange('dbuser', e.target.value)}
          placeholder="dba"
          autoFocus
        />
        <Input
          type={showPassword ? 'text' : 'password'}
          label={CM.password}
          value={formData.dbpasswd}
          onChange={(e) => handleInputChange('dbpasswd', e.target.value)}
          icon="password"
          suffix={
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((s) => !s)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 flex items-center justify-center"
            >
              <Icon name={showPassword ? 'visibility_off' : 'visibility'} size="17px" weight={300} />
            </button>
          }
        />

        <div className="flex items-center justify-between gap-3 pt-1">
          <Typography variant="caption" className="text-slate-500">{CM.savePassword}</Typography>
          <Toggle variant="primary" checked={rememberMe} onChange={() => setRememberMe((v) => !v)} />
        </div>
      </form>
    </Modal>
  );
}
