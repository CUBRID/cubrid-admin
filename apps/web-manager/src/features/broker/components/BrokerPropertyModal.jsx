import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { useCM } from '../../../constants/useCM';
import {
  closeBrokerPropertyModal,
  fetchBrokerConfig,
  updateBrokerConfig,
} from '../brokerSlice';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { TabGroup } from '../../../components/ds/layout/TabGroup';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { Typography } from '../../../components/ds/foundation/Typography';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { ModalStatusError } from '../../../components/ds/feedback/ActionStatus';
import { BROKER_PARAM_GUARDS, collectGuardErrors } from '../../../constants/paramGuards';

// ─── Schema ───────────────────────────────────────────────────────────────────
// Removed from this list, with the source-verified reason (see
// CUBRID-BROKER-PROPERTY-PARAM-AUDIT.md for full citations):
//  - SELECT_AUTO_COMMIT: fictional — removed from the engine before 11.0
//    (commit 01b2aa98c [CUBRIDSUS-9326]). broker_keywords[] has never had
//    this key in any of the 6 supported branches; setting it is a no-op.
//  - ENABLE_OPENSSL: fictional — no key by this name has ever existed. The
//    real SSL toggle is named "SSL" (ON|OFF, broker_config.c), a different
//    identifier entirely, so this wasn't a typo-level fix.
//  - APPL_SERVER_PORT: only parsed `#if defined (WINDOWS)` in all 6
//    branches — on Linux (this project's only deployment target) the key
//    is never even read, so editing it here has zero effect.
const BROKER_PARAMETERS = [
  { name: 'SERVICE',              type: 'string(ON|OFF)',                    default: 'ON',                 category: 'common' },
  // Real range is 1~65535 (PORT_NUM_LIMIT=USHRT_MAX) — the previous
  // "1024~65535" annotation had no source backing and undersold the actual
  // range by excluding 1-1023.
  { name: 'BROKER_PORT',          type: 'int(1~65535)',                      default: '',                   category: 'common' },
  { name: 'MIN_NUM_APPL_SERVER',  type: 'int',                               default: '5',                  category: 'common' },
  { name: 'MAX_NUM_APPL_SERVER',  type: 'int',                               default: '40',                 category: 'common' },
  // Real constraint is "nonzero + unique among this conf's brokers/
  // MASTER_SHM_ID", not a numeric range — the previous "1024~65535"
  // annotation was fabricated (no such range exists in source).
  { name: 'APPL_SERVER_SHM_ID',   type: 'int(nonzero, unique)',              default: '',                   category: 'common' },
  { name: 'LOG_DIR',              type: 'string',                            default: 'log/broker/sql_log', category: 'common' },
  { name: 'ERROR_LOG_DIR',        type: 'string',                            default: 'log/broker/error_log', category: 'common' },
  { name: 'SQL_LOG',              type: 'string(ON|OFF|ERROR|NOTICE|TIMEOUT)', default: 'ON',              category: 'common' },
  { name: 'TIME_TO_KILL',         type: 'int',                               default: '120',                category: 'common' },
  { name: 'SESSION_TIMEOUT',      type: 'int',                               default: '300',                category: 'common' },
  // OFF removed — tbl_keep_connection only has ON/AUTO in all 6 branches
  // (no KEEP_CON_OFF enum value exists at all). Selecting OFF previously
  // saved a value the engine rejects with PARAM_BAD_VALUE, failing the
  // *entire* broker.conf parse on next load — the single most serious bug
  // this audit found.
  { name: 'KEEP_CONNECTION',      type: 'string(ON|AUTO)',                   default: 'AUTO',               category: 'common' },
  { name: 'STATEMENT_POOLING',    type: 'string(ON|OFF)',                    default: 'ON',                 category: 'advance' },
  { name: 'LONG_QUERY_TIME',      type: 'int(sec)',                          default: '60',                 category: 'advance' },
  { name: 'LONG_TRANSACTION_TIME', type: 'int(sec)',                         default: '60',                 category: 'advance' },
  { name: 'SQL_LOG_MAX_SIZE',     type: 'int',                               default: '100000',             category: 'advance' },
  { name: 'LOG_BACKUP',           type: 'string(ON|OFF)',                    default: 'OFF',                category: 'advance' },
  { name: 'SOURCE_ENV',           type: 'string',                            default: 'cubrid.env',         category: 'advance' },
  { name: 'MAX_STRING_LENGTH',    type: 'int',                               default: '-1',                 category: 'advance' },
  { name: 'ACCESS_LOG',           type: 'string(ON|OFF)',                    default: 'ON',                 category: 'advance' },
  { name: 'ACCESS_LIST',          type: 'string',                            default: '',                   category: 'advance' },
  { name: 'CCI_PCONNECT',         type: 'string(ON|OFF)',                    default: 'OFF',                category: 'advance' },
  { name: 'ACCESS_MODE',          type: 'string(RW|RO|SO)',                  default: 'RW',                 category: 'advance' },
  { name: 'PREFERRED_HOSTS',      type: 'string',                            default: '',                   category: 'advance' },
  { name: 'CCI_DEFAULT_AUTOCOMMIT', type: 'string(ON|OFF)',                  default: 'ON',                 category: 'advance' },

  // Added — real, version-common (Section 1 of
  // CUBRID-BROKER-CONF-PARAM-VERSION-MATRIX.md) broker.conf keys that
  // weren't exposed anywhere in this editor, flagged there as DBA-relevant
  // candidates. All 5 global ([broker]-section) keys (ACCESS_CONTROL*,
  // MASTER_SHM_ID, ADMIN_LOG_FILE) were deliberately left out — this
  // editor's save path only ever writes into the per-broker [%name]
  // section, and giving a global key a per-broker override here hasn't
  // been verified against broker_config_read's actual section-merge rules.
  { name: 'READ_ONLY_BROKER',     type: 'string(ON|OFF)',                    default: 'OFF',                category: 'advance' },
  { name: 'APPL_SERVER_MAX_SIZE', type: 'sizeM',                             default: '0',                  category: 'advance' },
  { name: 'APPL_SERVER_MAX_SIZE_HARD_LIMIT', type: 'sizeM',                  default: '1G',                 category: 'advance' },
  { name: 'MAX_QUERY_TIMEOUT',    type: 'int(sec)',                          default: '0',                  category: 'advance' },
  { name: 'AUTO_ADD_APPL_SERVER', type: 'string(ON|OFF)',                    default: 'ON',                 category: 'advance' },
  { name: 'CONNECT_ORDER',        type: 'string(SEQ|RANDOM)',                default: 'SEQ',                category: 'advance' },
  { name: 'RECONNECT_TIME',       type: 'int(sec)',                          default: '600',                category: 'advance' },
  { name: 'SLOW_LOG',             type: 'string(ON|OFF)',                    default: 'ON',                 category: 'advance' },
  { name: 'SLOW_LOG_DIR',         type: 'string',                            default: '',                   category: 'advance' },
];

