import React, { useEffect, useId, useRef } from 'react';
import { Icon } from '../foundation/Icon';
import { Typography } from '../foundation/Typography';
import { useCM } from '../../../constants/useCM';

export const Drawer = ({
  isOpen,
  onClose,
  title,
  position = 'right',
  width = 'w-96',
  children,
  footer,
}) => {
  const CM = useCM();
  const drawerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const generatedId = useId();
  const titleId = `${generatedId}-title`;

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    previousFocusRef.current = document.activeElement;
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFrame = requestAnimationFrame(() => {
      drawerRef.current?.querySelector(selector)?.focus();
    });
    const trapFocus = (event) => {
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll(selector)).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', trapFocus);
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  const positioningClasses = {
    right: `right-0 h-full ${isOpen ? 'translate-x-0' : 'translate-x-full'}`,
    left: `left-0 h-full ${isOpen ? 'translate-x-0' : '-translate-x-full'}`,
    bottom: `bottom-0 w-full ${isOpen ? 'translate-y-0' : 'translate-y-full'}`,
    top: `top-0 w-full ${isOpen ? 'translate-y-0' : '-translate-y-full'}`,
  };

  const structuralClasses = position === 'right' || position === 'left' ? width : 'h-96';

  return (
    <div className={`fixed inset-0 z-40 transition-opacity flex ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
      <div 
        className={`fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      
      <div
        ref={drawerRef}
        className={`fixed bg-white dark:bg-slate-900 shadow-2xl transition-transform duration-300 ease-in-out flex flex-col border-slate-200 dark:border-slate-800 ${positioningClasses[position]} ${structuralClasses} ${position === 'right' ? 'border-l' : position === 'left' ? 'border-r' : position === 'top' ? 'border-b' : 'border-t'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <Typography id={titleId} variant="h4">{title}</Typography>
          <button
            type="button"
            onClick={onClose}
            aria-label={CM.close}
            className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Icon name="close" size="md"  weight={300} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
        
        {footer && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
