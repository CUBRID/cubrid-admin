import { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeDatabasePropertyModal } from '../databaseSlice';
import { hostApi } from '../../host/hostApi';
import { brokerApi } from '../../broker/brokerApi';
import { fetchHostEnv } from '../../host/hostSlice';
import { openTab } from '../../layout/layoutSlice';
import { useCM } from '../../../constants/useCM';

import { Icon } from '../../../components/ds/foundation/Icon';
import { Modal } from '../../../components/ds/layout/Modal';
import { ConfirmDialog } from '../../../components/ds/layout/ConfirmDialog';
import { Button } from '../../../components/ds/foundation/Button';
import { TabGroup } from '../../../components/ds/layout/TabGroup';
import { Table } from '../../../components/ds/layout/Table';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { parseConfText, parseEngineSizeToBytes, validateEffectiveParams } from '@api-interfaces';

// The param list itself — which keys exist, their category/type/guard/
// default — no longer lives here. It comes from the connected host's
// `getEnv` response (`paramSchemas.database`, cached in Redux's
// `hostEnvs`), already resolved for that host's actual engine version by
// the server (see libs/api-interfaces/src/param-schema and
// CmsConfigService.getEnv). This modal only keeps the purely
// presentational pieces a version-aware server schema has no business
// owning: i18n label text and the buffer radio groups' fixed 4-pair UI
// layout (see `BUFFER_GROUP_LABELS` and `useBufferGroups` below).
const BUFFER_GROUP_LABELS = {
  data: CM => CM.dataBufferAllocLabel,
  sort: CM => CM.sortBufferAllocLabel,
  log: CM => CM.logBufferAllocLabel,
  indexScanOid: CM => CM.indexScanOidBufferAllocLabel,
};
const DEFAULT_BUFFER_MODE = { data: 'size', sort: 'size', log: 'size', indexScanOid: 'size' };

/**
 * Groups the schema's `buffer`-category entries (pages/size pairs) by
 * `bufferGroup.pairKey`, attaching each pair's display-label function —
 * `groupLabel` is called as `group.groupLabel(CM)` at render time, same
 * as the old hardcoded BUFFER_GROUPS did.
 */
function buildBufferGroups(databaseParamSchema) {
  const byPairKey = {};
  for (const entry of databaseParamSchema) {
    if (entry.category !== 'buffer' || !entry.bufferGroup) continue;
    const { pairKey, role } = entry.bufferGroup;
    byPairKey[pairKey] ??= { type: pairKey, groupLabel: BUFFER_GROUP_LABELS[pairKey] ?? (() => pairKey) };
    if (role === 'pages') {
      byPairKey[pairKey].pagesKey = entry.key;
      byPairKey[pairKey].pagesDefault = entry.default;
    } else {
      byPairKey[pairKey].sizeKey = entry.key;
      byPairKey[pairKey].sizeDefault = entry.default;
    }
  }
  return Object.values(byPairKey);
}

// Values stay exactly as written in cubrid.conf ("512M", "536870912",
// "0.5G" ...) — the engine reads a unitless size as bytes, so re-attaching
// a display unit would change what's validated.
function getEffectiveParams(params, bufferMode, bufferGroups) {
  const effectiveParams = { ...params };
  bufferGroups.forEach(({ type, pagesKey, sizeKey }) => {
    delete effectiveParams[bufferMode[type] === 'pages' ? sizeKey : pagesKey];
  });
  return effectiveParams;
}

// A blank field falls back to the schema default as its displayed value, so
// it's trivially "the default". Otherwise compare the way the engine reads
// the value — "512M" and "536870912" are the same size, "ON" and "yes" the
// same boolean. Whether it's actually written anywhere is a separate
// question (see `isImplicit` at each call site).
const TRUE_WORDS = ['yes', 'y', '1', 'true', 'on'];
function canonicalValue(guard, value) {
  const text = String(value ?? '').trim();
  if (guard?.kind === 'size') return parseEngineSizeToBytes(text) ?? text;
  if (guard?.kind === 'boolean') return TRUE_WORDS.includes(text.toLowerCase());
  if (guard?.kind === 'enum') return text.toLowerCase();
  return text;
}
function isEffectivelyDefault(guard, value, defaultValue) {
  const effective = (value !== undefined && value !== '') ? value : defaultValue;
  return canonicalValue(guard, effective) === canonicalValue(guard, defaultValue);
}

