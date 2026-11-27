import { useEffect, useState } from 'react';
import { authApi } from './authApi';

/**
 * Whether the server takes sign-ups: true, false, or null while unknown.
 * A failed check counts as open, since the server refuses a closed sign-up
 * anyway and a hidden link would then hide nothing worth hiding.
 */
export function useRegistrationOpen() {
  const [open, setOpen] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => authApi.getRegistration())
      .then((res) => live && setOpen(res?.enabled !== false))
      .catch(() => live && setOpen(true));
    return () => {
      live = false;
    };
  }, []);
  return open;
}
