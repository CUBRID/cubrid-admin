import { useEffect, useMemo, useState } from 'react';
import { shallowEqual, useSelector } from 'react-redux';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Checkbox } from '../../../components/ds/forms/Checkbox';
import { Toggle } from '../../../components/ds/forms/Toggle';
import { Table } from '../../../components/ds/layout/Table';
import { Typography } from '../../../components/ds/foundation/Typography';
import { StatusBadge } from '../../../components/ds/foundation/StatusBadge';
import { useCM } from '../../../constants/useCM';
import { MULTI_DB_ACTIONS, MULTI_DB_ACTION_ICONS, databaseSelectionRows, splitByAction } from '../databaseMultiActions';


// What the actions go by, in words: running or not, logged in, saved login, HA.
const RowStatus = ({ row, CM }) => (
  <div className="flex flex-wrap gap-1">
    <StatusBadge label={row.running ? CM.multiDbStatusRunning : CM.multiDbStatusStopped} variant={row.running ? 'emerald' : 'slate'} />
    {row.loggedIn && <StatusBadge label={CM.multiDbStatusLoggedIn} variant="sky" />}
    {row.hasProfile && <StatusBadge label={CM.multiDbStatusSavedLogin} variant="slate" />}
    {row.isHa && <StatusBadge label={CM.multiDbColumnHa} variant="violet" />}
  </div>
);

const EMPTY_CREDENTIALS = { id: '', password: '' };

/**
 * Pick several databases of one host and run one action on them. Each
 * action button shows how many of the selected databases it applies to;
 * onAction gets the selected rows and runs the action (confirm, progress
 * and result are the caller's).
 */
export default function SelectDatabasesModal({ isOpen, hostUid, initialSelected, onClose, onAction }) {
  const CM = useCM();
  const database = useSelector((state) => ({
    navigatorDatabasesByHost: state.database.navigatorDatabasesByHost,
    navigatorActiveDatabasesByHost: state.database.navigatorActiveDatabasesByHost,
    haDbNamesByHost: state.database.haDbNamesByHost,
    loggedInDatabases: state.database.loggedInDatabases,
  }), shallowEqual);
  const rows = useMemo(() => databaseSelectionRows({ database }, hostUid), [database, hostUid]);
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  const [loginPending, setLoginPending] = useState(false);
  // Per database without a saved login: { [dbname]: { id, password } }.
  const [credentialsByDb, setCredentialsByDb] = useState({});
  // As in the single login dialog: on by default, and off saves nothing.
  const [saveCredentials, setSaveCredentials] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set(initialSelected || []));
    setFilter('');
    setLoginPending(false);
    setCredentialsByDb({});
    setSaveCredentials(true);
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
  const needingCredentials = loginTargets.filter((row) => !row.hasProfile);
  const credentialsOf = (dbname) => credentialsByDb[dbname] || EMPTY_CREDENTIALS;
  const setCredentialsOf = (dbname, patch) =>
    setCredentialsByDb((prev) => ({ ...prev, [dbname]: { ...(prev[dbname] || EMPTY_CREDENTIALS), ...patch } }));
  const applyFirstToAll = () => {
    const first = credentialsOf(needingCredentials[0].dbname);
    setCredentialsByDb((prev) => ({
      ...prev,
      ...Object.fromEntries(needingCredentials.map((row) => [row.dbname, { ...first }])),
    }));
  };

  const runAction = (action) => {
    if (action === 'login' && needingCredentials.length > 0 && !loginPending) {
      setLoginPending(true);
      return;
    }
    onAction(
      action,
      selectedRows,
      action === 'login'
        ? Object.fromEntries(Object.entries(credentialsByDb).map(([dbname, entry]) => [dbname, { ...entry, save: saveCredentials }]))
        : undefined
    );
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
    { header: CM.status, accessor: 'running', render: (_, row) => <RowStatus row={row} CM={CM} /> },
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
        {loginPending && needingCredentials.length > 0 && (
          <div className="space-y-2" data-testid="select-databases-credentials">
            <div className="flex items-center justify-between gap-2">
              <Typography variant="caption" className="text-slate-500">{CM.multiDbCredentialsTitle}</Typography>
              {needingCredentials.length > 1 && (
                <Button variant="ghost" size="sm" onClick={applyFirstToAll} data-testid="select-databases-apply-first">
                  {CM.multiDbApplyFirstToAll}
                </Button>
              )}
            </div>
            <div className="max-h-[200px] overflow-y-auto space-y-2">
              {needingCredentials.map((row) => (
                <div key={row.dbname} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2" data-testid={`select-databases-credentials-${row.dbname}`}>
                  <Typography variant="p" className="text-13 font-semibold truncate">{row.dbname}</Typography>
                  <Input
                    placeholder={CM.username}
                    aria-label={`${row.dbname} ${CM.username}`}
                    value={credentialsOf(row.dbname).id}
                    onChange={(e) => setCredentialsOf(row.dbname, { id: e.target.value })}
                    autoComplete="off"
                  />
                  <Input
                    type="password"
                    placeholder={CM.password}
                    aria-label={`${row.dbname} ${CM.password}`}
                    value={credentialsOf(row.dbname).password}
                    onChange={(e) => setCredentialsOf(row.dbname, { password: e.target.value })}
                    autoComplete="new-password"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 pt-1">
              <Typography variant="caption" className="text-slate-500">{CM.savePassword}</Typography>
              <Toggle variant="primary" checked={saveCredentials} onChange={() => setSaveCredentials((v) => !v)} testId="select-databases-save-credentials" />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
