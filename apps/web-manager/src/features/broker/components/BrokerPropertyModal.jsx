import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { useCM } from '../../../constants/useCM';
import {
  closeBrokerPropertyModal,
  fetchBrokerConfig,
} from '../brokerSlice';
import { fetchHostEnv } from '../../host/hostSlice';
import { brokerApi } from '../brokerApi';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { TabGroup } from '../../../components/ds/layout/TabGroup';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { Typography } from '../../../components/ds/foundation/Typography';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { ModalStatusError } from '../../../components/ds/feedback/ActionStatus';
import { validateParams } from '@api-interfaces';

// The param list (which keys exist, their category/guard/default) no
// longer lives here — it comes from the connected host's `getEnv`
// response (`paramSchemas.broker`, cached in Redux's `hostEnvs`), already
// resolved for that host's actual engine version by the server. See
// libs/api-interfaces/src/param-schema/broker-param-schema.ts for the
// master, version-aware rule table and its source citations.

function ParamRow({ param, value, isModified, onChange, error }) {
  const options = param.guard.kind === 'enum' ? param.guard.options : null;
  const isNumeric = param.guard.kind === 'int' || param.guard.kind === 'float';

  return (
    <div className={`flex items-center h-10 px-4 border-b border-slate-100 dark:border-white/4 last:border-0 group transition-colors ${isModified ? 'bg-amber-500/[0.03]' : 'hover:bg-slate-50 dark:hover:bg-white/2'}`}>
      <div className="w-[280px] shrink-0 flex items-center gap-2">
        {isModified && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
        <span className={`text-12 font-mono truncate ${isModified ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
          {param.key}
        </span>
      </div>
      <span className="text-10 font-bold text-slate-400 dark:text-slate-600 font-mono opacity-60 w-[90px] shrink-0 truncate">
        {param.guard.kind}
      </span>
      <div className="flex-1 min-w-0">
        {options ? (
          <Select
            size="sm"
            value={value}
            options={options.map((v) => ({ value: v, label: v }))}
            onChange={(e) => onChange(param.key, e.target.value)}
            className="w-full"
          />
        ) : (
          <div title={error}>
            <Input
              size="sm"
              type={isNumeric ? 'number' : 'text'}
              value={value}
              onChange={(e) => onChange(param.key, e.target.value)}
              placeholder={param.default || '—'}
              className={`w-full ${error ? 'ring-1 ring-rose-500' : ''}`}
            />
            {error && <p className="text-11 text-rose-500 mt-0.5">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

const ViewStatus = {
  FORM: 'form',
  SAVING: 'saving',
  SUCCESS: 'success',
  ERROR: 'error',
};

export default function BrokerPropertyModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { propertyModal, brokerConfig } = useSelector((state) => state.broker, shallowEqual);
  const { isOpen, brokerName, hostUid } = propertyModal;
  // Resolved per this host's actual engine version by the server (see
  // CmsConfigService.getEnv) — normally already cached by host
  // activation/login; the effect below covers the case where it isn't yet.
  const hostEnv = useSelector((state) => state.host.hostEnvs[hostUid]);
  const brokerParamSchema = useMemo(() => hostEnv?.paramSchemas?.broker ?? [], [hostEnv]);

  const [activeTab, setActiveTab] = useState('common');
  const [localParams, setLocalParams] = useState({});
  const [specificParams, setSpecificParams] = useState(new Set());
  const [initialParams, setInitialParams] = useState({});
  const [initialSpecificParams, setInitialSpecificParams] = useState(new Set());
  const [viewStatus, setViewStatus] = useState(ViewStatus.FORM);
  const [errorMessage, setErrorMessage] = useState('');

  const config = useMemo(() => brokerConfig[hostUid] || { data: {}, loading: false }, [brokerConfig, hostUid]);

  useEffect(() => {
    if (isOpen && hostUid) {
      dispatch(fetchBrokerConfig({ hostUid }));
      setViewStatus(ViewStatus.FORM);
      setErrorMessage('');
    }
  }, [isOpen, hostUid, dispatch]);

  useEffect(() => {
    if (isOpen && hostUid && !hostEnv) {
      dispatch(fetchHostEnv(hostUid));
    }
  }, [isOpen, hostUid, hostEnv, dispatch]);

  useEffect(() => {
    const confLines = config.data?.confdata || config.data?.conflist?.[0]?.confdata;
    if (!confLines || confLines.length === 0) return;
    const sections = {};
    let currentSection = 'general';
    confLines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const sectionMatch = trimmed.match(/^\[%?(.+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].toLowerCase();
        sections[currentSection] = {};
      } else {
        const [key, value] = trimmed.split('=').map((s) => s.trim());
        if (key && value !== undefined) {
          if (!sections[currentSection]) sections[currentSection] = {};
          sections[currentSection][key] = value;
        }
      }
    });

    const targetBroker = brokerName?.toLowerCase();
    const combined = { ...(sections['broker'] || {}), ...(sections[targetBroker] || {}) };
    const specKeys = new Set(Object.keys(sections[targetBroker] || {}));
    setLocalParams(combined);
    setInitialParams(combined);
    setSpecificParams(specKeys);
    setInitialSpecificParams(new Set(specKeys));
  }, [config.data, brokerName, isOpen]);

  const handleParamChange = (name, value) => {
    setLocalParams((prev) => ({ ...prev, [name]: value }));
    setSpecificParams((prev) => { const n = new Set(prev); n.add(name); return n; });
  };

  const handleReset = () => {
    setLocalParams(initialParams);
    setSpecificParams(new Set(initialSpecificParams));
  };

  const handleSave = async () => {
    // Defense-in-depth: Apply is already disabled while guardErrorCount > 0.
    if (guardErrorCount > 0) return;
    setViewStatus(ViewStatus.SAVING);

    // `specificParams` marks every key handleParamChange has ever touched
    // this session, regardless of whether the final value actually differs
    // from what was loaded — merely clicking into a field that was only
    // ever inheriting a global/default value and retyping the same text
    // would otherwise add a brand-new per-broker override line for it.
    // Only send a key here if it's genuinely changed, or if it already was
    // an explicit line before this session started (in which case leaving
    // it out would silently fall back to the global/default value instead
    // of staying as-is).
    const keysToWrite = [...specificParams].filter(
      key => localParams[key] !== initialParams[key] || initialSpecificParams.has(key)
    );
    const params = {};
    for (const key of keysToWrite) {
      if (localParams[key] !== undefined) params[key] = localParams[key];
    }

    try {
      // The server now owns conf-line construction (section lookup, merge,
      // duplicate-key handling) via a typed, per-field-validated endpoint —
      // the client just sends the changed keys for this broker.
      await brokerApi.setBrokerConfigParams(hostUid, brokerName, params);
      setViewStatus(ViewStatus.SUCCESS);
    } catch (err) {
      setErrorMessage(typeof err === 'string' ? err : err.message || 'Failed to update broker configuration');
      setViewStatus(ViewStatus.ERROR);
    }
  };

  const handleClose = () => dispatch(closeBrokerPropertyModal());
  const modifiedCount = Object.keys(localParams).filter(k => localParams[k] !== initialParams[k]).length;
  const guardErrors = useMemo(() => validateParams(brokerParamSchema, localParams).errors, [brokerParamSchema, localParams]);
  const guardErrorCount = Object.keys(guardErrors).length;
  const tabs = [
    { id: 'common',   label: CM.common,   icon: 'settings' },
    { id: 'advance',  label: CM.advanced,  icon: 'tune' },
  ];

  if (!isOpen) return null;

  if (viewStatus === ViewStatus.ERROR) {
    return (
      <Modal isOpen title={CM.brokerProperties} icon="error" iconVariant="danger" onClose={handleClose} maxWidth="max-w-[500px]">
        <ModalStatusError
          title={CM.failure}
          error={errorMessage}
          guidance={CM.brokerOperationGuidance}
          onRetry={handleSave}
          onCancel={handleClose}
          cancelText={CM.dismiss}
        />
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={brokerName ? `${brokerName} · ${CM.brokerProperties}` : CM.brokerProperties}
      subtitle={CM.runtimeConfiguration}
      icon="hub"
      maxWidth="max-w-[620px]"
      testId="broker-properties"
      footer={
        viewStatus === ViewStatus.FORM ? (
          <>
            <div className="mr-auto">
              {modifiedCount > 0 && <Button variant="ghost" onClick={handleReset} className="text-amber-600">{CM.resetLabel}</Button>}
            </div>
            <Button variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
            <Button variant="primary" onClick={handleSave} loading={viewStatus === ViewStatus.SAVING} icon="save" disabled={modifiedCount === 0 || guardErrorCount > 0}>{CM.applyLabel}</Button>
          </>
        ) : (
          <Button variant="primary" onClick={handleClose} icon="check_circle" className="w-full">{CM.close}</Button>
        )
      }
    >
      {viewStatus === ViewStatus.FORM && (
        <div className="flex flex-col h-[520px] -m-5">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-white/5 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-white/[0.01]">
            <TabGroup tabs={tabs} active={activeTab} onChange={setActiveTab} />
            <div className="flex items-center gap-2 shrink-0">
              {guardErrorCount > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-rose-500/10 border border-rose-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span className="text-12 font-bold text-rose-600 dark:text-rose-400 uppercase">{guardErrorCount} invalid</span>
                </div>
              )}
              {modifiedCount > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-amber-500/10 border border-amber-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span className="text-12 font-bold text-amber-700 dark:text-amber-400 uppercase">{CM.pendingCountLabel(modifiedCount)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-white dark:bg-bk-main">
            {config.loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="h-10 w-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-14 text-slate-400 font-medium">{CM.synchronizing}</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center h-10 px-5 bg-slate-50 dark:bg-bk-main border-b border-slate-200 dark:border-white/8 sticky top-0 z-20">
                  <SectionHeader title={CM.propertyName} icon="label" className="w-[280px] !m-0" />
                  <SectionHeader title={CM.type} icon="code" className="w-[90px] !m-0" />
                  <SectionHeader title={CM.value} icon="settings" className="flex-1 !m-0" />
                </div>
                <div className="divide-y divide-slate-100 dark:divide-white/4">
                  {brokerParamSchema.filter(p => p.category === activeTab).map(p => (
                    <ParamRow
                      key={p.key}
                      param={p}
                      value={localParams[p.key] ?? p.default}
                      isModified={localParams[p.key] !== initialParams[p.key]}
                      onChange={handleParamChange}
                      error={guardErrors[p.key]}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {viewStatus === ViewStatus.SAVING && (
        <div className="p-20 flex flex-col items-center justify-center h-[520px] gap-6">
          <div className="w-16 h-16 border-4 border-amber-500/10 border-t-amber-500 rounded-full animate-spin" />
          <Typography variant="h4">{CM.deployingChanges}</Typography>
        </div>
      )}

      {viewStatus === ViewStatus.SUCCESS && (
        <div className="p-20 flex flex-col items-center justify-center h-[520px] gap-6 animate-in fade-in zoom-in">
          <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-xl">
            <Icon name="check" size="lg" weight={700} />
          </div>
          <Typography variant="h4">{CM.updateSynchronized}</Typography>
          <Typography variant="p" className="text-slate-500">{CM.brokerSettingsAppliedMsg(brokerName)}</Typography>
        </div>
      )}
    </Modal>
  );
}
