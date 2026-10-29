import React from 'react';
import { List } from 'react-window';

const ROW_PX = 34;

const gridTemplate = (columns) => columns.map((col) => col.width ?? 'minmax(0, 1fr)').join(' ');

const alignClass = (col) => (col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '');

const cellText = (col, row) => (col.render ? col.render(row[col.accessor], row) : row[col.accessor]);

function Row({ index, style, ariaAttributes, rows, columns, template }) {
  const row = rows[index];
  return (
    <div
      {...ariaAttributes}
      style={{ ...style, display: 'grid', gridTemplateColumns: template }}
      className="items-center border-b border-slate-100 dark:border-white/4 hover:bg-amber-500/4 dark:hover:bg-amber-500/5"
    >
      {columns.map((col) => {
        const value = cellText(col, row);
        return (
          <div
            key={col.accessor}
            className={`px-3 truncate text-14 font-medium text-slate-600 dark:text-slate-400 ${alignClass(col)} ${col.cellClassName || ''}`}
            title={typeof value === 'string' ? value : undefined}
          >
            {value}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A table for thousands of rows: only the rows in view are in the DOM.
 * Rows have one fixed height, so cells do not wrap; long text is cut with an
 * ellipsis and shown in full in its tooltip. Columns take `width` as a CSS
 * grid track (default: an equal share of the rest).
 */
export const VirtualTable = ({ columns, data, height = 420, emptyMessage, testId }) => {
  const template = gridTemplate(columns);
  return (
    <div className="w-full select-text" data-testid={testId}>
      <div
        role="row"
        style={{ display: 'grid', gridTemplateColumns: template }}
        className="bg-slate-100 dark:bg-white/3 border-b border-slate-200 dark:border-white/[0.07]"
      >
        {columns.map((col) => (
          <div
            key={col.accessor}
            role="columnheader"
            className={`px-3 py-2 text-13 font-bold uppercase tracking-widest text-slate-500 truncate ${alignClass(col)}`}
          >
            {col.header}
          </div>
        ))}
      </div>
      {data.length === 0 ? (
        <div className="px-4 py-8 text-center text-14 text-slate-400 dark:text-slate-500 font-medium">{emptyMessage}</div>
      ) : (
        <List
          className="custom-scrollbar"
          style={{ height: Math.min(height, data.length * ROW_PX) }}
          defaultHeight={Math.min(height, data.length * ROW_PX)}
          rowComponent={Row}
          rowCount={data.length}
          rowHeight={ROW_PX}
          rowProps={{ rows: data, columns, template }}
          overscanCount={10}
        />
      )}
    </div>
  );
};
