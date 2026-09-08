import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeStatusModal } from '../../features/layout/layoutSlice';
import { Icon } from '../ds/foundation/Icon';
import { useCM } from '../../constants/useCM';

const THEME_STYLES = {
  success: {
    accent: 'bg-emerald-500',
    iconBg: 'bg-emerald-500/10 border-emerald-500/20',
    iconText: 'text-emerald-500',
    glow: 'rgba(16,185,129,0.12)',
    badgeBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500',
    btn: 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 text-white',
    icon: 'check_circle',
  },
  error: {
    accent: 'bg-rose-500',
    iconBg: 'bg-rose-500/10 border-rose-500/20',
    iconText: 'text-rose-500',
    glow: 'rgba(244,63,94,0.12)',
    badgeBg: 'bg-rose-500/10 border-rose-500/20 text-rose-500',
    btn: 'bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/20 text-white',
    icon: 'report',
  },
  info: {
    accent: 'bg-amber-500',
    iconBg: 'bg-amber-500/10 border-amber-500/20',
    iconText: 'text-amber-500',
    glow: 'rgba(255,193,7,0.12)',
    badgeBg: 'bg-amber-500/10 border-amber-500/20 text-amber-500',
    btn: 'bg-amber-500 hover:bg-amber-400 shadow-lg shadow-amber-500/20 text-bk-side',
    icon: 'info',
  },
};

export default function StatusModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { statusModal } = useSelector((state) => state.layout, shallowEqual);
  const { isOpen, type, title, message, guidance, detail } = statusModal;
  const btnRef = useRef(null);
  const [showDetail, setShowDetail] = useState(false);
  const guidanceItems = Array.isArray(guidance) ? guidance : (guidance ? [guidance] : []);

  const t = THEME_STYLES[type] || THEME_STYLES.info;
  const tLabel = { success: CM.jobStatusSucceeded, error: CM.jobStatusFailed, info: CM.statusNotice }[type] ?? CM.statusNotice;

  // Focus the button when opened for keyboard accessibility
  useEffect(() => {
    if (isOpen && btnRef.current) {
      setTimeout(() => btnRef.current?.focus(), 50);
    }
    if (isOpen) setShowDetail(false);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const fn = (e) => { if (e.key === 'Escape') dispatch(closeStatusModal()); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [isOpen, dispatch]);

  if (!isOpen) return null;

  return (
    <div data-testid="status-modal" className="fixed inset-0 z-[2100] flex items-center justify-center p-4 font-sans">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-bk-main/50 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => dispatch(closeStatusModal())}
      />

      {/* Card */}
      <div className="relative w-full max-w-[340px] bg-white dark:bg-bk-side border border-slate-200 dark:border-slate-800 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.35)] overflow-hidden z-10 animate-in zoom-in-95 duration-200">

        {/* Thin top accent */}
        <div className={`absolute top-0 left-0 right-0 h-[2px] ${t.accent}`} />

        {/* Ambient glow */}
        <div
          className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 50% -20%, ${t.glow} 0%, transparent 70%)` }}
        />

        {/* Close button */}
        <button
          onClick={() => dispatch(closeStatusModal())}
          className="absolute top-3.5 right-3.5 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8 transition-all z-10"
        >
          <Icon name="close" size="sm" weight={300} className="transition-transform hover:rotate-90" />
        </button>

        <div className="px-7 pt-8 pb-6 flex flex-col items-center text-center">
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

          {/* Title & message */}
          <h3 className="text-16 font-bold text-slate-900 dark:text-white tracking-tight leading-snug mb-2">
            {title || (type === 'success' ? CM.statusSuccessTitle : type === 'error' ? CM.statusErrorTitle : CM.statusNotice)}
          </h3>
          {message && (
            <p className="text-13 text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-[240px]">
              {message}
            </p>
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

          {/* CTA button */}
          <button
            ref={btnRef}
            data-testid="status-modal-close-btn"
            onClick={() => dispatch(closeStatusModal())}
            className={`mt-6 w-full py-2.5 rounded-xl text-14 font-semibold tracking-wide transition-all active:scale-[0.98] ${t.btn}`}
          >
            {type === 'success' ? CM.gotIt : type === 'error' ? CM.dismiss : CM.ok}
          </button>
        </div>
      </div>
    </div>
  );
}
