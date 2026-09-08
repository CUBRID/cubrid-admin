import React, { useEffect, useRef } from 'react';
import { Icon } from '../foundation/Icon';
import { Typography } from '../foundation/Typography';
import { useCM } from '../../../constants/useCM';

export const Modal = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  iconVariant = 'primary',
  footer,
  maxWidth = 'max-w-md',
  children,
  /** When false, hides the header X and ignores Escape (e.g. synchronous in-flight requests). */
  showCloseButton = true,
  /** Tailwind z-index class for overlay (StatusModal uses z-[2100]). */
  zIndexClass = 'z-2000',
  /** Stable e2e hook — renders data-testid="{testId}-modal" on the panel and "{testId}-modal-close" on the X button. */
  testId,
  /** Optional: pressing Enter in a text input inside the modal calls this
      (mirrors clicking the form's primary button). Skipped for textareas
      (Enter should insert a newline there) and non-text form controls. */
  onSubmit,
}) => {
  const CM = useCM();
  const modalRef = useRef(null);
  // Element focused before the modal opened — restored on close so keyboard
  // users land back where they were instead of on <body>.
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!showCloseButton) return undefined;
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, showCloseButton]);

  useEffect(() => {
    if (!onSubmit || !isOpen) return undefined;
    const handleEnter = (e) => {
      if (e.key !== 'Enter') return;
      const tag = e.target?.tagName;
      if (tag !== 'INPUT') return;
      const type = (e.target.type || 'text').toLowerCase();
      if (['button', 'submit', 'checkbox', 'radio', 'file'].includes(type)) return;
      e.preventDefault();
      onSubmit();
    };
    document.addEventListener('keydown', handleEnter);
    return () => document.removeEventListener('keydown', handleEnter);
  }, [isOpen, onSubmit]);

  // Focus trap: Tab/Shift+Tab cycle only through the modal's own focusable
  // elements instead of escaping to whatever's behind it. Also moves initial
  // focus into the modal on open and restores it to the trigger on close.
  useEffect(() => {
    if (!isOpen) return undefined;

    const FOCUSABLE_SELECTOR =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusable = () => {
      if (!modalRef.current) return [];
      return Array.from(modalRef.current.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter((el) => el.offsetParent !== null); // skip hidden elements
    };

    previouslyFocusedRef.current = document.activeElement;

    // Defer to the next frame so the modal's children (often conditionally
    // rendered) have mounted before we look for something to focus.
    const focusFrame = requestAnimationFrame(() => {
      const focusable = getFocusable();
      const autoFocusEl = modalRef.current?.querySelector('[autofocus]');
      (autoFocusEl || focusable[0] || modalRef.current)?.focus();
    });

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !modalRef.current?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !modalRef.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleTab);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleTab);
      // Only restore if focus is still inside this modal (or gone entirely)
      // — avoids yanking focus away if another modal already took over.
      const active = document.activeElement;
      if (!active || active === document.body || modalRef.current?.contains(active)) {
        previouslyFocusedRef.current?.focus?.();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const iconStyles = {
    primary: 'bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20',
    danger: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    success: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  };

  return (
    <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4`}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-bk-main/40 backdrop-blur-xs transition-opacity"
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div
        ref={modalRef}
        tabIndex={-1}
        data-testid={testId ? `${testId}-modal` : undefined}
        className={`relative w-full ${maxWidth.startsWith('max-w-') ? maxWidth : ''} bg-white dark:bg-bk-side rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.2)] border border-slate-200 dark:border-slate-800 transform transition-all flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden text-left outline-hidden`}
        style={!maxWidth.startsWith('max-w-') ? { maxWidth } : {}}
        role="dialog"
        aria-modal="true"
      >
        {/* Subtle Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-amber-500"></div>

        {showCloseButton && (
          <button
            type="button"
            data-testid={testId ? `${testId}-modal-close` : undefined}
            className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 w-7 h-7 rounded-md transition-all flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5 z-10"
            onClick={onClose}
          >
            <span className="sr-only">{CM.close}</span>
            <Icon name="close" size="md"  weight={300} />
          </button>
        )}

        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-bk-main/50 flex gap-3 items-center">
          {icon && (
            <div className={`shrink-0 flex items-center justify-center h-8 w-8 rounded-lg border ${iconStyles[iconVariant] || iconStyles.primary}`}>
              <Icon name={icon} size="md"  weight={300} />
            </div>
          )}
          <div className="flex-1">
            <Typography variant="h4" className="text-14 font-medium text-slate-900 dark:text-white leading-none tracking-wide">
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="p" className="text-12 mt-1 text-slate-500 font-medium">
                {subtitle}
              </Typography>
            )}
          </div>
        </div>

        <div className="px-5 py-5 overflow-y-auto overflow-x-auto custom-scrollbar flex-1">
          {children}
        </div>

        {footer && (
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-bk-main/80 backdrop-blur-xs rounded-b-xl border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
