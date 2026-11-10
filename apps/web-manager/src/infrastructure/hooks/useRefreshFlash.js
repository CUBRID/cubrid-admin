import { useEffect, useState } from 'react';

const FLASH_MS = 400;

// A refresh the user asks for in any screen: a button or menu item that shows
// the refresh icon. Background polling never clicks one.
const isRefreshControl = (target) => {
  const control = target instanceof Element ? target.closest('button, [role="menuitem"]') : null;
  if (!control) return false;
  return [...control.querySelectorAll('.material-symbols-outlined')]
    .some((icon) => icon.textContent.trim() === 'refresh');
};

/**
 * Whether the white refresh flash is showing: after every refresh of the
 * active tab (refreshCounter: F5, Ctrl/Cmd+R, the tab's reload, and the
 * refresh after an action) and every refresh button or menu item the user
 * presses.
 */
export function useRefreshFlash(refreshCounter) {
  const [pressed, setPressed] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    const onClick = (e) => {
      if (isRefreshControl(e.target)) setPressed((n) => n + 1);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (refreshCounter + pressed === 0) return undefined;
    setIsFlashing(true);
    const timer = setTimeout(() => setIsFlashing(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, [refreshCounter, pressed]);

  return isFlashing;
}
