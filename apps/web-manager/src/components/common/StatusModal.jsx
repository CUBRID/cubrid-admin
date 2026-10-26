import { useEffect, useState } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeStatusModal } from '../../features/layout/layoutSlice';
import { Icon } from '../ds/foundation/Icon';
import { Button } from '../ds/foundation/Button';
import { Modal } from '../ds/layout/Modal';
import { useCM } from '../../constants/useCM';
import { FailureTable } from '../ds/feedback/FailureTable';
import { haFollowUpAction } from '../../features/host/hostSlice';

const THEME_STYLES = {
  success: {
    accent: 'bg-emerald-500',
    iconBg: 'bg-emerald-500/10 border-emerald-500/20',
    iconText: 'text-emerald-500',
    glow: 'rgba(16,185,129,0.12)',
    badgeBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500',
    icon: 'check_circle',
  },
  error: {
    accent: 'bg-rose-500',
    iconBg: 'bg-rose-500/10 border-rose-500/20',
    iconText: 'text-rose-500',
    glow: 'rgba(244,63,94,0.12)',
    badgeBg: 'bg-rose-500/10 border-rose-500/20 text-rose-500',
    icon: 'report',
  },
  info: {
    accent: 'bg-amber-500',
    iconBg: 'bg-amber-500/10 border-amber-500/20',
    iconText: 'text-amber-500',
    glow: 'rgba(255,193,7,0.12)',
    badgeBg: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
    icon: 'info',
  },
};

export default function StatusModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { statusModal } = useSelector((state) => state.layout, shallowEqual);
  // Follow-ups are re-based on the current host groups (see haFollowUpAction).
  const { hostGroups, haInfo } = useSelector((state) => state.host, shallowEqual);
  const { isOpen, type, title, message, guidance, detail, tables } = statusModal;
  const tableItems = Array.isArray(tables) ? tables.filter((tb) => tb?.rows?.length > 0) : [];
  const [showDetail, setShowDetail] = useState(false);
  // Follow-ups already opened from this dialog (row uid/name) — disabled after use.
  const [openedFollowUps, setOpenedFollowUps] = useState([]);
  const guidanceItems = Array.isArray(guidance) ? guidance : (guidance ? [guidance] : []);

  const t = THEME_STYLES[type] || THEME_STYLES.info;
  const tLabel = { success: CM.jobStatusSucceeded, error: CM.jobStatusFailed, info: CM.statusNotice }[type] ?? CM.statusNotice;

  useEffect(() => {
    if (isOpen) {
      setShowDetail(false);
      setOpenedFollowUps([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Opens the HA modal a bulk login deferred for this host. This dialog
  // stays open underneath: the HA modals render at z-[2200], above this
  // one (z-[2100]), and Modal's own top-most check keeps Escape/focus on
  // the HA modal — so the user returns here for the next host's follow-up.
  const followUpLabels = { discovery: CM.haPeersDiscovered, merge: CM.mergeHAPeers, clusterLink: CM.haClusterLinked };
  const renderHaFollowUp = (row) => {
    // null once nothing is left to do, e.g. a merge an earlier follow-up already did.
    const action = haFollowUpAction(row.followUp, { hostGroups, haInfo });
    if (!action) return <span className="text-slate-300 dark:text-slate-600">—</span>;
    return (
      <Button
        size="sm"
        variant="secondary"
        data-testid={`ha-follow-up-${row.name}`}
        disabled={openedFollowUps.includes(row.uid ?? row.name)}
        onClick={() => {
          setOpenedFollowUps((prev) => [...prev, row.uid ?? row.name]);
          dispatch(action);
        }}
      >
        {followUpLabels[row.followUp.type] || CM.failureTableHaFollowUp}
      </Button>
    );
  };

  return (
    <Modal
      isOpen
      onClose={() => dispatch(closeStatusModal())}
      title={title || (type === 'success' ? CM.statusSuccessTitle : type === 'error' ? CM.statusErrorTitle : CM.statusNotice)}
      icon={t.icon}
      iconVariant={type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary'}
      maxWidth={tableItems.length > 0 ? '520px' : '380px'}
      zIndexClass="z-[2100]"
      testId="status"
      footer={(
        <Button
          data-testid="status-modal-close-btn"
          variant={type === 'error' ? 'danger' : 'primary'}
          onClick={() => dispatch(closeStatusModal())}
        >
          {type === 'success' ? CM.gotIt : type === 'error' ? CM.dismiss : CM.ok}
        </Button>
      )}
    >
        <div className="flex flex-col items-center text-center">
          {/* Icon */}
          <div className="relative mb-5">
            {/* Outer ping ring */}
            <div className={`absolute inset-0 rounded-2xl border ${t.iconBg} animate-ping`} style={{ animationDuration: '2.5s' }} />
            <div className={`relative w-14 h-14 rounded-2xl border ${t.iconBg} flex items-center justify-center`}>
              <span className={`material-symbols-outlined text-2xl font-light ${t.iconText}`} style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>
                {t.icon}
              </span>
            </div>
          </div>

          {/* Status badge */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-11 font-bold uppercase tracking-widest mb-3 ${t.badgeBg}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${t.accent}`} />
            {tLabel}
          </div>

          {message && (
            <p className="text-13 text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-[280px]">
              {message}
            </p>
          )}

          {tableItems.length > 0 && (
            <div className="mt-4 w-full flex flex-col gap-3">
              {tableItems.map(({ haFollowUps, ...tb }, idx) => (
                <FailureTable
                  key={idx}
                  {...tb}
                  {...(haFollowUps ? { followUpLabel: CM.failureTableHaFollowUp, renderFollowUp: renderHaFollowUp } : {})}
                />
              ))}
            </div>
          )}

          {guidanceItems.length > 0 && (
            <div className="mt-4 w-full bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3 text-left">
              <p className="text-11 font-semibold uppercase tracking-wide text-amber-500 mb-1.5">{CM.thingsToCheck}</p>
              <ul className="space-y-1">
                {guidanceItems.map((item, idx) => (
                  <li key={idx} className="text-13 text-slate-600 dark:text-slate-300 leading-relaxed flex gap-1.5">
                    <span className="text-amber-500 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail && (
            <div className="mt-3 w-full text-left">
              <button
                type="button"
                onClick={() => setShowDetail((v) => !v)}
                className="flex items-center gap-1 text-11 font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <Icon name={showDetail ? 'expand_less' : 'expand_more'} size="13px" weight={300} />
                {showDetail ? CM.hideDetails : CM.showDetails}
              </button>
              {showDetail && (
                <div className="mt-2 bg-rose-500/5 border border-rose-500/15 rounded-xl px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  <p className="text-rose-600/90 dark:text-rose-400/90 font-mono text-12 leading-relaxed break-words">{detail}</p>
                </div>
              )}
            </div>
          )}

        </div>
    </Modal>
  );
}