const getOptions = (type) => {
  const match = type.match(/\((.+)\)/);
  if (!match || !match[1].includes('|')) return null;
  return match[1].split('|').map((v) => ({ value: v, label: v }));
};

const isNumericType = (type) => type.startsWith('int') || type.startsWith('float');

function ParamRow({ param, value, isModified, onChange, error }) {
  const options = getOptions(param.type);
  const isNumeric = isNumericType(param.type);

  return (
    <div className={`flex items-center h-10 px-4 border-b border-slate-100 dark:border-white/4 last:border-0 group transition-colors ${isModified ? 'bg-amber-500/[0.03]' : 'hover:bg-slate-50 dark:hover:bg-white/2'}`}>
      <div className="w-[280px] shrink-0 flex items-center gap-2">
        {isModified && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
        <span className={`text-12 font-mono truncate ${isModified ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
          {param.name}
        </span>
      </div>
      <span className="text-10 font-bold text-slate-400 dark:text-slate-600 font-mono opacity-60 w-[90px] shrink-0 truncate">
        {param.type.split('(')[0]}
      </span>
      <div className="flex-1 min-w-0">
        {options ? (
          <Select
            size="sm"
            value={value}
            options={options}
            onChange={(e) => onChange(param.name, e.target.value)}
            className="w-full"
          />
        ) : (
          <div title={error}>
            <Input
              size="sm"
              type={isNumeric ? 'number' : 'text'}
              value={value}
              onChange={(e) => onChange(param.name, e.target.value)}
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
    const confLines = config.data?.confdata || config.data?.conflist?.[0]?.confdata;
    if (!confLines || confLines.length === 0) return;
    setViewStatus(ViewStatus.SAVING);
    const newConfData = [];
    let inTargetSection = false;
    const targetBroker = brokerName?.toLowerCase();
    const updatedInTargetSection = new Set();

    // `specificParams` marks every key handleParamChange has ever touched
    // this session, regardless of whether the final value actually differs
    // from what was loaded — merely clicking into a field that was only
    // ever inheriting a global/default value and retyping the same text
    // would otherwise add a brand-new per-broker override line for it.
    // Only promote a key to an explicit per-broker line here if it's
    // genuinely changed, or if it already was an explicit line before this
    // session started (in which case leaving it out would silently fall
    // back to the global/default value instead of staying as-is).
    const keysToWrite = new Set(
      [...specificParams].filter(key => localParams[key] !== initialParams[key] || initialSpecificParams.has(key))
    );

    confLines.forEach((line) => {
      const trimmed = line.trim();
      const sectionMatch = trimmed.match(/^\[%?(.+)\]$/);
      if (sectionMatch) {
        const sectionName = sectionMatch[1].toLowerCase();
        if (inTargetSection) {
          keysToWrite.forEach((paramName) => {
            if (!updatedInTargetSection.has(paramName) && localParams[paramName] !== undefined) {
              newConfData.push(`${paramName}=${localParams[paramName]}`);
            }
          });
        }
        inTargetSection = sectionName === targetBroker;
        newConfData.push(line);
      } else if (inTargetSection) {
        const [key] = trimmed.split('=').map((s) => s.trim());
        if (key && localParams[key] !== undefined && keysToWrite.has(key)) {
          newConfData.push(`${key}=${localParams[key]}`);
          updatedInTargetSection.add(key);
        } else {
          newConfData.push(line);
        }
      } else {
        newConfData.push(line);
      }
    });

    if (inTargetSection) {
      keysToWrite.forEach((paramName) => {
        if (!updatedInTargetSection.has(paramName) && localParams[paramName] !== undefined) {
          newConfData.push(`${paramName}=${localParams[paramName]}`);
        }
      });
    }

    try {
      await dispatch(updateBrokerConfig({ hostUid, confdata: newConfData })).unwrap();
      setViewStatus(ViewStatus.SUCCESS);
    } catch (err) {
      setErrorMessage(typeof err === 'string' ? err : err.message || 'Failed to update broker configuration');
      setViewStatus(ViewStatus.ERROR);
    }
  };

  const handleClose = () => dispatch(closeBrokerPropertyModal());
  const modifiedCount = Object.keys(localParams).filter(k => localParams[k] !== initialParams[k]).length;
  const guardErrors = useMemo(() => collectGuardErrors(localParams, BROKER_PARAM_GUARDS), [localParams]);
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
                  {BROKER_PARAMETERS.filter(p => p.category === activeTab).map(p => (
                    <ParamRow
                      key={p.name}
                      param={p}
                      value={localParams[p.name] ?? p.default}
                      isModified={localParams[p.name] !== initialParams[p.name]}
                      onChange={handleParamChange}
                      error={guardErrors[p.name]}
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
