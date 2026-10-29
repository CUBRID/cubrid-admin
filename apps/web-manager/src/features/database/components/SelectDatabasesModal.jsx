import { useEffect, useMemo, useState } from 'react';
import { shallowEqual, useSelector } from 'react-redux';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Checkbox } from '../../../components/ds/forms/Checkbox';
import { Table } from '../../../components/ds/layout/Table';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Icon } from '../../../components/ds/foundation/Icon';
import { useCM } from '../../../constants/useCM';
import { MULTI_DB_ACTIONS, MULTI_DB_ACTION_ICONS, databaseSelectionRows, splitByAction } from '../databaseMultiActions';


const yesNo = (value) => (
  <Icon name={value ? 'check' : 'remove'} size="xs" className={value ? 'text-emerald-500' : 'text-slate-300'} />
);

/**
 * Pick several databases of one host and run one action on them. Each
 * action button shows how many of the selected databases it applies to;
 * onAction gets the selected rows and runs the action (confirm, progress
 * and result are the caller's).
 */
export default function SelectDatabasesModal({ isOpen, hostUid, initialSelected, onClose, onAction }) {
  const CM = useCM();
  const database = useSelector((state) => ({
    databasesByHost: state.database.databasesByHost,
    activeDatabasesByHost: state.database.activeDatabasesByHost,
    haDbNamesByHost: state.database.haDbNamesByHost,
    loggedInDatabases: state.database.loggedInDatabases,
  }), shallowEqual);
  const rows = useMemo(() => databaseSelectionRows({ database }, hostUid), [database, hostUid]);
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  const [loginPending, setLoginPending] = useState(false);
  const [credentials, setCredentials] = useState({ id: '', password: '' });

  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set(initialSelected || []));
    setFilter('');
    setLoginPending(false);
    setCredentials({ id: '', password: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, hostUid]);

  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.dbname)), [rows, selected]);
  if (!isOpen) return null;

  const visibleRows = rows.filter((row) => {
    const q = filter.trim().toLowerCase();
    return !q || row.dbname.toLowerCase().includes(q);
  });
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.dbname));

  const toggle = (dbname) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(dbname)) next.delete(dbname);
    else next.add(dbname);
    return next;
  });
  const toggleAllVisible = () => setSelected((prev) => {
    const next = new Set(prev);
    visibleRows.forEach((row) => (allVisibleSelected ? next.delete(row.dbname) : next.add(row.dbname)));
    return next;
  });

  const loginTargets = splitByAction('login', selectedRows).targets;
  const needsCredentials = loginTargets.some((row) => !row.hasProfile);

  const runAction = (action) => {
    if (action === 'login' && needsCredentials && !loginPending) {
      setLoginPending(true);
      return;
    }
    onAction(action, selectedRows, action === 'login' ? credentials : undefined);
  };

  const columns = [
    {
      header: (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={allVisibleSelected} onChange={toggleAllVisible} aria-label={CM.selectAll} />
        </div>
      ),
      accessor: 'selected',
      width: '36px',
      render: (_, row) => (
        <div onClick={(e) => e.stopPropagation()} data-testid={`select-databases-checkbox-${row.dbname}`}>
          <Checkbox checked={selected.has(row.dbname)} onChange={() => toggle(row.dbname)} />
        </div>
      ),
    },
    { header: CM.database, accessor: 'dbname' },
    { header: CM.multiDbColumnRunning, accessor: 'running', render: yesNo },
    { header: CM.multiDbColumnLoggedIn, accessor: 'loggedIn', render: yesNo },
    { header: CM.multiDbColumnSavedCredentials, accessor: 'hasProfile', render: yesNo },
    { header: CM.multiDbColumnHa, accessor: 'isHa', render: yesNo },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={CM.selectDatabasesTitle}
      icon="checklist"
      maxWidth="max-w-[720px]"
      testId="select-databases"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <Typography variant="caption" className="text-slate-500">
            {CM.multiDbSelectedCount(selectedRows.length)}
          </Typography>
          <div className="flex flex-wrap justify-end gap-2">
            {MULTI_DB_ACTIONS.map((action) => {
              const count = splitByAction(action, selectedRows).targets.length;
              return (
                <Button
                  key={action}
                  data-testid={`select-databases-action-${action}`}
                  variant={action === 'login' && loginPending ? 'primary' : 'secondary'}
                  size="sm"
                  icon={MULTI_DB_ACTION_ICONS[action]}
                  disabled={count === 0}
                  onClick={() => runAction(action)}
                >
                  {`${CM.multiDbActions[action]} (${count})`}
                </Button>
              );
            })}
          </div>
        </div>
      }
    >
      <div className="space-y-4 p-1">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={CM.searchPlaceholder}
          icon="search"
        />
        <div className="max-h-[360px] overflow-y-auto border border-slate-200 dark:border-white/10 rounded-lg">
          <Table
            columns={columns}
            data={visibleRows}
            onRowClick={(row) => toggle(row.dbname)}
            bordered
            showEmptyStateAsRow
          />
        </div>
        {loginPending && (
          <div className="grid grid-cols-2 gap-3" data-testid="select-databases-credentials">
            <Input
              label={CM.username}
              value={credentials.id}
              onChange={(e) => setCredentials((prev) => ({ ...prev, id: e.target.value }))}
              autoComplete="off"
            />
            <Input
              label={CM.password}
              type="password"
              value={credentials.password}
              onChange={(e) => setCredentials((prev) => ({ ...prev, password: e.target.value }))}
              autoComplete="new-password"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
