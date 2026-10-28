import { useEffect } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { getStoredLocale } from '../../../constants/useCM';

/**
 * Keeps the desktop app's native menu in the active UI language. Keyed on the
 * locale itself, so it covers startup, LanguageToggle, and the server
 * preference load after login. No-op outside the desktop app.
 */
export function useDesktopMenuLanguage() {
  const locale = useSelector(
    (state) => state.user?.preferences?.uiLocale ?? getStoredLocale(),
    shallowEqual
  );

  useEffect(() => {
    const setMenuLanguage = window.desktopBridge?.setMenuLanguage;
    if (!setMenuLanguage) return;
    Promise.resolve(setMenuLanguage(locale)).catch(() => {
      // The menu is cosmetic; a failed update must not surface in the UI.
    });
  }, [locale]);
}
