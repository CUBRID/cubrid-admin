import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeUnloadResultModal } from '../databaseSlice';
import { useCM } from '../../../constants/useCM';

import { Button } from '../../../components/ds/foundation/Button';
import { Modal } from '../../../components/ds/layout/Modal';
import { Table } from '../../../components/ds/layout/Table';

export default function UnloadResultModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isUnloadResultModalOpen, unloadResultData } = useSelector((state) => state.databaseUI, shallowEqual);

  if (!isUnloadResultModalOpen) return null;

  const resultData = unloadResultData?.[0] || {};
  const rows = Object.entries(resultData).map(([tableName, stats]) => ({
    tableName,
    stats,
  }));
  const close = () => dispatch(closeUnloadResultModal());
  const columns = [
    { accessor: 'tableName', header: CM.classLabel },
    { accessor: 'stats', header: CM.resultLabel, align: 'right', cellClassName: 'font-mono text-amber-600 dark:text-amber-400' },
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
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <Table columns={columns} data={rows} emptyMessage={CM.noResultsLabel} showEmptyStateAsRow bordered selectable />
      </div>
    </Modal>
  );
}
