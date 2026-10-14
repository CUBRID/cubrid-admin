import { useEffect, useState } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { logoutUser, fetchUser } from '../../auth/authSlice';
import { fetchPreferences } from '../../user/userSlice';
import UserProfileModal from '../../user/components/UserProfileModal';
import { showStatusModal } from '../layoutSlice';
import { setAboutCubrid } from '../appBarSlice';
import { Icon } from '../../../components/ds/foundation/Icon';
import AboutModal from './AboutModal';
import HeaderMenu from './HeaderMenu';
import LanguageToggle from './LanguageToggle';
import { useCM } from '../../../constants/useCM';

export default function Header({ theme, toggleTheme }) {
  const CM = useCM();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const dispatch = useDispatch();
  const { user, isAuthenticated, loading: authLoading, error: authError } = useSelector((state) => state.auth, shallowEqual);

  useEffect(() => {
    if (isAuthenticated && !user) {
      dispatch(fetchUser());
      dispatch(fetchPreferences());
    }
  }, [dispatch, isAuthenticated, user]);

  const handleLogout = async () => {
    await dispatch(logoutUser());
    window.location.href = '/login';
  };

  /* ── icon button shared style ── */
  const btnBase = "h-8 flex items-center justify-center rounded-sm border transition-all active:scale-[0.98]";
  const iconBtn = `${btnBase} w-8 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/6 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200`;

  return (
    <>
      <header className="bg-white dark:bg-background-dark border-b border-slate-100 dark:border-white/6 h-14 flex items-center justify-center px-6 z-40 shrink-0 select-none relative">
        <div className="w-full flex items-center justify-between">
          {/* ── Left: logo + menus ── */}
          <div className="flex items-center gap-1">
            {/* Dropdown menus */}
            <HeaderMenu />
          </div>

          {/* ── Right: theme toggle + user + logout ── */}
          <div className="flex items-center gap-2">
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

            <div className="w-px h-5 bg-slate-200 dark:bg-white/8 mx-1" />

            {/* User profile pill */}
            <button
              className={`${btnBase} px-2 gap-2 bg-slate-100 dark:bg-white/4 border-slate-200 dark:border-white/[0.07] hover:bg-slate-200 dark:hover:bg-white/8 group min-w-[120px] justify-between`}
              onClick={() => setIsProfileOpen(true)}
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
                  <span className="text-14 font-bold text-slate-700 dark:text-slate-200 tracking-tight flex-1 text-left px-1 truncate">
                    {user?.id || CM.admin}
                  </span>
                  <Icon name="expand_more" size="15px" className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200" />
                </>
              )}
            </button>

            {/* Logout */}
            <button
              className="h-8 flex items-center justify-center rounded-sm border transition-all active:scale-[0.98] gap-2 px-4 bg-rose-500/5 border-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white hover:border-rose-500"
              onClick={handleLogout}
              title={CM.logout}
            >
              <Icon name="logout" size="19px" weight={400} />
              <span className="text-15 font-bold tracking-tight">{CM.logout}</span>
            </button>
          </div>
        </div>
      </header>

      <UserProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <AboutModal />
    </>
  );
}
