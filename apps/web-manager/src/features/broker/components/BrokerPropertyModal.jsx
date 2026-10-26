import { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { useCM } from '../../../constants/useCM';
import { closeBrokerPropertyModal,
  fetchBrokerConfig,
} from '../brokerSlice';
import { fetchHostEnv } from '../../host/hostSlice';
import { openTab } from '../../layout/layoutSlice';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { TabGroup } from '../../../components/ds/layout/TabGroup';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { parseConfText, validateEffectiveParams } from '@api-interfaces';

// The param list (which keys exist, their category/guard/default) no
// longer lives here — it comes from the connected host's `getEnv`
// response (`paramSchemas.broker`, cached in Redux's `hostEnvs`), already
// resolved for that host's actual engine version by the server. See
// libs/api-interfaces/src/param-schema/broker-param-schema.ts for the
// master, version-aware rule table and its source citations.
//
// Values here are read-only — editing happens exclusively in the raw
// text editor (BrokerConfigEditor), opened via the banner/footer button
// below. This modal is purely a reference view of what's currently in
// broker.conf plus a passive guard-error diagnostic.

function ParamRow({ param, value, error, isDefaultValue, isImplicit }) {
  const CM = useCM();
  const hasValue = value !== undefined && value !== '';
  return (
    <div className="flex items-center h-10 px-4 border-b border-slate-100 dark:border-white/4 last:border-0 hover:bg-slate-50 dark:hover:bg-white/2 transition-colors">
      <div className="w-[280px] shrink-0 flex items-center gap-2 min-w-0">
        <span className="text-12 font-mono truncate text-slate-500 dark:text-slate-400">
          {param.key}
        </span>
        {/* The effective value (explicit or not) matches the schema's own
            default — see DatabasePropertyModal's ParamNameCell comment for
            why this is a separate signal from isImplicit below. */}
        {isDefaultValue && (
          <span
            title={CM.usingDefaultHint(param.default)}
            className="shrink-0 text-10 font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500"
          >
            {CM.usingDefaultBadge}
          </span>
        )}
        {/* Not in [broker]/[%name] at all — the value shown is purely
            param.default, not anything anyone set. */}
        {isImplicit && (
          <span
            title={CM.implicitValueHint(param.default)}
            className="shrink-0 text-10 font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-dashed border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500"
          >
            {CM.implicitValueBadge}
          </span>
        )}
      </div>
      <span className="text-10 font-bold text-slate-400 dark:text-slate-600 font-mono opacity-60 w-[90px] shrink-0 truncate">
        {param.guard.kind}
      </span>
      <div className="flex-1 min-w-0" title={error}>
        <span className={`text-13 font-mono ${hasValue ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500 italic'}`}>
          {hasValue ? value : (param.default || '—')}
        </span>
        {error && <p className="text-11 text-rose-500 mt-0.5">{error}</p>}
      </div>
    </div>
  );
}

export default function BrokerPropertyModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { propertyModal, brokerConfig } = useSelector((state) => state.broker, shallowEqual);
  const { isOpen, brokerName, hostUid } = propertyModal;
  // No brokerName = viewing the shared [broker] section rather than one
  // broker's own [%name] section — these two targets can never overlap at
  // the engine level (broker.conf has no [broker]→[%name] inheritance at
  // all; see broker-param-schema.ts's commonOnly/instanceOnly entries).
  const isCommonMode = !brokerName;
  // Resolved per this host's actual engine version by the server (see
  // CmsConfigService.getEnv) — normally already cached by host
  // activation/login; the effect below covers the case where it isn't yet.
  const hostEnv = useSelector((state) => state.host.hostEnvs[hostUid]);
  const brokerParamSchema = useMemo(() => hostEnv?.paramSchemas?.broker ?? [], [hostEnv]);

  const [localParams, setLocalParams] = useState({});
  const [activeTab, setActiveTab] = useState('common');

  const config = useMemo(() => brokerConfig[hostUid] || { data: {}, loading: false }, [brokerConfig, hostUid]);

  useEffect(() => {
    if (isOpen && hostUid) {
      dispatch(fetchBrokerConfig({ hostUid }));
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
    for (const section of parseConfText(confLines).sections) {
      if (section.name === null) continue;
      const name = section.name.replace(/^%/, '');
      sections[name] ??= {};
      for (const { key, value } of section.entries) sections[name][key.toUpperCase()] = value;
    }

    // Deliberately NOT merged: broker.conf has no [broker]->[%name]
    // inheritance at the engine level (ini_parser.c does exact
    // "section:key" lookups only), so showing [broker]'s value as a
    // per-broker field's "inherited default" would be a UI fiction — the
    // real fallback when a per-broker key is absent is each schema
    // entry's own hardcoded `default`, not whatever's in [broker]. The two
    // sections are fully separate targets.
    const targetBroker = brokerName?.toLowerCase();
    const combined = isCommonMode ? { ...(sections['broker'] || {}) } : { ...(sections[targetBroker] || {}) };
    setLocalParams(combined);
  }, [config.data, brokerName, isOpen, isCommonMode]);

  const handleClose = () => dispatch(closeBrokerPropertyModal());
  const handleOpenTextEditor = () => {
    dispatch(openTab(`broker_config:${hostUid}`));
    dispatch(closeBrokerPropertyModal());
  };

  // One shared rule engine (required/guard/section-placement/cross-field) —
  // see validateEffectiveParams's own doc comment. Nothing here is editable
  // any more, so this only ever flags a value that's ALREADY stored in
  // broker.conf and fails its own guard — a passive diagnostic pointing at
  // the text editor.
  const guardErrors = useMemo(() => validateEffectiveParams(brokerParamSchema, localParams, {
    isCommonSection: isCommonMode,
    commonSectionLabel: 'broker',
    emptyValueIsError: true,
    emptyIntIsZero: true,
  }), [brokerParamSchema, localParams, isCommonMode]);
  const guardErrorCount = Object.keys(guardErrors).length;
  const tabs = [
    { id: 'common',   label: CM.common,   icon: 'settings' },
    { id: 'advance',  label: CM.advanced,  icon: 'tune' },
  ];
  // commonOnly keys (ACCESS_CONTROL*, MASTER_SHM_ID, ADMIN_LOG_FILE) only
  // ever make sense in [broker] — hide them in per-broker mode, and show
  // ONLY them (no tab split needed, there are just 5) in common mode.
  const visibleSchema = isCommonMode
    ? brokerParamSchema.filter(p => p.commonOnly)
    : brokerParamSchema.filter(p => !p.commonOnly && p.category === activeTab);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={brokerName ? `${brokerName} · ${CM.brokerProperties}` : CM.brokerCommonProperties}
      subtitle={brokerName ? CM.instancePropertiesScopeDescBroker(brokerName) : CM.commonPropertiesScopeDescBroker}
      icon="hub"
      maxWidth="max-w-[620px]"
      testId="broker-properties"
      footer={
        <>
          <Button data-testid="broker-property-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          <Button
            data-testid="broker-property-open-editor-btn"
            variant="primary"
            onClick={handleOpenTextEditor}
            icon="edit"
          >
            {CM.openInTextEditorBtn}
          </Button>
        </>
      }
    >
      <div className="flex flex-col h-[520px] -m-5">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-white/5 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-white/[0.01]">
          {isCommonMode ? (
            <SectionHeader title={CM.brokerCommonProperties} icon="hub" className="!m-0" />
          ) : (
            <TabGroup tabs={tabs} active={activeTab} onChange={setActiveTab} />
          )}
          {/* Passive diagnostic only — nothing here is editable, so this
              flags a value already stored in broker.conf that fails its
              own guard, not something an Apply could block. */}
          {guardErrorCount > 0 && (
            <div data-testid="broker-property-guard-error-count" className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-rose-500/10 border border-rose-500/20 shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span className="text-12 font-bold text-rose-600 dark:text-rose-400 uppercase">{guardErrorCount} invalid</span>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto bg-white dark:bg-bk-main">
          {config.loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="h-10 w-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
              <p className="text-14 text-slate-400 font-medium">{CM.synchronizing}</p>
            </div>
          ) : (
            <div>
              <div className="px-5 pt-4 space-y-3">
                <InfoBanner variant="info">
                  <div className="flex items-center justify-between gap-4">
                    <span>{CM.paramTableReadOnlyNotice}</span>
                  </div>
                </InfoBanner>
                <InfoBanner>
                  {CM.usingDefaultExplainerBanner}
                </InfoBanner>
              </div>
              <div className="flex items-center h-10 px-5 bg-slate-50 dark:bg-bk-main border-b border-slate-200 dark:border-white/8 sticky top-0 z-20">
                <SectionHeader title={CM.propertyName} icon="label" className="w-[280px] !m-0" />
                <SectionHeader title={CM.type} icon="code" className="w-[90px] !m-0" />
                <SectionHeader title={CM.value} icon="settings" className="flex-1 !m-0" />
              </div>
              <div className="divide-y divide-slate-100 dark:divide-white/4">
                {visibleSchema.map(p => (
                  <ParamRow
                    key={p.key}
                    param={p}
                    value={localParams[p.key]}
                    error={guardErrors[p.key]}
                    isDefaultValue={String((localParams[p.key] !== undefined && localParams[p.key] !== '') ? localParams[p.key] : p.default) === String(p.default ?? '')}
                    isImplicit={localParams[p.key] === undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
