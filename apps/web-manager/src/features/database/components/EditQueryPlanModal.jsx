import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeEditQueryPlanModal, updateAutoExecQueryPlan, fetchQueryPlan } from '../databaseSlice';
import { dbKey } from '../dbKey';
import Editor from '@monaco-editor/react';
import { useCM } from '../../../constants/useCM';
import { hasLineCommentAcrossLines, normalizeQueryForCms } from '../queryPlanUtils';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { DatePicker } from '../../../components/ds/forms/DatePicker';
import { TimePicker } from '../../../components/ds/forms/TimePicker';
import { Typography } from '../../../components/ds/foundation/Typography';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import { 
  ModalStatusLoading, 
  ModalStatusSuccess, 
  ModalStatusError 
} from '../../../components/ds/feedback/ActionStatus';

// view states
const VIEW_FORM    = 'form';
const VIEW_LOADING = 'loading';
const VIEW_SUCCESS = 'success';
const VIEW_ERROR   = 'error';

export default function EditQueryPlanModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isEditQueryPlanModalOpen, selectedQueryPlanId } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);
  const { theme } = useSelector((state) => state.layout, shallowEqual);
  const { queryPlans } = useSelector((state) => state.databaseOperation, shallowEqual);
  
  const { 
    state, 
    error: actionError, 
    startAction, 
    endSuccess, 
    endError, 
    resetAction,
    isLoading,
    isSuccess,
    isError
  } = useActionState();

  const [formData, setFormData] = useState({
    queryId: '',
    username: 'public',
    password: '',
    periodType: 'DAY',
    periodDetail: [],
    backupTime: '12:00',
    queryString: ''
  });

  // Clear view on modal open
  useEffect(() => {
    if (isEditQueryPlanModalOpen) {
      resetAction();
    }
  }, [isEditQueryPlanModalOpen, resetAction]);

  // Initialization
  useEffect(() => {
    if (isEditQueryPlanModalOpen && selectedDatabase && selectedQueryPlanId && !isLoading && !isSuccess && !isError) {
      const plans = queryPlans[dbKey(selectedHostUid, selectedDatabase)] || [];
      let plan = plans.find(p => p.query_id === selectedQueryPlanId);
      
      if (!plan) {
        dispatch(fetchQueryPlan({ hostUid: selectedHostUid, dbname: selectedDatabase }));
      }
      
      if (plan) {
        const ABBR_TO_NUM = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 7 };
        let periodType = plan.period || 'DAY';
        let detailStr = plan.detail || '';
        let time = '12:00';
        let periodDetail = [];

        if (periodType === 'DAY') {
          // "EVERYDAY 12:00"
          time = detailStr.split(' ')[1] || '12:00';
        } else if (periodType === 'DATE') {
          const parts = detailStr.split(' ');
          // "2026/06/11 12:00" → convert slashes to dashes for date input
          periodDetail = (parts[0] || '').replace(/\//g, '-');
          time = parts[1] || '12:00';
        } else if (periodType === 'WEEK') {
          const parts = detailStr.split(' ');
          // "MON,WED 12:00" → [1, 3]
          periodDetail = (parts[0] || '').split(',')
            .map(s => ABBR_TO_NUM[s.toUpperCase()] ?? parseInt(s))
            .filter(n => !isNaN(n));
          time = parts[1] || '12:00';
        } else {
          // MONTH: "1,15 12:00" → [1, 15]
          const parts = detailStr.split(' ');
          periodDetail = (parts[0] || '').split(',').map(s => parseInt(s)).filter(n => !isNaN(n));
          time = parts[1] || '12:00';
        }
        
        time = time.trim();

        setFormData({
          queryId: plan.query_id,
          username: plan.username || 'public',
          password: plan.userpass || '',
          periodType: periodType,
          periodDetail: periodDetail,
          backupTime: time,
          queryString: plan.query_string || ''
        });
      }
    }
  }, [isEditQueryPlanModalOpen, selectedDatabase, selectedQueryPlanId, queryPlans, isLoading, isSuccess, isError, selectedHostUid, dispatch]);

  if (!isEditQueryPlanModalOpen) return null;

  const handleInputChange = (field, value) => {
    if (field === 'periodType') {
      let detail = [];
      if (value === 'DATE') detail = new Date().toISOString().split('T')[0];
      if (value === 'MONTH' || value === 'WEEK') detail = [1];
      setFormData(prev => ({ ...prev, periodType: value, periodDetail: detail }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const toggleDetail = (val) => {
    setFormData(prev => ({
      ...prev,
      periodDetail: prev.periodDetail.includes(val)
        ? prev.periodDetail.filter(v => v !== val)
        : [...prev.periodDetail, val].sort((a, b) => a - b)
    }));
  };

  const handleSave = async () => {
    if (!formData.queryId.trim()) {
       endError(CM.queryIdentifierRequired);
       return;
    }
    if (!formData.queryString.trim()) {
      endError(CM.sqlStatementRequired);
      return;
    }
    if (hasLineCommentAcrossLines(formData.queryString)) {
      endError(CM.multilineQueryLineCommentError);
      return;
    }
    const queryString = normalizeQueryForCms(formData.queryString);

    startAction();

    const WEEK_ABBRS = { 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT', 7: 'SUN' };
    let detail = '';
    if (formData.periodType === 'DAY') {
      detail = `EVERYDAY ${formData.backupTime}`;
    } else if (formData.periodType === 'DATE') {
      const dateStr = String(formData.periodDetail).replace(/-/g, '/');
      detail = `${dateStr} ${formData.backupTime}`;
    } else if (formData.periodType === 'WEEK') {
      const days = Array.isArray(formData.periodDetail) && formData.periodDetail.length > 0
        ? formData.periodDetail.map(d => WEEK_ABBRS[d] || d).join(',')
        : 'MON';
      detail = `${days} ${formData.backupTime}`;
    } else {
      // MONTH
      const dayNums = Array.isArray(formData.periodDetail) && formData.periodDetail.length > 0
        ? formData.periodDetail.join(',')
        : '1';
      detail = `${dayNums} ${formData.backupTime}`;
    }

    const updatedPlan = {
      query_id: formData.queryId.trim(),
      username: formData.username,
      userpass: formData.password,
      period: formData.periodType,
      detail: detail,
      query_string: queryString
    };

    try {
      await dispatch(updateAutoExecQueryPlan({ hostUid: selectedHostUid, dbname: selectedDatabase, plan: updatedPlan })).unwrap();
      endSuccess(CM.planUpdatedMsg(formData.queryId));
      dispatch(fetchQueryPlan({ hostUid: selectedHostUid, dbname: selectedDatabase }));
    } catch (err) {
      endError(typeof err === 'string' ? err : (err.message || CM.operationFailed));
    }
  };

  const handleClose = () => dispatch(closeEditQueryPlanModal());

  /* ─── LOADING view ─── */
  if (isLoading) {
    return (
      <Modal isOpen title={CM.editQueryPlan} icon="edit" onClose={handleClose} maxWidth="720px" showCloseButton={false}>
        <ModalStatusLoading
          title={CM.updatingSchedule}
          subtitle={formData.queryId}
        />
      </Modal>
    );
  }

  /* ─── SUCCESS view ─── */
  if (isSuccess) {
    return (
      <Modal isOpen title={CM.updateSuccessful} icon="verified" iconVariant="success" onClose={handleClose} maxWidth="700px">
        <ModalStatusSuccess
          title={CM.updateSuccessful}
          message={`${selectedDatabase}: ${formData.queryId}`}
          onConfirm={handleClose}
          confirmText={CM.ok}
        />
      </Modal>
    );
  }

  /* ─── ERROR view ─── */
  if (isError) {
    return (
      <Modal isOpen title={CM.editQueryPlanFailed} icon="error" iconVariant="danger" onClose={resetAction} maxWidth="700px">
        <ModalStatusError
          title={CM.operationInterrupted}
          error={actionError}
          guidance={CM.queryPlanGuidance}
          onRetry={handleSave}
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
      isOpen={isEditQueryPlanModalOpen}
      onClose={handleClose}
      title={CM.editQueryPlan}
      subtitle={CM.editQueryPlanSubtitle(selectedDatabase)}
      icon="edit"
      maxWidth="max-w-[720px]"
      testId="edit-query-plan"
      onSubmit={handleSave}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button data-testid="edit-query-plan-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          <Button data-testid="edit-query-plan-save-btn" variant="primary" onClick={handleSave} icon="save" className="min-w-[140px]">{CM.saveChanges}</Button>
        </div>
      }
    >
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-300">
        {/* Identifier */}
        <div className="space-y-4">
          <SectionHeader title={CM.objectIdentification} icon="fingerprint" />
          <Input
            label={CM.queryIdentifierLabel}
            value={formData.queryId}
            disabled
            icon="tag"
            className="opacity-50"
          />
        </div>

        {/* Security */}
        <div className="space-y-4">
          <SectionHeader title={CM.secureContextSection} icon="lock" />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={CM.databaseUsernameLabel}
              value={formData.username}
              onChange={e => handleInputChange('username', e.target.value)}
              icon="person"
            />
            <Input
              type="password"
              label={CM.databasePasswordLabel}
              value={formData.password}
              onChange={e => handleInputChange('password', e.target.value)}
              icon="key"
              placeholder="••••••••"
            />
          </div>
        </div>

        {/* Schedule */}
        <div className="space-y-4">
          <SectionHeader title={CM.executionSchedule} icon="schedule" />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label={CM.recurrenceFrequency}
              icon="event_repeat"
              value={formData.periodType}
              onChange={e => handleInputChange('periodType', e.target.value)}
              options={[
                { value: 'DAY', label: CM.dailyLabel },
                { value: 'WEEK', label: CM.weeklyLabel },
                { value: 'MONTH', label: CM.monthlyLabel },
                { value: 'DATE', label: CM.specificDateLabel }
              ]}
            />
            <TimePicker
              label={CM.startTimeLabel}
              value={formData.backupTime}
              onChange={e => handleInputChange('backupTime', e.target.value)}
              icon="history_toggle_off"
            />
          </div>
        </div>

        <div className="mt-[-10px] animate-in fade-in slide-in-from-top-2 duration-300">
          {formData.periodType === 'WEEK' && (
            <div className="grid grid-cols-7 gap-2">
              {CM.weekdaysShort.map((day, ix) => {
                const isSel = formData.periodDetail.includes(ix + 1);
                return (
                  <button 
                    key={day} 
                    onClick={() => toggleDetail(ix + 1)} 
                    className={`h-10 rounded-xl border text-13 font-black transition-all cursor-pointer 
                      ${isSel 
                        ? 'bg-amber-500/15 dark:bg-amber-500/25 border-amber-500/30 text-amber-600 dark:text-amber-400' 
                        : 'bg-white dark:bg-white/2 border-slate-100 dark:border-white/5 text-slate-400 hover:border-amber-500/30'}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          )}
          {formData.periodType === 'MONTH' && (
            <div className="grid grid-cols-8 gap-1.5 p-3.5 bg-slate-50/50 dark:bg-white/1 border border-slate-100 dark:border-white/5 rounded-2xl">
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => {
                const isSel = formData.periodDetail.includes(d);
                return (
                  <button 
                    key={d} 
                    onClick={() => toggleDetail(d)} 
                    className={`h-8 rounded-lg border text-12 font-black font-mono transition-all cursor-pointer 
                      ${isSel 
                        ? 'bg-amber-500/15 dark:bg-amber-500/25 border-amber-500/30 text-amber-600 dark:text-amber-400' 
                        : 'bg-white dark:bg-white/4 border-transparent text-slate-400 hover:border-amber-500/30'}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
          {formData.periodType === 'DATE' && (
            <DatePicker 
              value={formData.periodDetail}
              onChange={e => handleInputChange('periodDetail', e.target.value)}
              icon="calendar_month"
            />
          )}
        </div>

        {/* SQL Payload */}
        <div className="space-y-4 pt-2">
          <SectionHeader
            title={CM.sqlStatementSection}
            icon="code"
          />
          <div className="relative group rounded-3xl overflow-hidden border border-slate-200 dark:border-white/8 bg-white dark:bg-[#1e1e1e] shadow-inner transition-all focus-within:ring-4 focus-within:ring-amber-500/5 focus-within:border-amber-500/40">
            <div className="absolute top-4 left-4 z-10 opacity-40 group-focus-within:opacity-100 transition-opacity pointer-events-none">
              <Icon name="terminal" size="sm" weight={300} className="text-amber-500" />
            </div>
            <div className="pl-10">
              <Editor
                height="168px"
                language="sql"
                theme={theme === 'dark' ? 'vs-dark' : 'light'}
                value={formData.queryString}
                onChange={val => handleInputChange('queryString', val || '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'off',
                  glyphMargin: false,
                  folding: false,
                  lineDecorationsWidth: 0,
                  lineNumbersMinChars: 0,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  padding: { top: 16, bottom: 16 },
                  fontFamily: 'JetBrains Mono, Fira Code, monospace',
                  renderLineHighlight: 'all',
                  scrollbar: {
                    vertical: 'visible',
                    horizontal: 'hidden',
                    useShadows: false,
                    verticalScrollbarSize: 8
                  }
                }}
              />
            </div>
          </div>
          <InfoBanner>
            {CM.systemComplianceNote}
          </InfoBanner>
          <InfoBanner variant="warning" icon="info">
            {CM.multilineQueryCollapseNote}
          </InfoBanner>
        </div>
      </div>
    </Modal>
  );
}
