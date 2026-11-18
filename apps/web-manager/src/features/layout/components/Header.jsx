import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { logoutUser, fetchUser } from '../../auth/authSlice';
import { fetchPreferences } from '../../user/userSlice';
import UserProfileModal from '../../user/components/UserProfileModal';
import { useNavigate } from 'react-router-dom';


import { Icon } from '../../../components/ds/foundation/Icon';
import HeaderMenu from './HeaderMenu';
import LanguageToggle from './LanguageToggle';
import { useCM } from '../../../constants/useCM';
import { isDesktopApp } from '../../desktop/isDesktopApp';
import { usePendingApprovals } from '../../admin/usePendingApprovals';
import { ToastContext } from '../../../infrastructure/context/toastContextValue';

export default function Header({ theme, toggleTheme }) {
  const CM = useCM();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const desktopApp = isDesktopApp();
  // How much the header is folded to fit its width: 0 everything, 1 the
  // logout button without its text, 2 also the user name hidden, 3 also the
  // three menus folded into one. The right-hand buttons always show.
  const [fold, setFold] = useState(0);
  // Bumped on every new width, so the row is measured again even when fold
  // is already 0 (setting the same fold would not render).
  const [measureTick, setMeasureTick] = useState(0);
  const headerRef = useRef(null);
  const rowRef = useRef(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading, error: authError } = useSelector((state) => state.auth, shallowEqual);
  const toast = useContext(ToastContext);
  // Every administrator hears of new sign-ups: a count on the button, and a
  // note when one arrives while they work.
  const pendingApprovals = usePendingApprovals(!desktopApp && user?.isAdmin === true, (added) =>
    toast?.info(CM.newPendingApprovalsToast(added), { duration: 8000 })
  );

  useEffect(() => {
    if (isAuthenticated && !user) {
      dispatch(fetchUser());
      dispatch(fetchPreferences());
    }
  }, [dispatch, isAuthenticated, user]);

  // Other words (language, user name), other widths: measure from the start.
  useLayoutEffect(() => { setFold(0); setMeasureTick((n) => n + 1); }, [CM, user]);

  // Before paint: one more step while the row is wider than the header.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (row && fold < 3 && row.scrollWidth > row.clientWidth + 1) setFold(fold + 1);
  }, [fold, measureTick]);

  // A new width (window, sidebar): start again from everything shown.
  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof ResizeObserver === 'undefined') return undefined;
    let lastWidth = header.clientWidth;
    const observer = new ResizeObserver(() => {
      if (header.clientWidth !== lastWidth) {
        lastWidth = header.clientWidth;
        setFold(0);
        setMeasureTick((n) => n + 1);
      }
    });
    observer.observe(header);
    // Text widths change once the web fonts arrive.
    let live = true;
    document.fonts?.ready?.then(() => {
      if (live) { setFold(0); setMeasureTick((n) => n + 1); }
    });
    return () => { live = false; observer.disconnect(); };
  }, []);

  const handleLogout = async () => {
    await dispatch(logoutUser());
    window.location.href = '/login';
  };

  /* ── icon button shared style ── */
  const btnBase = "h-8 flex items-center justify-center rounded-sm border transition-all active:scale-[0.98]";
  const iconBtn = `${btnBase} w-8 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/6 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200`;

  return (
    <>
      <header ref={headerRef} data-fold={fold} className="bg-white dark:bg-background-dark border-b border-slate-100 dark:border-white/6 h-14 flex items-center px-6 z-40 shrink-0 w-[100cqw] select-none sticky left-0">
        {/* The header is as wide as what <main> shows (100cqw), stays in
            view when the page scrolls sideways (sticky), and folds (see
            `fold`) instead of running past the window. */}
        <div ref={rowRef} className="w-full flex items-center">
          {/* ── Left: logo + menus ── */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Dropdown menus */}
            <HeaderMenu folded={fold >= 3} />
          </div>

          {/* ── Right: theme toggle + user + logout ── */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <LanguageToggle />

            <div className="w-px h-5 bg-slate-200 dark:bg-white/8 mx-1" />

            {/* Theme toggle */}
            <button
              className={iconBtn}
              onClick={toggleTheme}
              title={theme === 'light' ? CM.switchToDarkMode : CM.switchToLightMode}
            >
              <Icon name={theme === 'light' ? 'dark_mode' : 'light_mode'} size="19px" weight={300} />
            </button>

            {/* The desktop app has no app account to show or sign out of. */}
            {!desktopApp && (
              <>
                <div className="w-px h-5 bg-slate-200 dark:bg-white/8 mx-1" />

                {/* Web Manager account control, administrators only. */}
                {user?.isAdmin && (
                  <button
                    data-testid="header-user-accounts-btn"
                    className={`${iconBtn} relative`}
                    onClick={() => navigate('/admin/accounts')}
                    title={pendingApprovals ? `${CM.userAdministration} · ${CM.pendingApprovalsBadge(pendingApprovals)}` : CM.userAdministration}
                    aria-label={pendingApprovals ? `${CM.userAdministration}, ${CM.pendingApprovalsBadge(pendingApprovals)}` : CM.userAdministration}
                  >
                    <Icon name="manage_accounts" size="19px" weight={300} />
                    {pendingApprovals > 0 && (
                      <span
                        data-testid="header-pending-approvals"
                        aria-hidden="true"
                        className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-[18px] text-center tabular-nums"
                      >
                        {pendingApprovals > 99 ? '99+' : pendingApprovals}
                      </span>
                    )}
                  </button>
                )}

                {/* User profile pill */}
                <button
                  className={`${btnBase} px-2 gap-2 bg-slate-100 dark:bg-white/4 border-slate-200 dark:border-white/[0.07] hover:bg-slate-200 dark:hover:bg-white/8 group shrink-0 justify-between`}
                  onClick={() => setIsProfileOpen(true)}
                  title={fold >= 2 ? (user?.id || CM.admin) : undefined}
                >
                  {authLoading ? (
                    <div className="flex items-center gap-2 w-full justify-center">
                      <div className="h-3 w-16 bg-slate-200 dark:bg-white/10 rounded-sm animate-pulse" />
                      <div className="w-6 h-6 rounded-sm bg-slate-200 dark:bg-white/10 animate-pulse" />
                    </div>
                  ) : (
                    <>
                      <div className="w-6 h-6 rounded-sm bg-amber-500 shadow-xs shadow-amber-500/20 flex items-center justify-center shrink-0">
                        <Icon
                          name={authError ? 'error' : 'person'}
                          size="17px"
                          weight={400}
                          className={authError ? 'text-white' : 'text-bk-side'}
                        />
                      </div>
                      {fold < 2 && (
                        <span className="text-14 font-bold text-slate-700 dark:text-slate-200 tracking-tight text-left px-1 whitespace-nowrap">
                          {user?.id || CM.admin}
                        </span>
                      )}
                      <Icon name="expand_more" size="15px" className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200" />
                    </>
                  )}
                </button>

                {/* Logout */}
                <button
                  className="h-8 flex items-center justify-center rounded-sm border transition-all active:scale-[0.98] gap-2 px-4 shrink-0 bg-rose-500/5 border-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white hover:border-rose-500"
                  onClick={handleLogout}
                  title={CM.logout}
                  aria-label={CM.logout}
                >
                  <Icon name="logout" size="19px" weight={400} />
                  {fold < 1 && <span className="text-15 font-bold tracking-tight whitespace-nowrap">{CM.logout}</span>}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {!desktopApp && <UserProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />}
    </>
  );
}
