import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { checkSession, fetchUser } from '../authSlice';
import { fetchPreferences } from '../../user/userSlice';
import { isDesktopApp } from '../../desktop/isDesktopApp';
import LoadingOverlay from '../../../components/common/LoadingOverlay';
import ForcedPasswordChangePage from './ForcedPasswordChangePage';
import { useCM } from '../../../constants/useCM';
import { Spinner } from '../../../components/ds/foundation/Spinner';

/**
 * Renders the routes once the server has said whether the cookies sign this
 * browser in (checkSession, at most SESSION_CHECK_TIMEOUT_MS); until then a
 * spinner, so neither the login page nor the dashboard flashes first. The
 * desktop app is checked from the start.
 */
export function SessionGate({ children }) {
  const dispatch = useDispatch();
  const CM = useCM();
  const sessionChecked = useSelector((state) => state.auth.sessionChecked);
  useEffect(() => {
    if (!sessionChecked) dispatch(checkSession());
    // Once, when the app opens: later changes come from login, logout and the other tabs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (sessionChecked) return children;
  return (
    <div role="status" aria-label={CM.loadingLabel} className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-[#070709] text-amber-500">
      <Spinner size="lg" />
    </div>
  );
}

/**
 * The dashboard, for a signed-in session only. In a browser the account is
 * read once per session before the dashboard mounts — also right after login,
 * when only the id typed there is known — because whether it is an admin and
 * whether an admin-set password must be changed first come from it; the
 * server refuses the dashboard's requests until such a password is changed.
 * A failed read doesn't hold the dashboard back. The desktop app has no app
 * account.
 */
export function ProtectedRoute({ children }) {
  const dispatch = useDispatch();
  const { isAuthenticated, user, userFetchSettled } = useSelector((state) => state.auth, shallowEqual);
  const desktop = isDesktopApp();
  const waitForUser = isAuthenticated && !desktop && !userFetchSettled;
  const requested = useRef(false);

  useEffect(() => {
    if (waitForUser && !requested.current) {
      requested.current = true;
      dispatch(fetchUser());
      dispatch(fetchPreferences());
    }
  }, [waitForUser, dispatch]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (waitForUser) return <LoadingOverlay isVisible />;
  if (!desktop && user?.mustChangePassword) return <ForcedPasswordChangePage />;
  return children;
}

export function RootRedirect() {
  const { isAuthenticated } = useSelector((state) => state.auth, shallowEqual);
  return <Navigate to={isAuthenticated ? '/home' : '/login'} replace />;
}

/** The login page, or the dashboard for a browser that is already signed in (another tab, another address). */
export function LoginRoute({ children }) {
  const { isAuthenticated } = useSelector((state) => state.auth, shallowEqual);
  return isAuthenticated ? <Navigate to="/home" replace /> : children;
}
