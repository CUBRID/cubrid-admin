import { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeDatabasePropertyModal } from '../databaseSlice';
import { hostApi } from '../../host/hostApi';
import { brokerApi } from '../../broker/brokerApi';
import { useCM } from '../../../constants/useCM';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { TabGroup } from '../../../components/ds/layout/TabGroup';
import { Table } from '../../../components/ds/layout/Table';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { Radio } from '../../../components/ds/forms/Radio';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import {
  ModalStatusLoading,
  ModalStatusSuccess,
  ModalStatusError
} from '../../../components/ds/feedback/ActionStatus';

// View states
const VIEW_FORM    = 'form';
const VIEW_LOADING = 'loading';
const VIEW_SUCCESS = 'success';
const VIEW_ERROR   = 'error';

const ADVANCED_PARAMS_SCHEMA = [
  { key: 'access_ip_control', type: 'bool(yes|no)', default: 'no', scope: 'SERVER' },
  { key: 'access_ip_control_file', type: 'string', default: '', scope: 'SERVER' },
  { key: 'async_commit', type: 'bool(yes|no)', default: 'no', scope: 'SERVER' },
  { key: 'backup_volume_max_size_bytes', type: 'int', default: '-1', scope: 'SERVER' },
  { key: 'block_ddl_statement', type: 'bool(yes|no)', default: 'no', scope: 'CLIENT' },
  { key: 'block_nowhere_statement', type: 'bool(yes|no)', default: 'no', scope: 'CLIENT' },
  { key: 'call_stack_dump_activation_list', type: 'string', default: '', scope: 'BOTH' },
  { key: 'call_stack_dump_deactivation_list', type: 'string', default: '', scope: 'BOTH' },
  { key: 'call_stack_dump_on_error', type: 'bool(yes|no)', default: 'no', scope: 'BOTH' },
  { key: 'compactdb_page_reclaim_only', type: 'int', default: '0', scope: 'SERVER' },
  { key: 'compat_numeric_division_scale', type: 'bool(yes|no)', default: 'no', scope: 'BOTH' },
  { key: 'compat_primary_key', type: 'bool(yes|no)', default: 'no', scope: 'CLIENT' },
  { key: 'csql_history_num', type: 'int', default: '50', scope: 'CLIENT' },
  { key: 'db_hosts', type: 'string', default: '', scope: 'CLIENT' },
  { key: 'dont_reuse_heap_file', type: 'bool(yes|no)', default: 'no', scope: 'SERVER' },
  { key: 'error_log', type: 'string', default: 'cubrid.err', scope: 'BOTH' },
  { key: 'file_lock', type: 'bool(yes|no)', default: 'yes', scope: 'SERVER' },
  { key: 'garbage_collection', type: 'bool(yes|no)', default: 'no', scope: 'CLIENT' },
  { key: 'group_commit_interval_in_msecs', type: 'int', default: '0', scope: 'SERVER' },
  { key: 'ha_mode', type: 'string(on|off|yes|no|replica)', default: 'off', scope: 'SERVER' },
  { key: 'ha_node_list', type: 'string', default: '', scope: 'SERVER' },
  { key: 'ha_port_id', type: 'int', default: '', scope: 'SERVER' },
  { key: 'hostvar_late_binding', type: 'bool(yes|no)', default: 'no', scope: 'CLIENT' },
  { key: 'index_scan_in_oid_order', type: 'bool(yes|no)', default: 'no', scope: 'CLIENT' },
  { key: 'index_scan_oid_buffer_pages', type: 'int', default: '4', scope: 'SERVER' },
  { key: 'index_scan_oid_buffer_size', type: 'int', default: '65536', scope: 'SERVER' },
  { key: 'insert_execution_mode', type: 'int', default: '1', scope: 'CLIENT' },
  { key: 'intl_mbs_support', type: 'bool(yes|no)', default: 'no', scope: 'CLIENT' },
  { key: 'lock_timeout_message_type', type: 'int', default: '0', scope: 'SERVER' },
  { key: 'max_plan_cache_entries', type: 'int', default: '1000', scope: 'BOTH' },
  { key: 'max_query_cache_entries', type: 'int', default: '-1', scope: 'SERVER' },
  { key: 'media_failure_support', type: 'bool(yes|no)', default: 'yes', scope: 'SERVER' },
  { key: 'oracle_style_empty_string', type: 'bool(yes|no)', default: 'no', scope: 'CLIENT' },
  { key: 'oracle_style_outerjoin', type: 'bool(yes|no)', default: 'no', scope: 'CLIENT' },
  { key: 'pthread_scope_process', type: 'bool(yes|no)', default: 'yes', scope: 'SERVER' },
  { key: 'query_cache_mode', type: 'int', default: '0', scope: 'SERVER' },
  { key: 'query_cache_size_in_pages', type: 'int', default: '-1', scope: 'SERVER' },
  { key: 'single_byte_compare', type: 'bool(yes|no)', default: 'no', scope: 'SERVER' },
  { key: 'temp_file_max_size_in_pages', type: 'int', default: '-1', scope: 'SERVER' },
  { key: 'temp_file_memory_size_in_pages', type: 'int', default: '4', scope: 'SERVER' },
  { key: 'temp_volume_path', type: 'string', default: '', scope: 'SERVER' },
  { key: 'uj_job_timeout', type: 'int', default: '0', scope: 'SERVER' },
  { key: 'unfill_factor', type: 'float', default: '0.1', scope: 'SERVER' },
  { key: 'volume_extension_path', type: 'string', default: '', scope: 'SERVER' }
];