/* ─── ParamNameCell — shared "modified" dot + mono key label ─── */
// Two independent, non-exclusive badges — conflating them used to make one
// badge mean both "this value happens to equal the default" and "nothing is
// actually written here", which are different facts that can disagree (an
// explicit conf line can coincidentally match the default; an implicit field
// is always shown as the default, but not every default-valued field is
// implicit).
function ParamNameCell({ label, isModified, isDefaultValue, defaultValueHint, defaultValueBadge, isImplicit, implicitHint, implicitBadge }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {isModified && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
      <span className={`text-13 font-mono font-medium truncate ${isModified ? 'text-amber-500' : 'text-slate-600 dark:text-slate-400'}`}>
        {label}
      </span>
      {/* The effective value (explicit or not) matches the schema's own
          default — purely informational, says nothing about whether it's
          actually written in the conf file. */}
      {isDefaultValue && (
        <span
          title={defaultValueHint}
          className="shrink-0 text-10 font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500"
        >
          {defaultValueBadge}
        </span>
      )}
      {/* Not in the conf file at all — the value shown is purely the
          engine's own built-in default, not something anyone set. Hidden
          the moment the field holds a real value (typed or loaded). Dashed
          border signals "not actually there", distinct from the solid
          Default badge above. */}
      {isImplicit && (
        <span
          title={implicitHint}
          className="shrink-0 text-10 font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-dashed border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500"
        >
          {implicitBadge}
        </span>
      )}
    </div>
  );
}

/* ─── ParamValueCell — read-only display; editing happens in the text editor ─── */
// Values here are never writable from this table — see the Server
// Parameter panel's banner/button that opens the raw text editor instead.
// `error` is still surfaced (a currently-stored value that fails its own
// guard) purely as a passive diagnostic, same rule engine as the text
// editor's own save-time check.
function ParamValueCell({ value, defaultValue, error, hint }) {
  const hasValue = value !== undefined && value !== '';
  return (
    <div className="w-full max-w-none" title={error}>
      <span className={`text-13 font-mono ${hasValue ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500 italic'}`}>
        {hasValue ? value : (defaultValue || '—')}
      </span>
      {error && <p className="text-11 text-rose-500 mt-0.5">{error}</p>}
      {!error && hint && <p className="text-11 text-slate-400 dark:text-slate-500 italic mt-0.5">{hint}</p>}
    </div>
  );
}

