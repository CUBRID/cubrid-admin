import { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeDeleteDatabaseModal, deleteDatabase, fetchDatabaseStartInfo } from '../databaseSlice';
import { databaseApi } from '../databaseApi';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Toggle } from '../../../components/ds/forms/Toggle';
import { Typography } from '../../../components/ds/foundation/Typography';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { Spinner } from '../../../components/ds/foundation/Spinner';
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

export default function DeleteDatabaseModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isDeleteDatabaseModalOpen: isDeleteDBModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase } = useSelector((state) => state.database, shallowEqual);
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

  const [step, setStep] = useState(1); // 1: Review, 2: Auth
  const [deleteBackup, setDeleteBackup] = useState(false);
  const [volumeInfo, setVolumeInfo] = useState([]);
  const [fetchingVolumes, setFetchingVolumes] = useState(false);
  const [dbId, setDbId] = useState('dba');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isDeleteDBModalOpen && selectedDatabase && selectedHostUid) {
      setStep(1);
      setDbId('dba');
      setPassword('');
      setDeleteBackup(false);
      resetAction();
      setFetchingVolumes(true);
      databaseApi.getVolumeInfo(selectedHostUid, selectedDatabase)
        .then(res => {
          if (res?.spaceinfo) {
            const pageSize = parseInt(res.pagesize || 0);
            setVolumeInfo(
              res.spaceinfo.map(item => ({
                name: item?.name || item?.spacename || '—',
                type: item?.type || '—',
                path: item?.path || item?.location || '—',
                sizeMB: item?.totalpage
                  ? ((parseInt(item.totalpage) * pageSize) / (1024 * 1024)).toFixed(1)
                  : '—',
                free: item?.freepage ?? '—',
              }))
            );
          }
        })
        .catch(() => {})
        .finally(() => setFetchingVolumes(false));
    }
  }, [isDeleteDBModalOpen, selectedDatabase, selectedHostUid, resetAction]);

  if (!isDeleteDBModalOpen) return null;

  const handleConfirm = async () => {
    if (step === 1) { 
      setStep(2); 
      return; 
    }

    startAction();
    try {
      const loginRes = await databaseApi.loginDatabase(selectedHostUid, selectedDatabase, {
        id: dbId, password,
      });
      if (loginRes.success || loginRes.status === 'success' || (!loginRes.error && !loginRes.code)) {
        await dispatch(deleteDatabase({
          hostUid: selectedHostUid,
          dbname: selectedDatabase,
          payload: { delbackup: deleteBackup ? 'y' : 'n' },
        })).unwrap();
        
        dispatch(fetchDatabaseStartInfo(selectedHostUid));
        endSuccess(CM.databaseDeletedMsg(selectedDatabase));
      } else {
        throw loginRes;
      }
    } catch (err) {
      endError(typeof err === 'string' ? err : (err.message || CM.authOrOperationFailedMsg));
    }
  };

  const handleClose = () => dispatch(closeDeleteDatabaseModal());

  const typeColors = {
    'Data': 'text-sky-500 bg-sky-500/8 border-sky-500/20',
    'Index': 'text-violet-500 bg-violet-500/8 border-violet-500/20',
    'Temp': 'text-amber-500 bg-amber-500/8 border-amber-500/20',
    'Active_log': 'text-emerald-500 bg-emerald-500/8 border-emerald-500/20',
    'Archive_log': 'text-slate-400 bg-slate-400/8 border-slate-400/20',
  };

  const getTypeStyle = (type) =>
    typeColors[type] || 'text-slate-400 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10';

  /* ─── LOADING view ─── */
  if (isLoading) {
    return (
      <Modal isOpen title={CM.dbaConfirm} icon="delete_forever" onClose={handleClose} maxWidth="440px" showCloseButton={false} testId="delete-database">
        <ModalStatusLoading
          title={CM.deletingDatabase}
          subtitle={selectedDatabase}
          variant="danger"
        />
      </Modal>
    );
  }

  /* ─── SUCCESS view ─── */
  if (isSuccess) {
    return (
      <Modal isOpen title={CM.deleteSuccessful} icon="delete_forever" iconVariant="success" onClose={handleClose} maxWidth="440px" testId="delete-database">
        <ModalStatusSuccess
          title={CM.success}
          message={selectedDatabase}
          onConfirm={handleClose}
          confirmText={CM.ok}
        />
      </Modal>
    );
  }

  /* ─── ERROR view ─── */
  if (isError) {
    return (
      <Modal isOpen title={CM.executionError} icon="delete_forever" iconVariant="danger" onClose={resetAction} maxWidth="440px" testId="delete-database">
        <ModalStatusError
          title={CM.failure}
          error={error}
          guidance={CM.deleteDbGuidance}
          onRetry={step === 2 ? handleConfirm : undefined}
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
      isOpen={isDeleteDBModalOpen}
      onClose={handleClose}
      title={step === 1 ? CM.deleteDatabase : CM.dbaConfirm}
      subtitle={step === 1 ? CM.deleteDatabaseConfirm : CM.dbaConfirm}
      icon="delete_forever"
      iconVariant="danger"
      maxWidth={step === 1 ? '600px' : '440px'}
      testId="delete-database"
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="flex-1">
            {step === 2 && (
              <Button variant="ghost" onClick={() => setStep(1)}>
                {CM.backBtn}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <Button data-testid="delete-database-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
            <Button
              data-testid="delete-database-confirm-btn"
              variant="danger"
              onClick={handleConfirm}
              icon={step === 1 ? 'arrow_forward' : 'delete_forever'}
              className="whitespace-nowrap"
            >
              {step === 1 ? CM.proceedBtn : CM.confirmDelete}
            </Button>
          </div>
        </div>
      }
    >
      {step === 1 ? (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div>
            <SectionHeader title={CM.targetSelection} icon="database" badge={CM.permanent} />
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-500/5 border border-rose-500/20">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Icon name="database" size="sm" weight={300} className="text-rose-500" />
              </div>
              <div className="flex-1 min-w-0">
                <Typography variant="p" className="text-slate-800 dark:text-slate-100 font-bold text-16 leading-none truncate">{selectedDatabase}</Typography>
              </div>
              <StatusBadge label={CM.destructiveAction} variant="rose" pulse={true} className="rounded-full" />
            </div>
          </div>

          <InfoBanner title={CM.criticalWarning} variant="warning">
            {CM.deleteDatabaseWarningDesc}
          </InfoBanner>

          <div>
            <SectionHeader 
              title={CM.volumesToDelete} 
              icon="hard_drive" 
              badge={volumeInfo.length > 0 ? CM.assetsCountLabel(volumeInfo.length) : null}
            />
            <div className="rounded-xl border border-slate-100 dark:border-white/5 overflow-hidden">

            {fetchingVolumes ? (
              <div className="flex items-center justify-center gap-2.5 py-10 text-slate-400 dark:text-slate-500">
                <Spinner size="xs" />
                <Typography variant="caption" className="font-bold tracking-widest uppercase">{CM.fetchingAssets}</Typography>
              </div>
            ) : volumeInfo.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500 gap-2">
                <Icon name="hard_drive" size="lg" weight={100} className="opacity-20" />
                <Typography variant="caption" className="font-bold uppercase tracking-widest">{CM.noVolumesDetected}</Typography>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[220px] overflow-y-auto custom-scrollbar">
                {volumeInfo.map((v, i) => (
                  <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50/50 dark:hover:bg-white/2 transition-colors">
                    <Icon name="hard_drive" size="sm" weight={300} className="text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-13 font-bold text-slate-700 dark:text-slate-200 leading-none mb-0.5">{v.name}</p>
                      <p className="text-11 text-slate-400 font-medium truncate">{v.path}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-11 font-black border uppercase tracking-wider ${getTypeStyle(v.type)}`}>
                      {v.type}
                    </span>
                    <div className="shrink-0 text-right min-w-[60px]">
                      <p className="text-13 font-mono font-bold text-slate-700 dark:text-slate-200 leading-none tabular-nums">{v.sizeMB} MB</p>
                      <p className="text-11 text-slate-400 font-medium tabular-nums">{CM.freeSpaceLabel(v.free)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

          <div>
            <SectionHeader title={CM.recoveryCleanup} icon="folder_delete" />
            <div 
              className={`flex items-center gap-4 p-4 border rounded-2xl transition-all duration-200 cursor-pointer select-none
                ${deleteBackup
                  ? 'bg-rose-500/5 border-rose-500/25 shadow-[0_2px_16px_rgba(244,63,94,0.04)]'
                  : 'bg-white dark:bg-white/2 border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10'}`}
              onClick={() => setDeleteBackup(!deleteBackup)}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all shrink-0
                ${deleteBackup ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-400'}`}>
                <Icon name="folder_delete" size="xs" weight={300} />
              </div>
              <div className="flex-1 min-w-0">
                <Typography variant="p" className={`font-bold text-13 tracking-tight transition-colors ${deleteBackup ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}>
                  {CM.purgeLinkedBackups}
                </Typography>
                <Typography variant="caption" className="text-slate-400 dark:text-slate-500 font-medium mt-0.5 leading-snug">
                  {CM.purgeLinkedBackupsDesc}
                </Typography>
              </div>
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <Toggle 
                  variant="danger"
                  checked={deleteBackup}
                  onChange={setDeleteBackup}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5 py-2 animate-in fade-in duration-200 max-w-[400px] mx-auto">
          <InfoBanner title={CM.authorizationPointTitle}>
            {CM.confirmCredentialsToDeleteDesc(selectedDatabase)}
          </InfoBanner>

          <div className="space-y-3">
            <Input
              data-testid="delete-database-dba-id-input"
              label={CM.userName}
              value={dbId}
              onChange={e => setDbId(e.target.value)}
              placeholder="dba"
              icon="person"
              autoFocus
            />
            <Input
              data-testid="delete-database-dba-password-input"
              type="password"
              label={CM.password}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConfirm()}
              placeholder="••••••••"
              icon="key"
            />
          </div>

          <Typography variant="caption" className="text-slate-400 dark:text-slate-500 font-medium text-center leading-relaxed block px-2">
            {CM.finalDeleteStepDesc}
          </Typography>
        </div>
      )}
    </Modal>
  );
}
