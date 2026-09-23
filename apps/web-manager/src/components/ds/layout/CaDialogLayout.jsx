import React from 'react';
import { Typography } from '../foundation/Typography';
import { Tabs } from './Tabs';
import { Table } from './Table';

export const CaDialogTabs = ({ tabs, activeTab, onChange }) => (
  <Tabs
    tabs={tabs}
    activeTab={activeTab}
    onChange={onChange}
    variant="line"
  />
);

export const CaDialogGroup = ({ title, children, className = '' }) => (
  <fieldset className={`border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 ${className}`}>
    <legend className="px-1 text-14 font-semibold text-slate-700 dark:text-slate-300">
      {title}
    </legend>
    {children}
  </fieldset>
);

export const CaDialogFieldGrid = ({ children, labelWidth = '150px', className = '' }) => (
  <div
    className={`grid gap-x-4 gap-y-3 items-center ${className}`}
    style={{ gridTemplateColumns: `${labelWidth} minmax(0, 1fr)` }}
  >
    {children}
  </div>
);

export const CaDialogField = ({ label, children, fullWidth = false }) => {
  if (fullWidth) {
    return <div className="col-span-2">{children}</div>;
  }

  return (
    <>
      <Typography variant="label" className="text-14 text-slate-700 dark:text-slate-300">
        {label}
      </Typography>
      {children}
    </>
  );
};

export const CaDialogTable = ({ columns, data, emptyMessage }) => (
  <div className="overflow-hidden border border-slate-200 dark:border-white/10 rounded-xl">
    <Table
      columns={columns}
      data={data}
      emptyMessage={emptyMessage}
      sortable={false}
      bordered
      showEmptyStateAsRow
    />
  </div>
);
