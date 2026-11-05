import { useCallback, useEffect, useRef, useState, useLayoutEffect } from 'react';

const PADDING = 18;

/**
 * A reusable context menu wrapper that positions itself within the viewport.
 */
export default function ContextMenuWrapper({ x, y, children, onClose, width = "w-60" }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: y, left: x });
  const [isPositioned, setIsPositioned] = useState(false);

  const place = useCallback(() => {
    const menu = menuRef.current;
    if (!menu) return;
    // Layout size, not getBoundingClientRect: the menu opens at scale(0.95),
    // and the transformed rect is short enough to leave the last items off-screen.
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newLeft = x;
    let newTop = y;

    // Flip to the other side of the pointer when there is no room.
    if (x + menuWidth + PADDING > viewportWidth) newLeft = x - menuWidth;
    if (y + menuHeight + PADDING > viewportHeight) newTop = y - menuHeight;

    // Then clamp; max-h keeps height within the viewport, and the rest scrolls.
    newLeft = Math.max(PADDING, Math.min(newLeft, viewportWidth - menuWidth - PADDING));
    newTop = Math.max(PADDING, Math.min(newTop, viewportHeight - menuHeight - PADDING));

    setPosition({ top: newTop, left: newLeft });
    setIsPositioned(true);
  }, [x, y]);

  // Re-runs for new coordinates too: a menu reopened by another right-click
  // while still open (e.g. on a different tab) is not remounted.
  useLayoutEffect(() => {
    place();
  }, [place]);

  useEffect(() => {
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [place]);

  useEffect(() => {
    if (!isPositioned) return undefined;
    menuRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPositioned, onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      aria-label="Context menu"
      className={`fixed z-1000 ${width} bg-white dark:bg-bk-side border border-slate-200 dark:border-slate-800 rounded-xl shadow-[0_4px_25px_rgba(0,0,0,0.2)] p-1.5 max-h-[calc(100vh-36px)] overflow-y-auto overflow-x-hidden custom-scrollbar animate-in fade-in zoom-in-95 duration-200 context-menu-container ${isPositioned ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="absolute top-0 left-4 right-4 h-px bg-linear-to-r from-transparent via-bk-yellow/20 to-transparent"></div>
      {children}
    </div>
  );
}