/* ─── BufferChoiceGroup — read-only display of the active pages/size choice ─── */
// Mirrors CA's PageSizeChoiceComposite layout (pages row, size+unit row),
// but neither row is editable here — only whichever side is currently
// active in cubrid.conf is shown with a real value; the inactive side
// stays dimmed. Editing happens in the text editor.
function BufferChoiceGroup({ group, mode, pagesValue, sizeValue, pagesError, sizeError }) {
  const CM = useCM();
  return (
    <div className="rounded-xl border border-slate-100 dark:border-white/6 p-4">
      <p className="text-11 font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">{group.groupLabel(CM)}</p>
      <div className="space-y-2.5">
        <div className={`flex items-center gap-3 ${mode !== 'pages' ? 'opacity-40' : ''}`} title={mode === 'pages' ? pagesError : undefined}>
          <span className="text-12 font-mono w-[220px] shrink-0 truncate" title={group.pagesKey}>{group.pagesKey}</span>
          <span className={`text-13 font-mono flex-1 ${pagesError && mode === 'pages' ? 'text-rose-500' : 'text-slate-600 dark:text-slate-300'}`}>
            {mode === 'pages' ? (pagesValue || group.pagesDefault || '—') : '—'}
          </span>
        </div>
        <div className={`flex items-center gap-3 ${mode !== 'size' ? 'opacity-40' : ''}`} title={mode === 'size' ? sizeError : undefined}>
          <span className="text-12 font-mono w-[220px] shrink-0 truncate" title={group.sizeKey}>{group.sizeKey}</span>
          <span className={`text-13 font-mono flex-1 ${sizeError && mode === 'size' ? 'text-rose-500' : 'text-slate-600 dark:text-slate-300'}`}>
            {mode === 'size' ? (sizeValue || group.sizeDefault || '—') : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── ReadOnlyTableNotice — points the user at the raw text editor for edits ─── */
function ReadOnlyTableNotice({ onOpenEditor, CM }) {
  return (
    <InfoBanner variant="info">
      <div className="flex items-center justify-between gap-4">
        <span>{CM.paramTableReadOnlyNotice}</span>
        <Button
          data-testid="database-property-open-editor-inline-btn"
          variant="secondary"
          size="sm"
          icon="edit"
          onClick={onOpenEditor}
          className="shrink-0"
        >
          {CM.openInTextEditorBtn}
        </Button>
      </div>
    </InfoBanner>
  );
}

export default function DatabasePropertyModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isDatabasePropertyModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid, authorizedHosts } = useSelector((state) => state.host, shallowEqual);
  const isAuthorized = selectedHostUid && authorizedHosts.includes(selectedHostUid);
  // Resolved per this host's actual engine version by the server (see
  // CmsConfigService.getEnv) — populated into `hostEnvs` by whatever
  // already triggers `fetchHostEnv` on host activation/login. The
  // defensive dispatch below only matters if this modal somehow opens
  // before that's happened.
  const hostEnv = useSelector((state) => state.host.hostEnvs[selectedHostUid]);
  const databaseParamSchema = useMemo(() => hostEnv?.paramSchemas?.database ?? [], [hostEnv]);
  const bufferGroups = useMemo(() => buildBufferGroups(databaseParamSchema), [databaseParamSchema]);

  const [activeTab, setActiveTab] = useState('General');
  const [activeSidebar, setActiveSidebar] = useState('Server Parameter');
  const [fetching, setFetching] = useState(false);
  // Read-only display state — loaded once per (host, database) and never
  // mutated by the user; actual edits happen only in the raw text editor
  // (see the "Edit in Text Editor" banner below).
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [params, setParams] = useState({});
  const [bufferMode, setBufferMode] = useState(DEFAULT_BUFFER_MODE);
  const [brokers, setBrokers] = useState([]);
  const [connectionInfo, setConnectionInfo] = useState({ brokerIp: 'localhost', brokerPort: '', charset: 'UTF-8' });
  // Connection Information is the only editable part of this modal, so it is
  // also the only thing the "discard changes?" confirmation guards. The
  // Server Parameter tables are read-only and have nothing to discard.
  const [connectionDirty, setConnectionDirty] = useState(false);
  const updateConnectionInfo = patch => {
    setConnectionInfo(prev => ({ ...prev, ...patch }));
    setConnectionDirty(true);
  };
  // Tracks which (host, database) the Server Parameter config has already
  // been fetched for, so switching tabs and back doesn't needlessly re-fetch.
  const fetchedConfigKeyRef = useRef(null);

  useEffect(() => {
    if (isDatabasePropertyModalOpen) {
      setShowDiscardConfirm(false);
      setConnectionDirty(false);
      setParams({});
      setBufferMode(DEFAULT_BUFFER_MODE);
      setActiveSidebar('Server Parameter');
      fetchedConfigKeyRef.current = null;
    }
  }, [isDatabasePropertyModalOpen, selectedDatabase]);

  useEffect(() => {
    if (isDatabasePropertyModalOpen && selectedHostUid && isAuthorized && !hostEnv) {
      dispatch(fetchHostEnv(selectedHostUid));
    }
  }, [isDatabasePropertyModalOpen, selectedHostUid, isAuthorized, hostEnv, dispatch]);

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
    const configKey = `${selectedHostUid}:${selectedDatabase || ''}`;
    if (
      isDatabasePropertyModalOpen && selectedHostUid && isAuthorized &&
      activeSidebar !== 'Connection Information' &&
      databaseParamSchema.length > 0 &&
      fetchedConfigKeyRef.current !== configKey
    ) {
      fetchedConfigKeyRef.current = configKey;
      const fetchParams = async () => {
        setFetching(true);
        try {
          const response = await hostApi.getHostConfig(selectedHostUid, 'cubridconf');
          const lines = response?.conflist?.[0]?.confdata || [];
          const newParams = {};
          // Deliberately NOT merged: engine inheritance between [common]
          // and [@dbname] is real (unlike broker.conf's [broker]), but
          // showing a [common] value as if it were explicitly present in
          // this db's own section is still a UI fiction here - it made a
          // hidden commonOnly field (e.g. cubrid_port_id, filtered out of
          // the individual-properties view entirely) carry a non-blank
          // value anyway, which validateEffectiveParams then correctly
          // flagged as "set in the wrong section" even though nothing was
          // ever actually written there. [common] and [@dbname] are
          // edited as fully separate targets, same as
          // BrokerPropertyModal's identical [broker]/[%name] split.
          // The engine matches [@dbname] case-sensitively against the
          // database name (prm_section_cmp with ignore_case=false), so
          // [@DemoDB] and [@demodb] are different sections to it.
          const target = selectedDatabase ? `@${selectedDatabase}` : 'common';
          // Same engine-faithful parser the raw editor validates with, so
          // this view and the editor never disagree about what a line says.
          const section = parseConfText(lines).sections.find(s => s.name === target);
          for (const { key, value } of section?.entries ?? []) {
            newParams[key.toLowerCase()] = value;
          }

          // Mirrors CA's PageSizeChoiceComposite#initBtnState: prefer the
          // pages key if it has a value, else fall back to size.
          const nextMode = {};
          bufferGroups.forEach(({ type, pagesKey }) => {
            nextMode[type] = newParams[pagesKey]?.trim() ? 'pages' : 'size';
          });
          setBufferMode({ ...DEFAULT_BUFFER_MODE, ...nextMode });
          setParams({ ...newParams });
        } catch (err) {
          console.error('Failed to fetch config:', err);
          // Allow a retry on the next tab switch instead of permanently
          // marking this (host, database) as "fetched" — but only if this
          // request is still the current one. A stale request for an
          // earlier (host, database) can still be in flight and reject
          // after a newer request for a different target already
          // succeeded; clearing the ref unconditionally here would wipe
          // out that newer success and trigger a pointless re-fetch (and
          // possible edit-clobbering) on the next tab switch.
          if (fetchedConfigKeyRef.current === configKey) {
            fetchedConfigKeyRef.current = null;
          }
        }
        finally { setFetching(false); }
      };
      fetchParams();
    }
  }, [isDatabasePropertyModalOpen, selectedDatabase, selectedHostUid, activeSidebar, isAuthorized, databaseParamSchema, bufferGroups]);

  // Connection Information is the only thing this modal can still write —
  // it's local-only (how this web manager instance reaches the broker),
  // never a cubrid.conf value, so it was never part of the read-only pivot.
  // Server Parameter values are edited exclusively through the raw text
  // editor now (see handleOpenTextEditor below).
  const handleApply = () => {
    closeModal();
  };

  const handleOpenTextEditor = () => {
    dispatch(openTab(`edit_config:${selectedHostUid}:cubridconf`));
    dispatch(closeDatabasePropertyModal());
  };

  const closeModal = () => {
    setShowDiscardConfirm(false);
    setConnectionDirty(false);
    dispatch(closeDatabasePropertyModal());
    setParams({});
    setBufferMode(DEFAULT_BUFFER_MODE);
  };

  // Keyed lookup of each schema entry's own default — isImplicit/isDefaultValue
  // both need to compare the loaded value against it.
  const schemaDefaults = useMemo(
    () => Object.fromEntries(databaseParamSchema.map(e => [e.key, e.default])),
    [databaseParamSchema]
  );

  // One shared rule engine (required/guard/section-placement/cross-field) —
  // see validateEffectiveParams's own doc comment. Nothing here is editable
  // any more, so this only ever flags a value that's ALREADY stored in
  // cubrid.conf and fails its own guard — a passive diagnostic pointing at
  // the text editor, not something Apply can block.
  const reconciledParams = useMemo(
    () => getEffectiveParams(params, bufferMode, bufferGroups),
    [params, bufferMode, bufferGroups]
  );
  const guardErrors = useMemo(
    () => validateEffectiveParams(databaseParamSchema, reconciledParams, {
      isCommonSection: !selectedDatabase,
      commonSectionLabel: 'common',
      emptyValueIsError: true,
      sysprmKeywords: true,
    }),
    [databaseParamSchema, reconciledParams, selectedDatabase]
  );
  const guardErrorCount = Object.keys(guardErrors).length;

  const handleClose = () => {
    if (connectionDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    closeModal();
  };

  // CUBRID forces auto_restart_server off in-process whenever HA is enabled
  // (system_parameter.c's prm_tune_parameters — an abnormally-terminated
  // server should fail over via HA, not blindly self-restart in place).
  // Mirrors the off-keyword set system_parameter.c itself recognizes for
  // ha_mode (only "on" would previously have been detected).
  const HA_MODE_OFF_KEYWORDS = ['off', 'no', 'n', '0', 'false', 'default'];
  const isHaEnabled = params.ha_mode !== undefined
    && !HA_MODE_OFF_KEYWORDS.includes(String(params.ha_mode).trim().toLowerCase());

  const generalRows = useMemo(() => databaseParamSchema
    // commonOnly keys (cubrid_port_id, auto_restart_server on 11.4+) only
    // belong in [common] — hidden entirely while editing a specific
    // database, same as advancedRows below and BrokerPropertyModal's
    // identical commonOnly filter, so the entry point you opened (공통
    // 속성 편집 vs 개별 속성 편집) and the param set you actually see
    // always match instead of showing a field that was never actually
    // readable from here anyway.
    .filter(e => e.category === 'general' && !(e.commonOnly && selectedDatabase))
    .map(e => ({
      ...e,
      value: params[e.key],
      error: guardErrors[e.key],
      isDefaultValue: isEffectivelyDefault(e.guard, params[e.key], e.default),
      // Never in the conf file — the value shown is purely e.default, not
      // anything anyone actually set.
      isImplicit: params[e.key] === undefined || params[e.key] === '',
    }))
  , [databaseParamSchema, params, guardErrors, selectedDatabase]);

  const advancedRows = useMemo(() => databaseParamSchema
    // See generalRows' comment — commonOnly keys (ha_mode/ha_node_list/
    // ha_port_id) are hidden entirely while a specific database is being
    // edited.
    .filter(e => e.category === 'advanced' && !(e.commonOnly && selectedDatabase))
    .map(e => {
      // Non-blocking hint only. Reads the OTHER param's effective value
      // (falling back to its own schema default the same way the field
      // itself does) to decide whether this one currently has no real
      // engine effect — see the entry's `advisory` field (ParamSchemaEntry's
      // own doc comment for why).
      const dep = e.advisory;
      const isInactive = dep
        ? dep.inactiveWhen.includes(
            String(params[dep.dependsOnKey] !== undefined ? params[dep.dependsOnKey] : schemaDefaults[dep.dependsOnKey])
              .trim().toLowerCase()
          )
        : false;
      return {
        ...e,
        value: params[e.key] !== undefined ? params[e.key] : e.default,
        error: guardErrors[e.key],
        inactiveHint: isInactive ? CM.paramInactiveWhileHint(dep.dependsOnKey) : null,
        isDefaultValue: isEffectivelyDefault(e.guard, params[e.key], e.default),
        isImplicit: params[e.key] === undefined || params[e.key] === '',
      };
    })
  , [databaseParamSchema, params, guardErrors, schemaDefaults, CM, selectedDatabase]);

  // Connection Information configures how this web manager instance itself
  // reaches the broker for a specific database — meaningless while editing
  // [common], so only offered once a specific database is selected.
  const navItems = selectedDatabase
    ? [{ id: 'Server Parameter', icon: 'tune', label: CM.serverNavLabel }, { id: 'Connection Information', icon: 'cable', label: CM.connectionNavLabel }]
    : [{ id: 'Server Parameter', icon: 'tune', label: CM.serverNavLabel }];

  const SERVER_TABS = [
    { id: 'General', label: CM.generalParamsTab, icon: 'tune' },
    { id: 'Advanced', label: CM.advancedParamsTab, icon: 'settings_applications' },
  ];

  if (!isDatabasePropertyModalOpen) return null;

  // No separate Default column here either — same convention as the
  // Advanced table (and CA itself): the value cell shows the current value,
  // falling back to the default as a placeholder.
  const generalColumns = [
    { header: CM.parameter, accessor: 'key', width: '45%', render: (_, row) => <ParamNameCell label={row.key} isModified={row.isModified} isDefaultValue={row.isDefaultValue} defaultValueBadge={CM.usingDefaultBadge} defaultValueHint={CM.usingDefaultHint(row.default)} isImplicit={row.isImplicit} implicitBadge={CM.implicitValueBadge} implicitHint={CM.implicitValueHint(row.default)} /> },
    {
      header: CM.value, accessor: 'value', width: '55%', cellClassName: 'w-[55%]', sortable: false,
      render: (_, row) => {
        const isHaForcedOff = row.key === 'auto_restart_server' && isHaEnabled;
        return (
          <ParamValueCell
            value={isHaForcedOff ? 'no' : row.value}
            defaultValue={row.default}
            error={row.error}
            hint={isHaForcedOff ? CM.autoRestartHaDisabledHint : null}
          />
        );
      },
    },
  ];

  // Column set/order mirrors CUBRID Admin's own advanced-parameter table
  // (DatabaseConfigPropertyPage.java): Parameter Name, Parameter Type (the
  // SERVER/CLIENT/BOTH scope), Value Type (the bool/int/string descriptor),
  // Parameter Value. CA has no separate "Default" column — the value cell
  // itself shows the current value, falling back to the default.
  const advancedColumns = [
    {
      header: CM.parameter, accessor: 'key', width: '30%',
      className: '!sticky left-0 z-20 bg-slate-100 dark:bg-slate-900',
      cellClassName: 'sticky left-0 z-[1] bg-white dark:bg-slate-900',
      render: (_, row) => <ParamNameCell label={row.key} isModified={row.isModified} isDefaultValue={row.isDefaultValue} defaultValueBadge={CM.usingDefaultBadge} defaultValueHint={CM.usingDefaultHint(row.default)} isImplicit={row.isImplicit} implicitBadge={CM.implicitValueBadge} implicitHint={CM.implicitValueHint(row.default)} />,
    },
    {
      header: CM.parameterTypeLabel, accessor: 'scope', width: '16%',
      render: (val) => {
        const scopeColors = {
          SERVER: 'text-sky-500 bg-sky-500/8 border-sky-500/20',
          CLIENT: 'text-violet-500 bg-violet-500/8 border-violet-500/20',
          BOTH: 'text-emerald-500 bg-emerald-500/8 border-emerald-500/20',
        };
        return <span className={`text-11 font-medium uppercase tracking-widest px-1.5 py-0.5 rounded border ${scopeColors[val]}`}>{val}</span>;
      },
    },
    { header: CM.valueTypeLabel, accessor: 'guard', width: '18%', render: (guard) => <span className="text-12 font-mono text-slate-400 dark:text-slate-500">{guard.kind}</span> },
    {
      header: CM.parameterValueLabel, accessor: 'value', width: '36%', cellClassName: 'w-[36%]', sortable: false,
      render: (_, row) => (
        <ParamValueCell value={row.value} defaultValue={row.default} error={row.error} hint={row.inactiveHint} />
      ),
    },
  ];

  /* ─── FORM VIEW ─── */
  return (
    <>
    <Modal
      isOpen={isDatabasePropertyModalOpen}
      onClose={handleClose}
      title={activeSidebar === 'Connection Information'
        ? `${selectedDatabase} · Connection`
        : (selectedDatabase ? CM.registrySubtitle(selectedDatabase) : CM.kernelParamsTitle)}
      subtitle={activeSidebar === 'Connection Information'
        ? CM.brokerCharsetConfigDesc
        : (selectedDatabase ? CM.instancePropertiesScopeDescDb(selectedDatabase) : CM.commonPropertiesScopeDescDb)}
      icon={activeSidebar === 'Connection Information' ? 'cable' : 'tune'}
      maxWidth="1200px"
      testId="database-property"
      footer={
        <div className="flex justify-end items-center w-full gap-2.5">
          <Button data-testid="database-property-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          {activeSidebar === 'Server Parameter' ? (
            <Button
              data-testid="database-property-open-editor-btn"
              variant="primary"
              onClick={handleOpenTextEditor}
              icon="edit"
              className="min-w-[140px]"
            >
              {CM.openInTextEditorBtn}
            </Button>
          ) : (
            <Button
              data-testid="database-property-apply-btn"
              variant="primary"
              onClick={handleApply}
              icon="save"
              className="min-w-[140px]"
            >
              {CM.applyChanges}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex h-[min(720px,calc(90vh-146px))] min-h-[360px] -m-5 overflow-hidden">

        {/* ─── Sidebar ─── */}
        {/* Deliberately dark in both themes (nav items below use light-on-dark
            text/hover colors with no `dark:` variants of their own). Must be
            opaque in light mode — a translucent bg-slate-900/60 blends toward
            a medium gray against this panel's white background, landing
            close enough to the inactive label's text-slate-500 to be
            unreadable until hover. dark:bg-black/40 stays translucent since
            it only ever blends with the panel's own dark background. */}
        <div className="w-[180px] bg-slate-900 dark:bg-black/40 border-r border-white/6 flex flex-col shrink-0">
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
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-transparent overflow-hidden">

          {/* Tab bar — only for Server Parameter */}
          {activeSidebar === 'Server Parameter' && (
            <div className="shrink-0 p-4 border-b border-slate-100 dark:border-white/6 flex items-center justify-between">
              <TabGroup
                tabs={SERVER_TABS}
                active={activeTab}
                onChange={setActiveTab}
                fullWidth={false}
              />
              {/* Passive diagnostic only — nothing here is editable, so this
                  flags a value already stored in cubrid.conf that fails its
                  own guard, not something blocking an Apply. */}
              {guardErrorCount > 0 && (
                <div data-testid="database-property-guard-error-count">
                  <StatusBadge label={`${guardErrorCount} invalid`} variant="rose" className="rounded-full" />
                </div>
              )}
            </div>
          )}

          {/* Content area */}
          <div className={`flex-1 min-h-0 custom-scrollbar ${activeSidebar === 'Server Parameter' && activeTab === 'Advanced' ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}>
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
                        onChange={e => updateConnectionInfo({ brokerIp: e.target.value })}
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
                        onChange={e => updateConnectionInfo({ brokerPort: e.target.value })}
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
                        onChange={e => updateConnectionInfo({ charset: e.target.value })}
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
                <ReadOnlyTableNotice onOpenEditor={handleOpenTextEditor} CM={CM} />

                <div className="flex flex-col gap-3">
                  {bufferGroups.map(group => (
                    <BufferChoiceGroup
                      key={group.type}
                      group={group}
                      mode={bufferMode[group.type]}
                      pagesValue={params[group.pagesKey]}
                      sizeValue={params[group.sizeKey]}
                      pagesError={guardErrors[group.pagesKey]}
                      sizeError={guardErrors[group.sizeKey]}
                    />
                  ))}
                </div>

                <div className="space-y-3">
                  <SectionHeader title={CM.standardParameters} icon="settings" />
                  <InfoBanner variant="info">
                    {CM.usingDefaultExplainerBanner}
                  </InfoBanner>
                  <Table columns={generalColumns} data={generalRows} bordered showEmptyStateAsRow className="[&_th]:font-medium" />
                </div>
              </div>

            ) : (
              /* ─── ADVANCED PARAMETERS TABLE ─── */
              <div className="h-full min-h-0 flex flex-col">
                <div className="shrink-0 px-6 py-6 space-y-3">
                  <ReadOnlyTableNotice onOpenEditor={handleOpenTextEditor} CM={CM} />
                  <InfoBanner variant="info">
                    {CM.usingDefaultExplainerBanner}
                  </InfoBanner>
                  <InfoBanner>
                    {CM.advancedParamsWarning}
                  </InfoBanner>
                </div>
                <div className="flex-1 min-h-0 px-6 pb-6">
                  {/* One bounded scroll container keeps both scrollbars in view. */}
                  <Table
                    columns={advancedColumns}
                    data={advancedRows}
                    bordered
                    showEmptyStateAsRow
                    stickyHeader
                    className="h-full overflow-y-auto custom-scrollbar [&_table]:border-separate [&_table]:border-spacing-0 [&_td]:border-b [&_td]:border-b-slate-100 dark:[&_td]:border-b-white/[0.04] [&_th]:font-medium [&_thead]:bg-slate-100 dark:[&_thead]:bg-bk-side"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
    <ConfirmDialog
      isOpen={isDatabasePropertyModalOpen && showDiscardConfirm}
      title={CM.discardChangesTitle}
      description={CM.discardChangesDesc}
      confirmLabel={CM.discardChangesBtn}
      cancelLabel={CM.keepEditingBtn}
      variant="warning"
      onConfirm={closeModal}
      onCancel={() => setShowDiscardConfirm(false)}
      testId="database-property-discard"
    />
    </>
  );
}
