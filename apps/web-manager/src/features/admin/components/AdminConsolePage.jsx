import { useState } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';
import LanguageToggle from '../../layout/components/LanguageToggle';
import { toggleTheme } from '../../layout/layoutSlice';
import AccountsSection from './AccountsSection';
import ActivityLogSection from './ActivityLogSection';
import ApiLogSection from './ApiLogSection';
import AdminSettingsSection from './AdminSettingsSection';
import { usePendingApprovals } from '../usePendingApprovals';
import StatusModal from '../../../components/common/StatusModal';

const SECTIONS = [
  { path: 'accounts', icon: 'group', label: (CM) => CM.adminSectionAccounts },
  { path: 'api-log', icon: 'query_stats', label: (CM) => CM.adminSectionApiLog },
  { path: 'activity', icon: 'history', label: (CM) => CM.adminSectionActivity },
  { path: 'settings', icon: 'tune', label: (CM) => CM.adminSectionSettings },
];

const ICON_BTN =
  'h-8 w-8 flex items-center justify-center rounded-sm border bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/6 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all active:scale-[0.98]';

/**
 * User Administration as its own full page (/admin/accounts, /api-log,
 * /activity, /settings): administrators manage Web Manager accounts here, away from
 * the host dashboard. Refresh reads the open section again.
 */
export default function AdminConsolePage() {
  const CM = useCM();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user, shallowEqual);
  const theme = useSelector((state) => state.layout?.theme, shallowEqual);
  const [reloadKey, setReloadKey] = useState(0);
  const pendingApprovals = usePendingApprovals(user?.isAdmin === true);

  const topBar = (
    <header className="h-14 shrink-0 flex items-center gap-4 px-6 bg-white dark:bg-background-dark border-b border-slate-100 dark:border-white/6">
      <Link
        to="/home"
        data-testid="admin-back-to-dashboard"
        className="inline-flex items-center gap-1.5 text-13 font-bold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
      >
        <Icon name="arrow_back" size="17px" weight={300} />
        {CM.backToDashboard}
      </Link>
      <div className="w-px h-5 bg-slate-200 dark:bg-white/8" />
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 bg-slate-900 dark:bg-white rounded-lg flex items-center justify-center shrink-0">
          <img src="/cubrid-logo.png" alt="" className="w-5 h-5 object-contain" />
        </div>
        <span className="text-15 font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
          CUBRID <span className="text-amber-500 font-light">Admin</span>
        </span>
        <span className="text-14 text-slate-400 whitespace-nowrap hidden sm:inline">/ {CM.userAdministration}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          data-testid="admin-refresh"
          className={ICON_BTN}
          onClick={() => setReloadKey((k) => k + 1)}
          title={CM.refresh}
          aria-label={CM.refresh}
        >
          <Icon name="refresh" size="18px" weight={300} />
        </button>
        <LanguageToggle />
        <button
          type="button"
          className={ICON_BTN}
          onClick={() => dispatch(toggleTheme())}
          title={theme === 'light' ? CM.switchToDarkMode : CM.switchToLightMode}
          aria-label={theme === 'light' ? CM.switchToDarkMode : CM.switchToLightMode}
        >
          <Icon name={theme === 'light' ? 'dark_mode' : 'light_mode'} size="18px" weight={300} />
        </button>
        <div className="flex items-center gap-2 pl-2 ml-1 border-l border-slate-200 dark:border-white/8">
          <div className="w-7 h-7 rounded-sm bg-amber-500 flex items-center justify-center">
            <Icon name="person" size="17px" weight={400} className="text-bk-side" />
          </div>
          <div className="leading-tight">
            <p className="text-13 font-bold text-slate-700 dark:text-slate-200">{user?.id}</p>
            <p className="text-11 text-amber-600 dark:text-amber-400 font-semibold">{CM.administratorLabel}</p>
          </div>
        </div>
      </div>
    </header>
  );

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0b0b0d]">
        {topBar}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400" data-testid="admin-no-access">
          <Icon name="lock" size="36px" weight={200} />
          <p className="text-15">{CM.adminNoAccessMsg}</p>
          <Link to="/home" className="text-14 font-bold text-amber-500 hover:underline">{CM.backToDashboard}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-[#0b0b0d]" data-testid="user-administration">
      {topBar}
      <div className="flex-1 flex min-h-0">
        <nav
          className="w-64 shrink-0 bg-white dark:bg-background-dark border-r border-slate-100 dark:border-white/6 p-4 space-y-1 overflow-y-auto"
          aria-label={CM.userAdministration}
        >
          {SECTIONS.map((s) => (
            <NavLink
              key={s.path}
              to={`/admin/${s.path}`}
              data-testid={`admin-section-${s.path}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/3'
                }`
              }
            >
              <Icon name={s.icon} size="19px" weight={300} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-14 font-bold">
                  {s.label(CM)}
                  {s.path === 'accounts' && pendingApprovals > 0 && (
                    <span
                      data-testid="admin-nav-pending-approvals"
                      title={CM.pendingApprovalsBadge(pendingApprovals)}
                      className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-11 font-bold leading-5 text-center tabular-nums"
                    >
                      {pendingApprovals > 99 ? '99+' : pendingApprovals}
                    </span>
                  )}
                </span>
              </span>
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="max-w-[1400px] mx-auto px-8 py-7">
            <Routes>
              <Route index element={<Navigate to="accounts" replace />} />
              <Route path="accounts" element={<AccountsSection reloadKey={reloadKey} />} />
              <Route path="api-log" element={<ApiLogSection reloadKey={reloadKey} />} />
              <Route path="activity" element={<ActivityLogSection reloadKey={reloadKey} />} />
              <Route path="settings" element={<AdminSettingsSection reloadKey={reloadKey} />} />
              <Route path="*" element={<Navigate to="accounts" replace />} />
            </Routes>
          </div>
        </main>
      </div>
      {/* This page is outside the dashboard layout, which shows these elsewhere. */}
      <StatusModal />
    </div>
  );
}
