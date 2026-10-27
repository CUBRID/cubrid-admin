import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const TOOLTIP_DELAY_MS = 300;
// Moving straight from one titled element to the next shows the next tooltip at once.
const WARM_MS = 300;
const GAP_PX = 6;
const EDGE_PX = 8;
const STASH_ATTR = 'data-nca-title';

/**
 * Replaces the browser's native `title` tooltip app-wide, without touching
 * the elements that set it. The native one appears only after a delay the
 * browser picks (seconds in Chromium/Electron) in a small system font, and
 * cannot be styled.
 *
 * While the pointer is over an element with a `title`, the title is moved to
 * a data attribute so the native tooltip never shows, and is put back when
 * the pointer leaves. The tooltip is rendered in a portal with fixed
 * positioning, so containers with overflow: hidden (sidebar, tables) do not
 * clip it.
 */
export default function GlobalTooltip() {
  const [tip, setTip] = useState(null); // { text, rect }
  const [pos, setPos] = useState(null);
  const tipRef = useRef(null);

  useEffect(() => {
    let target = null;
    let timer = null;
    let lastHiddenAt = 0;

    const restore = (el) => {
      if (!el) return;
      const stashed = el.getAttribute(STASH_ATTR);
      if (stashed != null) {
        // React may have set a new title while it was stashed; keep that one.
        if (!el.hasAttribute('title')) el.setAttribute('title', stashed);
        el.removeAttribute(STASH_ATTR);
      }
    };

    const hide = () => {
      clearTimeout(timer);
      timer = null;
      if (target) {
        restore(target);
        target = null;
        lastHiddenAt = Date.now();
      }
      setTip(null);
    };

    const show = (el) => {
      const text = el.getAttribute(STASH_ATTR);
      if (!text || !el.isConnected) return;
      setTip({ text, rect: el.getBoundingClientRect() });
    };

    const onOver = (event) => {
      const el = event.target instanceof Element ? event.target.closest('[title]') : null;
      if (!el || el === target) return;
      const text = el.getAttribute('title');
      hide();
      if (!text || !text.trim()) return;
      target = el;
      el.setAttribute(STASH_ATTR, text);
      el.removeAttribute('title');
      const warm = Date.now() - lastHiddenAt < WARM_MS;
      timer = setTimeout(() => show(el), warm ? 0 : TOOLTIP_DELAY_MS);
    };

    const onOut = (event) => {
      if (!target) return;
      const next = event.relatedTarget;
      if (next instanceof Node && target.contains(next)) return;
      hide();
    };

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    // Anything that moves content under the pointer or changes focus ends the tooltip.
    window.addEventListener('scroll', hide, true);
    window.addEventListener('mousedown', hide, true);
    window.addEventListener('keydown', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mouseout', onOut, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('mousedown', hide, true);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('blur', hide);
      hide();
    };
  }, []);

  // Place below the element, above it if there is no room, clamped to the viewport.
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) {
      setPos(null);
      return;
    }
    const { width, height } = tipRef.current.getBoundingClientRect();
    const { rect } = tip;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = rect.bottom + GAP_PX;
    if (top + height > vh - EDGE_PX && rect.top - GAP_PX - height >= EDGE_PX) {
      top = rect.top - GAP_PX - height;
    }
    const centered = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(Math.max(EDGE_PX, centered), Math.max(EDGE_PX, vw - EDGE_PX - width));
    setPos({ top, left });
  }, [tip]);

  if (!tip) return null;

  return createPortal(
    <div
      ref={tipRef}
      role="tooltip"
      data-testid="global-tooltip"
      className="fixed z-[10000] pointer-events-none max-w-[480px] px-2.5 py-1.5 rounded-sm shadow-lg bg-slate-800 dark:bg-slate-700 text-white text-13 leading-snug whitespace-pre-wrap break-words"
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
    >
      {tip.text}
    </div>,
    document.body
  );
}
