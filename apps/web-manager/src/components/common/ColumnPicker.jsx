import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../ds/foundation/Icon';
import { Checkbox } from '../ds/forms/Checkbox';

/**
 * A button that opens a list of a table's columns to show or hide.
 * `columns`: [{ key, label, locked }] in table order; a locked column is
 * always shown. `shown`: the keys shown now. `onToggle(key)` flips one.
 *
 * The list opens in a portal (a card's overflow would cut it off) at the
 * button's position, and closes on a click outside, Escape, scrolling or
 * resizing. Clicks inside do not reach the parents (a collapsible card
 * header would fold).
 */
export function ColumnPicker({ label, columns, shown, onToggle, testId = 'column-picker' }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPlace({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onMouseDown = (event) => {
      if (buttonRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      close();
    };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    const onScroll = (event) => { if (!panelRef.current?.contains(event.target)) close(); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <span className="inline-flex" onClick={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        data-testid={testId}
        aria-haspopup="true"
        aria-expanded={open}
        title={label}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${open ? 'bg-slate-200 dark:bg-white/10 text-amber-600 dark:text-amber-400' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-600 dark:hover:text-slate-200'}`}
      >
        <Icon name="view_column" size="sm" weight={300} />
      </button>
      {open && place && createPortal(
        <div
          ref={panelRef}
          role="group"
          aria-label={label}
          data-testid={`${testId}-panel`}
          onClick={(event) => event.stopPropagation()}
          style={{ top: place.top, right: place.right }}
          className="fixed z-110 min-w-44 max-h-[70vh] overflow-y-auto p-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-bk-card shadow-xl"
        >
          <div className="px-1.5 pb-1.5 text-11 font-bold text-slate-400 dark:text-slate-500">{label}</div>
          {columns.map((col) => (
            <Checkbox
              key={col.key}
              className="w-full px-1.5 py-1 rounded-md hover:bg-slate-50 dark:hover:bg-white/5"
              label={col.label}
              checked={col.locked || shown.includes(col.key)}
              disabled={col.locked}
              onChange={() => onToggle(col.key)}
              data-testid={`${testId}-${col.key}`}
            />
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
}
