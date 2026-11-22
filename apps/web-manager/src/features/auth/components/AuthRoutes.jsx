import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { checkSession } from '../authSlice';
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

export function ProtectedRoute({ children }) {
  const { isAuthenticated } = useSelector((state) => state.auth, shallowEqual);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
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
