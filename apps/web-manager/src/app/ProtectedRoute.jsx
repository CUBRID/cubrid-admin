import { useEffect, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { Navigate } from 'react-router-dom';
import LoadingOverlay from '../components/common/LoadingOverlay';
import ForcedPasswordChangePage from '../features/auth/components/ForcedPasswordChangePage';
import { fetchUser } from '../features/auth/authSlice';
import { fetchPreferences } from '../features/user/userSlice';
import { isDesktopApp } from '../features/desktop/isDesktopApp';

/**
 * The dashboard, for a signed-in session only. In a browser the account is
 * read once per session before the dashboard mounts — also right after login,
 * when only the id typed there is known — because whether it is an admin and
 * whether an admin-set password must be changed first come from it; the
 * server refuses the dashboard's requests until such a password is changed.
 * A failed read doesn't hold the dashboard back. The desktop app has no app
 * account.
 */
export default function ProtectedRoute({ children }) {
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
