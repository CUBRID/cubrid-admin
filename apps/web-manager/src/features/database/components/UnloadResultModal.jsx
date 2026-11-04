import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeUnloadResultModal } from '../databaseSlice';
import { useCM } from '../../../constants/useCM';

import { Button } from '../../../components/ds/foundation/Button';
import { Modal } from '../../../components/ds/layout/Modal';
import { Table } from '../../../components/ds/layout/Table';

// unloaddb's per-table result reads like "1234 (100%/38%)": the rows
// unloaded, then a fixed 100% and how far the whole unload was when the table
// finished. Only the row count says something about the table; anything that
// doesn't start with a number is shown as given.
export function unloadRowCount(stats) {
  const match = /^\s*(\d+)/.exec(String(stats ?? ''));
  return match ? match[1] : stats;
}

// When some objects fail, unloaddb ends with "Only N out of M objects dumped
// successfully." (utils.msg set 13, 46). CMS reads its log lines as
// "name x count pct x pct", so that sentence arrives as a row of its own:
// Only: "out of/objects", or with the Korean catalog N: "객체가 (전체/객체)".
export function isPartialUnloadRow(name, stats) {
  const value = String(stats ?? '');
  return (name === 'Only' && value.startsWith('out of/'))
    || (/^\d+$/.test(name) && value.startsWith('객체가 (전체/'));
}

export default function UnloadResultModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isUnloadResultModalOpen, unloadResultData } = useSelector((state) => state.databaseUI, shallowEqual);

  if (!isUnloadResultModalOpen) return null;

  const resultData = unloadResultData?.[0] || {};
  const entries = Object.entries(resultData);
  const partial = entries.some(([name, stats]) => isPartialUnloadRow(name, stats));
  // A table's line starts with its row count; any other line is not a table.
  const rows = entries
    .filter(([, stats]) => /^\s*\d/.test(String(stats ?? '')))
    .map(([tableName, stats]) => ({ tableName, rowCount: unloadRowCount(stats) }));
  const close = () => dispatch(closeUnloadResultModal());
  const columns = [
    { accessor: 'tableName', header: CM.unloadTableNameLabel },
    { accessor: 'rowCount', header: CM.unloadRowCountLabel, align: 'right', cellClassName: 'font-mono text-amber-600 dark:text-amber-400' },
  ];

  return (
    <Modal
      isOpen
      onClose={close}
      title={CM.unloadResultTitle}
      subtitle={CM.unloadResultMsg}
      icon="analytics"
      maxWidth="500px"
      footer={<Button variant="primary" onClick={close}>{CM.close}</Button>}
    >
      {partial && (
        <p data-testid="unload-result-partial" className="mb-3 text-13 text-amber-600 dark:text-amber-400">{CM.unloadPartialMsg}</p>
      )}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <Table columns={columns} data={rows} emptyMessage={CM.noResultsLabel} showEmptyStateAsRow bordered selectable />
      </div>
    </Modal>
  );
}