// General params table schema — excludes the six buffer pages/size keys,
// which get their own CUBRID Admin-style radio (pages vs size) groups above
// the table instead of flat rows (see BUFFER_GROUPS / BufferChoiceGroup).
const GENERAL_PARAMS_SCHEMA = {
  lock_escalation: '100000',
  lock_timeout_in_secs: '-1',
  deadlock_detection_interval_in_secs: '1',
  checkpoint_interval_in_mins: '1000',
  isolation_level: 'TRAN_REP_CLASS_UNCOMMIT_INSTANCE',
  cubrid_port_id: '1523',
  max_clients: '100',
  auto_restart_server: 'no',
  replication: 'no'
};

const GENERAL_PARAMS_KEYS = Object.keys(GENERAL_PARAMS_SCHEMA);

// Mirrors CA's PageSizeChoiceComposite: one radio picks pages, the other
// picks size (+ unit); default page-count/size defaults from dbBaseParameters.
const BUFFER_GROUPS = [
  { type: 'data', groupLabel: CM => CM.dataBufferAllocLabel, pagesKey: 'data_buffer_pages', sizeKey: 'data_buffer_size', pagesDefault: '25000', sizeDefault: '512' },
  { type: 'sort', groupLabel: CM => CM.sortBufferAllocLabel, pagesKey: 'sort_buffer_pages', sizeKey: 'sort_buffer_size', pagesDefault: '16', sizeDefault: '2' },
  { type: 'log',  groupLabel: CM => CM.logBufferAllocLabel,  pagesKey: 'log_buffer_pages',  sizeKey: 'log_buffer_size',  pagesDefault: '50', sizeDefault: '4' },
];
const BUFFER_UNITS = ['KB', 'MB', 'GB', 'TB'];
const BUFFER_UNIT_LETTER = { KB: 'K', MB: 'M', GB: 'G', TB: 'T' };

const ISOLATION_LEVEL_OPTIONS = ['TRAN_SERIALIZABLE', 'TRAN_REP_CLASS_REP_INSTANCE', 'TRAN_REP_CLASS_COMMIT_INSTANCE', 'TRAN_REP_CLASS_UNCOMMIT_INSTANCE', 'TRAN_COMMIT_CLASS_COMMIT_INSTANCE', 'TRAN_COMMIT_CLASS_UNCOMMIT_INSTANCE'];
const YES_NO_OPTIONS = ['yes', 'no'];

// Keys whose value is picked from a fixed option list rather than free text.
const SELECT_OPTIONS_BY_KEY = {
  isolation_level: ISOLATION_LEVEL_OPTIONS,
  auto_restart_server: YES_NO_OPTIONS,
  replication: YES_NO_OPTIONS,
};

