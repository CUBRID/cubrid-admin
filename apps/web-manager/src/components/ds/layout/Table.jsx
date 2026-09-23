import React, { useState } from 'react';
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
  sortable = true,
  loading = false,
  zebra = false,
  bordered = false,
  className = '',
  showEmptyStateAsRow = false,
  selectable = false,
}) => {
  const CM = useCM();
  const resolvedEmptyMessage = emptyMessage ?? CM.noDataAvailableMsg;
  const [sortConfig, setSortConfig] = useState(null);

  const handleSort = (accessor) => {
    if (!sortable) return;
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
    return <EmptyState title={resolvedEmptyMessage} icon="table_chart" />;
  }

  return (
    <div className={`w-full overflow-x-auto ${selectable ? 'select-text' : 'select-none'} ${className} ${bordered ? 'border-b border-slate-200 dark:border-white/[0.08]' : ''}`}>
      <table className="w-full text-left border-collapse">

        {/* ── Header ── */}
        {headersVisible && (
          <thead>
            <tr className="bg-slate-100 dark:bg-white/3 border-b border-slate-200 dark:border-white/[0.07]">
            {columns.map((col, idx) => {
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
                      ${col.className || ''} ${(sortable || col.sortable || col.onHeaderClick) ? 'cursor-pointer select-none' : ''}`}
                    style={{ width: col.width }}
                    onClick={() => col.onHeaderClick ? col.onHeaderClick() : handleSort(col.accessor)}
                  >
                    {/* Left accent bar for active sort column */}
                    {isSorted && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full bg-amber-500" />
                    )}

                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>
                      <span className="truncate">{col.header}</span>
                      {(sortable || col.sortable || col.onHeaderClick) && (
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
                    hover:bg-amber-500/4 dark:hover:bg-amber-500/5
                    ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onRowClick && onRowClick(row)}
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
};
