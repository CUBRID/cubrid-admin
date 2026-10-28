import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../foundation/Icon';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';
import { useCM } from '../../../constants/useCM';

export const Table = ({
  columns = [],
  data = [],
  onRowClick,
  onRowContextMenu,
  emptyMessage = null,
  headersVisible = true,
  sortable = false,
  loading = false,
  zebra = false,
  bordered = false,
  className = '',
  showEmptyStateAsRow = false,
  selectable = false,
  isRowSelected,
  getRowAriaLabel,
  stickyHeader = false,
  emptyState = null,
  // With more rows than this, the table keeps the height of this many rows and
  // scrolls inside; a grip below it drags the height (double-click resets).
  maxRows,
}) => {
  const CM = useCM();
  const resolvedEmptyMessage = emptyMessage ?? CM.noDataAvailableMsg;
  const [sortConfig, setSortConfig] = useState(null);
  const scrollRef = useRef(null);
  const [capHeight, setCapHeight] = useState(null);
  const [userHeight, setUserHeight] = useState(null);
  const dragRef = useRef(null);

  const handleSort = (accessor) => {
    if (!accessor) return;
    let direction = 'asc';
    if (sortConfig && sortConfig.key === accessor && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: accessor, direction });
  };

  const sortedData = React.useMemo(() => {
    if (!sortConfig) return data;
    // Find the column to check for sortAccessor (raw sort key override)
    const col = columns.find((c) => c.accessor === sortConfig.key);
    const sortKey = col?.sortAccessor ?? sortConfig.key;
    return [...data].sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      // Use Number() (strict) not parseFloat (prefix-only) so that fully
      // numeric strings like "10" and "2" compare as numbers, while dates
      // ("2026-06-08"), IP addresses ("192.168.0.10"), and mixed strings
      // fall through to lexicographic comparison.
      if (typeof valA === 'string' && typeof valB === 'string') {
        const nA = Number(valA);
        const nB = Number(valB);
        if (!isNaN(nA) && !isNaN(nB) && valA.trim() !== '' && valB.trim() !== '') {
          valA = nA;
          valB = nB;
        }
      }
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortConfig, columns]);

  const overLimit = Boolean(maxRows) && sortedData.length > maxRows;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!overLimit || !el) {
      // At or under the limit the table renders as before, even after a resize.
      setCapHeight(null);
      setUserHeight(null);
      return undefined;
    }
    // Measured, not assumed: rows can be taller than one line (badges, wrapping).
    const measure = () => {
      const head = el.querySelector('thead');
      const rows = el.querySelectorAll('tbody > tr');
      let height = head ? head.offsetHeight : 0;
      for (let i = 0; i < maxRows && i < rows.length; i++) height += rows[i].offsetHeight;
      setCapHeight(height || null);
    };
    measure();
    // Re-measure when cells rewrap (window or column width) or rows change size.
    const table = el.querySelector('table');
    if (typeof ResizeObserver === 'undefined' || !table) return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  }, [overLimit, maxRows, sortedData, columns]);

  // The page scrolls too. When the top of the table goes under the top edge of
  // the page's scroll area, push the sticky header down by that much so it stays
  // over the visible rows, but never past the bottom of the table box.
  const followPage = Boolean(maxRows);
  useEffect(() => {
    const el = scrollRef.current;
    if (!followPage || !el) return undefined;
    let page = el.parentElement;
    while (page && !/auto|scroll/.test(getComputedStyle(page).overflowY)) page = page.parentElement;
    const update = () => {
      const head = el.querySelector('thead');
      if (!head) return;
      const edge = page ? page.getBoundingClientRect().top + page.clientTop : 0;
      const hidden = Math.max(edge - el.getBoundingClientRect().top, 0);
      const offset = Math.min(hidden, Math.max(el.clientHeight - head.offsetHeight, 0));
      head.style.top = offset ? `${offset}px` : '';
    };
    update();
    const target = page ?? window;
    target.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      target.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [followPage, sortedData, capHeight, userHeight]);

  const scrolling = capHeight != null || userHeight != null;
  const minHeight = capHeight != null ? Math.min(capHeight, 120) : 120;
  const resizeBy = (delta) => {
    const current = scrollRef.current?.getBoundingClientRect().height ?? capHeight ?? 0;
    setUserHeight(Math.max(minHeight, current + delta));
  };
  const onGripPointerDown = (event) => {
    if (event.button !== 0 || !scrollRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { y: event.clientY, height: scrollRef.current.getBoundingClientRect().height };
  };
  const onGripPointerMove = (event) => {
    if (!dragRef.current) return;
    setUserHeight(Math.max(minHeight, dragRef.current.height + event.clientY - dragRef.current.y));
  };
  const onGripPointerUp = (event) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const onGripKeyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); resizeBy(40); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); resizeBy(-40); }
    else if (event.key === 'Home') { event.preventDefault(); setUserHeight(null); }
  };

  if (loading && data.length === 0) {
    return (
      <div className="w-full space-y-2 p-2">
        <Skeleton variant="rect" height="32px" />
        <Skeleton variant="rect" height="32px" />
        <Skeleton variant="rect" height="32px" />
      </div>
    );
  }

  if (!loading && data.length === 0 && !showEmptyStateAsRow) {
    return emptyState ?? <EmptyState title={resolvedEmptyMessage} icon="table_chart" />;
  }

  const scrollStyle = userHeight != null
    ? { height: userHeight }
    : capHeight != null ? { maxHeight: capHeight } : undefined;

  // The caller's className stays on the element that scrolls, so a caller that
  // caps the height there (max-h-… overflow-auto) keeps a working stickyHeader.
  const tableBox = (
    <div
      ref={scrollRef}
      data-testid={scrolling ? 'table-scroll-area' : undefined}
      className={`w-full ${scrolling ? 'overflow-auto custom-scrollbar' : 'overflow-x-auto'} ${selectable ? 'select-text' : 'select-none'} ${className} ${bordered ? 'border-b border-slate-200 dark:border-white/[0.08]' : ''}`}
      style={scrollStyle}
    >
      <table className="w-full text-left border-collapse">

        {/* ── Header ── */}
        {headersVisible && (
          <thead className={stickyHeader || scrolling || followPage ? 'sticky top-0 z-10 bg-white dark:bg-background-dark' : undefined}>
            <tr className="bg-slate-100 dark:bg-white/3 border-b border-slate-200 dark:border-white/[0.07]">
            {columns.map((col, idx) => {
                const canSort = col.sortable ?? sortable;
                const isInteractive = canSort || Boolean(col.onHeaderClick);
                const isSorted = (col.sortDirection != null) || (sortConfig && col.accessor && sortConfig.key === col.accessor);
                const activeSortDir = col.sortDirection ?? (isSorted ? sortConfig?.direction : null);
                const alignCls = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '';
                return (
                  <th
                    key={col.accessor || idx}
                    className={`group relative px-3 py-2 text-13 font-bold uppercase tracking-widest
                      ${isSorted ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}
                      ${bordered ? 'border-r border-slate-200 dark:border-white/[0.08]' : ''}
                      transition-colors whitespace-nowrap ${alignCls}
                      ${col.className || ''} ${isInteractive ? 'cursor-pointer select-none' : ''}`}
                    style={{ width: col.width }}
                    aria-sort={isSorted ? (activeSortDir === 'asc' ? 'ascending' : 'descending') : (canSort ? 'none' : undefined)}
                    tabIndex={isInteractive ? 0 : undefined}
                    onClick={isInteractive ? () => col.onHeaderClick ? col.onHeaderClick() : handleSort(col.accessor) : undefined}
                    onKeyDown={isInteractive ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (col.onHeaderClick) col.onHeaderClick();
                        else handleSort(col.accessor);
                      }
                    } : undefined}
                  >
                    {/* Left accent bar for active sort column */}
                    {isSorted && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full bg-amber-500" />
                    )}

                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>
                      <span className="truncate">{col.header}</span>
                      {isInteractive && (
                        <span className={`ml-0.5 transition-all duration-150 ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                          <Icon
                            name={isSorted ? (activeSortDir === 'asc' ? 'north' : 'south') : 'unfold_more'}
                            size="12px"
                            weight={isSorted ? 700 : 300}
                            className={isSorted ? 'text-amber-500' : 'text-slate-400'}
                          />
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
        )}

        {/* ── Body ── */}
        <tbody className="divide-y divide-slate-100 dark:divide-white/4">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-14 text-slate-400 dark:text-slate-500 font-medium"
              >
                {resolvedEmptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row, rowIdx) => {
              const isEven = rowIdx % 2 === 0;
              const rowSelected = isRowSelected ? Boolean(isRowSelected(row)) : false;
              const rowKey =
                row.rowKey ??
                (row._type === 'host' ? row.uid : null) ??
                row.uid ??
                row.id ??
                rowIdx;
              return (
                <tr
                  key={rowKey}
                  className={`group transition-colors duration-100
                    ${zebra && isEven ? 'bg-slate-50/60 dark:bg-white/[0.012]' : ''}
                    ${rowSelected ? 'bg-amber-500/10 dark:bg-amber-500/10' : ''}
                    hover:bg-amber-500/4 dark:hover:bg-amber-500/5
                    ${onRowClick ? 'cursor-pointer' : ''}`}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={getRowAriaLabel?.(row)}
                  aria-selected={isRowSelected ? rowSelected : undefined}
                  onClick={() => onRowClick && onRowClick(row)}
                  onKeyDown={(event) => {
                    if (onRowClick && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  }}
                  onContextMenu={(e) => {
                    if (!onRowContextMenu) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onRowContextMenu(e, row);
                  }}
                >
                  {columns.map((col, colIdx) => {
                    const isFirst = colIdx === 0;
                    const alignCls = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '';
                    return (
                      <td
                        key={col.accessor || colIdx}
                        className={`px-3 py-2 text-14 transition-colors leading-snug
                          ${isFirst
                            ? 'font-semibold text-slate-800 dark:text-slate-200 border-l-2 border-l-transparent group-hover:border-l-amber-500/60'
                            : 'font-medium text-slate-600 dark:text-slate-400'}
                          ${bordered ? 'border-r border-slate-100 dark:border-white/[0.04]' : ''}
                          ${alignCls}
                          ${col.cellClassName || ''}`}
                      >
                        {col.render ? col.render(row[col.accessor], row) : row[col.accessor]}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  if (!maxRows) return tableBox;

  return (
    <div className="w-full">
      {tableBox}
      {scrolling && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={CM.tableResizeHint}
          title={CM.tableResizeHint}
          tabIndex={0}
          data-testid="table-resize-grip"
          className="group/grip flex h-3 w-full cursor-row-resize touch-none items-center justify-center border-t border-slate-100 dark:border-white/[0.06] focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
          onPointerDown={onGripPointerDown}
          onPointerMove={onGripPointerMove}
          onPointerUp={onGripPointerUp}
          onPointerCancel={onGripPointerUp}
          onDoubleClick={() => setUserHeight(null)}
          onKeyDown={onGripKeyDown}
        >
          <span className="h-1 w-10 rounded-full bg-slate-300 dark:bg-white/20 group-hover/grip:bg-amber-500" />
        </div>
      )}
    </div>
  );
};
