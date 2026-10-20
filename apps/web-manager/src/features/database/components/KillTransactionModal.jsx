import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeKillTransactionModal, notifyTransactionKilled } from '../databaseSlice';
import { dbKey } from '../dbKey';
import { databaseApi } from '../databaseApi';
import { buildKillParameter, isHaReplicationProcess } from '../transactionUtils';
import { useCM } from '../../../constants/useCM';

import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { Typography } from '../../../components/ds/foundation/Typography';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import { ModalStatusLoading, ModalStatusSuccess, ModalStatusError } from '../../../components/ds/feedback/ActionStatus';

export default function KillTransactionModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isKillTransactionModalOpen, killTransactionData } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase, loggedInDatabases } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);

  // killtransaction only needs the DBA password (no username) to authorize
  // killing another user's transaction. CMS otherwise falls back to whatever
  // a prior "Login Database" cached server-side, which may be stale or
  // absent — sending it directly here takes priority over that cache.
  const alreadyLoggedIn = !!selectedDatabase && loggedInDatabases.includes(dbKey(selectedHostUid, selectedDatabase));

  const {
    error: actionError,
    startAction,
    endSuccess,
    endError,
    resetAction,
    isLoading,
    isSuccess,
    isError,
  } = useActionState();

  const [killType, setKillType] = useState('i');
  const [dbpasswd, setDbpasswd] = useState('');

  useEffect(() => {
    if (isKillTransactionModalOpen) {
      resetAction();
      setKillType('i');
      setDbpasswd('');
    }
  }, [isKillTransactionModalOpen, resetAction]);

  if (!isKillTransactionModalOpen || !killTransactionData) return null;

  const handleKill = async () => {
    if (!selectedHostUid || !selectedDatabase) return;

    startAction();

    try {
      const parameter = buildKillParameter(killType, killTransactionData);
      if (killType !== 'd' && !parameter) {
        endError(CM.killParamResolveErrorMsg);
        return;
      }

      await databaseApi.killTransaction(selectedHostUid, selectedDatabase, {
        type: killType,
        parameter,
        ...(dbpasswd && { dbpasswd }),
      });
      endSuccess();
      dispatch(notifyTransactionKilled());
    } catch (err) {
      endError(err?.response?.data?.note || err?.message || CM.error);
    }
  };

  const handleClose = () => dispatch(closeKillTransactionModal());

  const isHaTarget = isHaReplicationProcess(killTransactionData?.program || killTransactionData?.pname);

  if (isLoading) {
    return (
      <Modal isOpen title={CM.killTransactionTitle} icon="cancel" onClose={handleClose} maxWidth="520px" showCloseButton={false}>
        <ModalStatusLoading title={CM.killTransactionTitle} subtitle={CM.killTransactionTitle} />
      </Modal>
    );
  }

  if (isSuccess) {
    return (
      <Modal isOpen title={CM.killTransactionTitle} icon="verified" iconVariant="success" onClose={handleClose} maxWidth="520px">
        <ModalStatusSuccess
          title={CM.success}
          message={CM.killSuccess}
          onConfirm={handleClose}
          confirmText={CM.ok}
        />
      </Modal>
    );
  }

  if (isError) {
    return (
      <Modal isOpen title={CM.killTransactionTitle} icon="error" iconVariant="danger" onClose={resetAction} maxWidth="520px">
        <ModalStatusError
          title={CM.failure}
          error={actionError}
          guidance={CM.killTransactionGuidance}
          onRetry={handleKill}
          onCancel={resetAction}
          cancelText={CM.close}
        />
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isKillTransactionModalOpen}
      onClose={handleClose}
      title={CM.killTransactionTitle}
      subtitle={selectedDatabase ? `${CM.databaseName}: ${selectedDatabase}` : undefined}
      icon="cancel"
      maxWidth="520px"
      onSubmit={handleKill}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          <Button variant="danger" onClick={handleKill} icon="cancel">
            {CM.killTransaction}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {isHaTarget && (
          <InfoBanner variant="danger" title={CM.haReplicationProcessTitle}>
            {CM.haReplicationProcessWarning}
          </InfoBanner>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Typography variant="caption" className="text-slate-500 ml-1">{CM.userNameCol}</Typography>
            <Input value={killTransactionData['@user'] || killTransactionData['@uid'] || '-'} disabled size="sm" />
          </div>
          <div className="space-y-1">
            <Typography variant="caption" className="text-slate-500 ml-1">{CM.processId}</Typography>
            <Input value={killTransactionData.pid || '-'} disabled size="sm" />
          </div>
          <div className="space-y-1">
            <Typography variant="caption" className="text-slate-500 ml-1">{CM.host}</Typography>
            <Input value={killTransactionData.host || '-'} disabled size="sm" />
          </div>
          <div className="space-y-1">
            <Typography variant="caption" className="text-slate-500 ml-1">{CM.programName}</Typography>
            <Input value={killTransactionData.program || killTransactionData.pname || '-'} disabled size="sm" />
          </div>
        </div>

        <div className="space-y-2">
          <Typography variant="caption" className="text-slate-500 ml-1">{CM.killType}</Typography>
          <Select
            value={killType}
            onChange={(e) => setKillType(e.target.value)}
            options={[
              { value: 'i', label: CM.killSelectedOnly },
              { value: 'h', label: CM.killSameHost },
              { value: 'p', label: CM.killSameProgram },
            ]}
          />
        </div>

        <div className="space-y-1">
          <Typography variant="caption" className="text-slate-500 ml-1">{CM.dbaPassword}</Typography>
          <Input
            type="password"
            value={dbpasswd}
            onChange={(e) => setDbpasswd(e.target.value)}
            icon="password"
            placeholder={alreadyLoggedIn ? CM.alreadyLoggedInPlaceholder : CM.emptyAllowedPlaceholder}
          />
        </div>
      </div>
    </Modal>
  );
}