/* ─── ParamNameCell — shared "modified" dot + mono key label ─── */
function ParamNameCell({ label, isModified }) {
  return (
    <div className="flex items-center gap-1.5">
      {isModified && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
      <span className={`text-13 font-mono truncate ${isModified ? 'text-amber-500 font-bold' : 'text-slate-600 dark:text-slate-400'}`}>
        {label}
      </span>
    </div>
  );
}

/* ─── ParamValueCell — select for fixed-option keys, else free-text input ─── */
function ParamValueCell({ paramKey, value, defaultValue, onChange, disabled, disabledHint }) {
  const options = SELECT_OPTIONS_BY_KEY[paramKey];
  if (options) {
    return (
      <div title={disabled ? disabledHint : undefined}>
        <Select
          size="sm"
          value={value ?? defaultValue}
          options={options.map(o => ({ value: o, label: o }))}
          onChange={e => onChange(e.target.value)}
          className="w-full max-w-[260px]"
          disabled={disabled}
        />
      </div>
    );
  }
  return (
    <Input
      size="sm"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={defaultValue || '—'}
      className="w-full max-w-[260px]"
    />
  );
}

/* ─── BufferChoiceGroup — CA's PageSizeChoiceComposite: radio(pages)/radio(size+unit) ─── */
function BufferChoiceGroup({ group, mode, unit, pagesValue, sizeValue, onModeChange, onUnitChange, onPagesChange, onSizeChange }) {
  const CM = useCM();
  return (
    <div className="rounded-xl border border-slate-100 dark:border-white/6 p-4">
      <p className="text-11 font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">{group.groupLabel(CM)}</p>
      <div className="space-y-2.5">
        <div className="flex items-center gap-3">
          <Radio
            name={`${group.type}-buffer-mode`}
            value="pages"
            checked={mode === 'pages'}
            onChange={() => onModeChange('pages')}
            label={<span className="text-12 font-mono w-[140px] shrink-0 inline-block">{group.pagesKey}</span>}
          />
          <Input
            size="sm"
            type="number"
            value={pagesValue ?? ''}
            onChange={e => onPagesChange(e.target.value)}
            placeholder={group.pagesDefault}
            disabled={mode !== 'pages'}
            className={`flex-1 max-w-[200px] ${mode !== 'pages' ? 'opacity-40' : ''}`}
          />
        </div>
        <div className="flex items-center gap-3">
          <Radio
            name={`${group.type}-buffer-mode`}
            value="size"
            checked={mode === 'size'}
            onChange={() => onModeChange('size')}
            label={<span className="text-12 font-mono w-[140px] shrink-0 inline-block">{group.sizeKey}</span>}
          />
          <Input
            size="sm"
            type="number"
            value={sizeValue ?? ''}
            onChange={e => onSizeChange(e.target.value)}
            placeholder={group.sizeDefault}
            disabled={mode !== 'size'}
            className={`flex-1 ${mode !== 'size' ? 'opacity-40' : ''}`}
          />
          {/* FormField (shared by Input/Select) always includes a base
              "w-full" class, which beats a plain width class passed in from
              here — constrain via an outer sized wrapper instead, same as
              the rest of this modal's other Select usages. */}
          <div className={`w-[92px] shrink-0 ${mode !== 'size' ? 'opacity-40' : ''}`}>
            <Select
              size="sm"
              value={unit}
              options={BUFFER_UNITS.map(u => ({ value: u, label: u }))}
              onChange={e => onUnitChange(e.target.value)}
              disabled={mode !== 'size'}
              className="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DatabasePropertyModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isDatabasePropertyModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid, authorizedHosts } = useSelector((state) => state.host, shallowEqual);
  const isAuthorized = selectedHostUid && authorizedHosts.includes(selectedHostUid);
  const {
    error: actionError,
    startAction,
    endSuccess,
    endError,
    resetAction,
    isLoading,
    isSuccess,
    isError
  } = useActionState();

  const [activeTab, setActiveTab] = useState('General');
  const [activeSidebar, setActiveSidebar] = useState('Server Parameter');
  const [fetching, setFetching] = useState(false);
  const [params, setParams] = useState({});
  const [rawLines, setRawLines] = useState([]);
  const [bufferMode, setBufferMode] = useState({ data: 'size', sort: 'size', log: 'size' });
  const [bufferUnit, setBufferUnit] = useState({ data: 'MB', sort: 'MB', log: 'MB' });
  const [brokers, setBrokers] = useState([]);
  const [connectionInfo, setConnectionInfo] = useState({ brokerIp: 'localhost', brokerPort: '', charset: 'UTF-8' });

  useEffect(() => {
    if (isDatabasePropertyModalOpen) {
      resetAction();
      setParams({});
      setRawLines([]);
      setActiveSidebar('Server Parameter');
    }
  }, [isDatabasePropertyModalOpen, selectedDatabase, resetAction]);

  useEffect(() => {
    if (isDatabasePropertyModalOpen && selectedHostUid && isAuthorized) {
      const fetchBrokers = async () => {
        try {
          const response = await brokerApi.getBrokerList(selectedHostUid);
          const brokerList = response.result || (Array.isArray(response) ? response[0]?.broker : []);
          if (brokerList && Array.isArray(brokerList)) {
            const list = brokerList.map(b => ({ label: `${b.name} [${b.port}/${b.status || b.state}]`, port: b.port }));
            setBrokers(list);
            setConnectionInfo(prev => (!prev.brokerPort && list.length > 0) ? { ...prev, brokerPort: list[0].label } : prev);
          }
        } catch (err) { console.error('Failed to fetch brokers:', err); }
      };
      fetchBrokers();
    }
  }, [isDatabasePropertyModalOpen, selectedHostUid, isAuthorized]);

  useEffect(() => {
    if (isDatabasePropertyModalOpen && selectedHostUid && isAuthorized && activeSidebar !== 'Connection Information') {
      const fetchParams = async () => {
        setFetching(true);
        try {
          const response = await hostApi.getHostConfig(selectedHostUid, 'cubridconf');
          const lines = response?.conflist?.[0]?.confdata || [];
          setRawLines(lines);
          let currentSection = '';
          const newParams = {};
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) { currentSection = trimmed.slice(1, -1).toLowerCase(); continue; }
            const target = selectedDatabase ? `@${selectedDatabase.toLowerCase()}` : 'common';
            if (currentSection === 'common' || (selectedDatabase && currentSection === target)) {
              const [key, ...valueParts] = trimmed.split('=');
              const k = key?.trim();
              const v = valueParts.join('=').trim();
              if (k) newParams[k] = v;
            }
          }

          // Mirrors CA's PageSizeChoiceComposite#initBtnState: prefer the
          // pages key if it has a value, else fall back to size (+ unit
          // parsed off the trailing letter, e.g. "512M" -> 512 / MB).
          const nextMode = {}, nextUnit = {};
          BUFFER_GROUPS.forEach(({ type, pagesKey, sizeKey }) => {
            const pagesVal = newParams[pagesKey];
            const sizeVal = newParams[sizeKey];
            if (pagesVal && pagesVal.trim() !== '') {
              nextMode[type] = 'pages';
            } else if (sizeVal && sizeVal.trim() !== '') {
              nextMode[type] = 'size';
              const letter = sizeVal.slice(-1).toUpperCase();
              const unitEntry = Object.entries(BUFFER_UNIT_LETTER).find(([, l]) => l === letter);
              if (unitEntry) {
                nextUnit[type] = unitEntry[0];
                newParams[sizeKey] = sizeVal.slice(0, -1);
              }
            } else {
              nextMode[type] = 'size';
            }
          });
          setBufferMode(prev => ({ ...prev, ...nextMode }));
          setBufferUnit(prev => ({ ...prev, ...nextUnit }));
          setParams(newParams);
        } catch (err) { console.error('Failed to fetch config:', err); }
        finally { setFetching(false); }
      };
      fetchParams();
    }
  }, [isDatabasePropertyModalOpen, selectedDatabase, selectedHostUid, activeSidebar, isAuthorized]);

  const handleApply = async () => {
    if (activeSidebar === 'Connection Information') { dispatch(closeDatabasePropertyModal()); return; }
    startAction();
    try {
      // Reconcile the pages/size radio choice per buffer group: only the
      // selected side is written, and the size value gets its unit letter
      // suffixed back on (e.g. 512 + MB -> "512M"), matching cubrid.conf.
      const saveParams = { ...params };
      BUFFER_GROUPS.forEach(({ type, pagesKey, sizeKey }) => {
        if (bufferMode[type] === 'pages') {
          delete saveParams[sizeKey];
        } else {
          const val = params[sizeKey];
          if (val) saveParams[sizeKey] = `${val}${BUFFER_UNIT_LETTER[bufferUnit[type]]}`;
          delete saveParams[pagesKey];
        }
      });

      const sectionName = selectedDatabase ? `[@${selectedDatabase.toLowerCase()}]` : '[common]';
      let lines = [...rawLines];
      let sectionStartIndex = -1, sectionEndIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().toLowerCase() === sectionName.toLowerCase()) {
          sectionStartIndex = i;
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim().startsWith('[') && lines[j].trim().endsWith(']')) { sectionEndIndex = j; break; }
          }
          if (sectionEndIndex === -1) sectionEndIndex = lines.length;
          break;
        }
      }
      if (sectionStartIndex === -1) { lines.push(''); lines.push(sectionName); sectionStartIndex = lines.length - 1; sectionEndIndex = lines.length; }
      const sectionLines = lines.slice(sectionStartIndex + 1, sectionEndIndex);
      const otherBefore = lines.slice(0, sectionStartIndex + 1);
      const otherAfter = lines.slice(sectionEndIndex);
      const updatedSection = [...sectionLines];
      Object.entries(saveParams).forEach(([key, value]) => {
        let found = false;
        for (let i = 0; i < updatedSection.length; i++) {
          const trimmed = updatedSection[i].trim();
          if (trimmed.startsWith('#')) continue;
          if (trimmed.split('=')[0].trim().toLowerCase() === key.toLowerCase()) { updatedSection[i] = `${key}=${value}`; found = true; break; }
        }
        if (!found) updatedSection.push(`${key}=${value}`);
      });
      await hostApi.setHostConfig(selectedHostUid, { confname: 'cubridconf', confdata: [...otherBefore, ...updatedSection, ...otherAfter] });
      endSuccess(CM.configurationAppliedMsg(selectedDatabase));
    } catch (err) {
      endError(typeof err === 'string' ? err : (err.message || CM.configPatchRejectedMsg));
    }
  };

  useEffect(() => {
    if (!isDatabasePropertyModalOpen) {
      setTimeout(() => resetAction(), 300);
    }
  }, [isDatabasePropertyModalOpen, resetAction]);

  const handleClose = () => {
    dispatch(closeDatabasePropertyModal());
    setParams({});
  };

  const handleReset = () => {
    setParams({});
  };

  // CUBRID forces auto_restart_server off in-process whenever HA is enabled
  // (system_parameter.c's prm_tune_parameters — an abnormally-terminated
  // server should fail over via HA, not blindly self-restart in place), so
  // leaving this editable here would show a "yes" that the running server
  // silently ignores. Mirrors the off-keyword set system_parameter.c itself
  // recognizes for ha_mode (only "on" would previously have been detected).
  const HA_MODE_OFF_KEYWORDS = ['off', 'no', 'n', '0', 'false'];
  const isHaEnabled = params.ha_mode !== undefined
    && !HA_MODE_OFF_KEYWORDS.includes(String(params.ha_mode).trim().toLowerCase());

  const generalRows = useMemo(() => GENERAL_PARAMS_KEYS.map(key => ({
    key,
    default: GENERAL_PARAMS_SCHEMA[key],
    value: params[key],
    isModified: params[key] !== undefined,
  })), [params]);

  const advancedRows = useMemo(() => ADVANCED_PARAMS_SCHEMA
    .filter(p => !GENERAL_PARAMS_KEYS.includes(p.key))
    .map(p => ({ ...p, value: params[p.key] !== undefined ? params[p.key] : p.default, isModified: params[p.key] !== undefined }))
  , [params]);

  const navItems = selectedDatabase
    ? [{ id: 'Server Parameter', icon: 'tune', label: CM.serverNavLabel }, { id: 'Connection Information', icon: 'cable', label: CM.connectionNavLabel }]
    : [{ id: 'Server Parameter', icon: 'tune', label: CM.serverNavLabel }];

  const SERVER_TABS = [
    { id: 'General', label: CM.generalParamsTab, icon: 'tune' },
    { id: 'Advanced', label: CM.advancedParamsTab, icon: 'settings_applications' },
  ];

  if (!isDatabasePropertyModalOpen) return null;

  /* ─── LOADING VIEW ─── */
  if (isLoading) return (
    <Modal isOpen title={CM.applyingConfigTitle} icon="settings" onClose={handleClose} maxWidth="900px" showCloseButton={false}>
      <ModalStatusLoading
        title={CM.updatingConfigTitle}
        subtitle={CM.updatingConfigSubtitle}
      />
    </Modal>
  );

  /* ─── SUCCESS VIEW ─── */
  if (isSuccess) return (
    <Modal isOpen title={CM.updateSuccessful} icon="check_circle" iconVariant="success" onClose={handleClose} maxWidth="900px">
      <ModalStatusSuccess
        title={CM.configurationReIndexed}
        message={CM.configurationAppliedMsg(selectedDatabase)}
        onConfirm={handleClose}
        confirmText={CM.confirmReturn}
      />
    </Modal>
  );

  /* ─── ERROR VIEW ─── */
  if (isError) return (
    <Modal isOpen title={CM.updateRejected} icon="error" iconVariant="danger" onClose={resetAction} maxWidth="900px">
      <ModalStatusError
        title={CM.applyFailedTitle}
        error={actionError}
        guidance={CM.databasePropertyGuidance}
        onRetry={handleApply}
        onCancel={resetAction}
        retryText={CM.retryPatch}
        cancelText={CM.cancel}
      />
    </Modal>
  );

  // No separate Default column here either — same convention as the
  // Advanced table (and CA itself): the value cell shows the current value,
  // falling back to the default as a placeholder.
  const generalColumns = [
    { header: CM.parameter, accessor: 'key', width: '45%', render: (_, row) => <ParamNameCell label={row.key} isModified={row.isModified} /> },
    {
      header: CM.value, accessor: 'value', width: '55%', sortable: false,
      render: (_, row) => (
        <ParamValueCell
          paramKey={row.key}
          value={row.key === 'auto_restart_server' && isHaEnabled ? 'no' : row.value}
          defaultValue={row.default}
          onChange={(val) => setParams({ ...params, [row.key]: val })}
          disabled={row.key === 'auto_restart_server' && isHaEnabled}
          disabledHint={CM.autoRestartHaDisabledHint}
        />
      ),
    },
  ];

  // Column set/order mirrors CUBRID Admin's own advanced-parameter table
  // (DatabaseConfigPropertyPage.java): Parameter Name, Parameter Type (the
  // SERVER/CLIENT/BOTH scope), Value Type (the bool/int/string descriptor),
  // Parameter Value. CA has no separate "Default" column — the value cell
  // itself shows the current value, falling back to the default.
  const advancedColumns = [
    { header: CM.parameter, accessor: 'key', width: '30%', render: (_, row) => <ParamNameCell label={row.key} isModified={row.isModified} /> },
    {
      header: CM.parameterTypeLabel, accessor: 'scope', width: '16%',
      render: (val) => {
        const scopeColors = {
          SERVER: 'text-sky-500 bg-sky-500/8 border-sky-500/20',
          CLIENT: 'text-violet-500 bg-violet-500/8 border-violet-500/20',
          BOTH: 'text-emerald-500 bg-emerald-500/8 border-emerald-500/20',
        };
        return <span className={`text-11 font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${scopeColors[val]}`}>{val}</span>;
      },
    },
    { header: CM.valueTypeLabel, accessor: 'type', width: '18%', render: (val) => <span className="text-12 font-mono text-slate-400 dark:text-slate-500">{val}</span> },
    {
      header: CM.parameterValueLabel, accessor: 'value', width: '36%', sortable: false,
      render: (_, row) => {
        const hasBoolOptions = row.type.includes('yes|no') || row.type.includes('on|off');
        const boolOptions = row.type.includes('on|off') && row.type.includes('yes|no')
          ? (row.type.includes('replica') ? ['on', 'off', 'yes', 'no', 'replica'] : ['on', 'off', 'yes', 'no'])
          : row.type.includes('on|off') ? ['on', 'off'] : ['yes', 'no'];
        return hasBoolOptions ? (
          <Select
            size="sm"
            value={row.value}
            options={boolOptions.map(o => ({ value: o, label: o.toUpperCase() }))}
            onChange={e => setParams({ ...params, [row.key]: e.target.value })}
            className="w-full max-w-[220px]"
          />
        ) : (
          <Input
            type={['int', 'short', 'numeric', 'float', 'double'].some(t => row.type.toLowerCase().startsWith(t)) ? 'number' : 'text'}
            size="sm"
            value={row.value}
            onChange={e => setParams({ ...params, [row.key]: e.target.value })}
            className="w-full max-w-[220px]"
          />
        );
      },
    },
  ];

  /* ─── FORM VIEW ─── */
  return (
    <Modal
      isOpen={isDatabasePropertyModalOpen}
      onClose={handleClose}
      title={activeSidebar === 'Connection Information'
        ? `${selectedDatabase} · Connection`
        : (selectedDatabase ? CM.registrySubtitle(selectedDatabase) : CM.kernelParamsTitle)}
      subtitle={activeSidebar === 'Connection Information'
        ? CM.brokerCharsetConfigDesc
        : CM.deepSystemConfigDesc}
      icon={activeSidebar === 'Connection Information' ? 'cable' : 'tune'}
      maxWidth="960px"
      testId="database-property"
      footer={
        <div className="flex justify-between items-center w-full">
          <div>
            {Object.keys(params).length > 0 && (
              <Button
                variant="ghost"
                icon="restart_alt"
                onClick={handleReset}
                className="text-amber-500 hover:bg-amber-500/5"
              >
                {CM.resetToOriginalBtn}
              </Button>
            )}
          </div>
          <div className="flex gap-2.5">
            <Button data-testid="database-property-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
            <Button data-testid="database-property-apply-btn" variant="primary" onClick={handleApply} icon="save" className="min-w-[140px]">{CM.applyChanges}</Button>
          </div>
        </div>
      }
    >
      <div className="flex h-[600px] -m-5 overflow-hidden">

        {/* ─── Sidebar ─── */}
        <div className="w-[180px] bg-slate-900/60 dark:bg-black/40 border-r border-white/6 flex flex-col shrink-0">
          <div className="px-4 py-4 border-b border-white/5">
            <p className="text-11 font-black uppercase tracking-[0.2em] text-slate-500">{CM.navigation}</p>
          </div>
          <div className="py-2 flex-1">
            {navItems.map(({ id, icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveSidebar(id)}
                className={`relative w-full flex items-center gap-3 px-4 py-3.5 text-left group ${
                  activeSidebar === id
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/4'
                }`}
              >
                {activeSidebar === id && (
                  <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-amber-500 rounded-r-full shadow-[2px_0_8px_rgba(212,163,0,0.4)]" />
                )}
                <Icon
                  name={icon}
                  size="16px"
                  weight={activeSidebar === id ? 500 : 300}
                  className={activeSidebar === id ? 'text-amber-500' : 'text-slate-600 group-hover:text-slate-400'}
                />
                <span className="text-12 font-black uppercase tracking-widest">{label}</span>
              </button>
            ))}
          </div>
          {/* Bottom context info */}
          {selectedDatabase && (
            <div className="px-4 py-3 border-t border-white/5">
              <p className="text-10 uppercase tracking-widest text-slate-600 font-bold mb-1">{CM.context}</p>
              <p className="text-12 font-mono font-black text-amber-500/80 truncate">{selectedDatabase}</p>
            </div>
          )}
        </div>

        {/* ─── Main Content ─── */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-transparent overflow-hidden">

          {/* Tab bar — only for Server Parameter */}
          {activeSidebar === 'Server Parameter' && (
            <div className="p-4 border-b border-slate-100 dark:border-white/6 flex items-center justify-between">
              <TabGroup
                tabs={SERVER_TABS}
                active={activeTab}
                onChange={setActiveTab}
                fullWidth={false}
              />
              {/* Modified indicator */}
              {Object.keys(params).length > 0 && (
                <StatusBadge label={`${Object.keys(params).length} modified`} variant="amber" pulse={true} className="rounded-full" />
              )}
            </div>
          )}

          {/* Content area */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {fetching ? (
              <div className="h-full flex flex-col items-center justify-center gap-5">
                <div className="w-10 h-10 border-2 border-amber-500/10 border-t-amber-500 rounded-full animate-spin" />
                <div className="text-center">
                  <p className="text-11 uppercase tracking-[0.2em] text-slate-400 font-black mb-1">{CM.loadingLabel}</p>
                  <p className="text-12 text-slate-400 dark:text-slate-500 italic font-medium">{CM.queryingHostRegistry}</p>
                </div>
              </div>

            ) : activeSidebar === 'Connection Information' ? (
              /* ─── CONNECTION INFO ─── */
              <div className="p-6 space-y-5">
                {/* Header Banner */}
                <InfoBanner title={CM.brokerConnection}>
                  {CM.webManagerConnectionDesc(selectedDatabase)}
                </InfoBanner>

                <div className="space-y-3 p-5 bg-slate-50 dark:bg-white/2 border border-slate-100 dark:border-white/6 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-[140px] shrink-0">
                      <p className="text-11 uppercase tracking-widest text-slate-400 font-black mb-0.5">{CM.brokerIp}</p>
                      <p className="text-10 font-mono text-slate-400 dark:text-slate-600">{CM.publicAddress}</p>
                    </div>
                    <div className="flex-1">
                      <Input
                        value={connectionInfo.brokerIp}
                        onChange={e => setConnectionInfo({ ...connectionInfo, brokerIp: e.target.value })}
                        size="sm"
                        icon="dns"
                      />
                    </div>
                  </div>
                  <div className="h-px bg-slate-100 dark:bg-white/5" />
                  <div className="flex items-center gap-4">
                    <div className="w-[140px] shrink-0">
                      <p className="text-11 uppercase tracking-widest text-slate-400 font-black mb-0.5">{CM.servicePort}</p>
                      <p className="text-10 font-mono text-slate-400 dark:text-slate-600">{CM.activeBroker}</p>
                    </div>
                    <div className="flex-1">
                      <Select
                        value={connectionInfo.brokerPort}
                        options={brokers.map(b => ({ value: b.label, label: b.label }))}
                        onChange={e => setConnectionInfo({ ...connectionInfo, brokerPort: e.target.value })}
                        size="sm"
                      />
                    </div>
                  </div>
                  <div className="h-px bg-slate-100 dark:bg-white/5" />
                  <div className="flex items-center gap-4">
                    <div className="w-[140px] shrink-0">
                      <p className="text-11 uppercase tracking-widest text-slate-400 font-black mb-0.5">{CM.textEncoding}</p>
                      <p className="text-10 font-mono text-slate-400 dark:text-slate-600">{CM.charset}</p>
                    </div>
                    <div className="flex-1">
                      <Select
                        value={connectionInfo.charset}
                        options={['UTF-8', 'EUC-KR', 'ISO-8859-1', 'UHC'].map(o => ({ value: o, label: o }))}
                        onChange={e => setConnectionInfo({ ...connectionInfo, charset: e.target.value })}
                        size="sm"
                      />
                    </div>
                  </div>
                </div>

                <InfoBanner title={CM.synchronizationNotice}>
                  {CM.brokerParamsNotice}
                </InfoBanner>
              </div>

            ) : activeTab === 'General' ? (
              /* ─── GENERAL PARAMETERS ─── */
              <div className="p-6 space-y-6">
                <div className="flex flex-col gap-3">
                  {BUFFER_GROUPS.map(group => (
                    <BufferChoiceGroup
                      key={group.type}
                      group={group}
                      mode={bufferMode[group.type]}
                      unit={bufferUnit[group.type]}
                      pagesValue={params[group.pagesKey]}
                      sizeValue={params[group.sizeKey]}
                      onModeChange={(m) => setBufferMode(prev => ({ ...prev, [group.type]: m }))}
                      onUnitChange={(u) => setBufferUnit(prev => ({ ...prev, [group.type]: u }))}
                      onPagesChange={(v) => setParams({ ...params, [group.pagesKey]: v })}
                      onSizeChange={(v) => setParams({ ...params, [group.sizeKey]: v })}
                    />
                  ))}
                </div>

                <div className="space-y-3">
                  <SectionHeader title={CM.standardParameters} icon="settings" />
                  <Table columns={generalColumns} data={generalRows} zebra bordered />
                </div>
              </div>

            ) : (
              /* ─── ADVANCED PARAMETERS TABLE ─── */
              <div>
                <div className="px-6 py-6">
                  <InfoBanner>
                    {CM.advancedParamsWarning}
                  </InfoBanner>
                </div>
                <div className="px-6 pb-6">
                  <Table columns={advancedColumns} data={advancedRows} zebra bordered />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
