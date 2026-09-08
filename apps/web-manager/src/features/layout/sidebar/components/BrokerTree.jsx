import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { setSelectedBroker, setSelectedBrokerSubItem, fetchBrokerLogs } from '../../../broker/brokerSlice';
import { openTab } from '../../layoutSlice';
import { TreeNode } from '../../../../components/domain/tree/TreeNode';
import { Skeleton } from '../../../../components/ds/layout/Skeleton';
import { Typography } from '../../../../components/ds/foundation/Typography';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { useCM } from '../../../../constants/useCM';

export default function BrokerTree({ hostUid, onContextMenu, onSqlLogContextMenu }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const { brokers, loading, logsByBroker, selectedBroker, selectedBrokerSubItem, logsLoading } = useSelector((state) => state.broker, shallowEqual);

  if (loading && (!brokers || brokers.length === 0)) {
    return (
      <div className="flex flex-col gap-4 p-5 animate-in fade-in duration-500">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
               <Skeleton variant="circular" width="16px" height="16px" className="opacity-40" />
               <Skeleton variant="text" width="85%" height="18px" className="rounded-md" />
            </div>
            <div className="flex items-center gap-2 ml-6 opacity-30">
               <Skeleton variant="text" width="60%" height="14px" className="rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!brokers || brokers.length === 0) {
    return (
      <div className="px-6 py-12 flex flex-col items-center justify-center text-center space-y-3 opacity-40">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-2">
          <Icon name="hub" size="md" className="text-slate-400" weight={100} />
        </div>
        <Typography variant="caption" className="text-slate-500 font-black uppercase tracking-widest text-12">
          {CM.noMatches}
        </Typography>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 px-2 py-2">
      {brokers.map((broker) => {
        const isBrokerSelected = selectedBroker === broker.name;
        const brokerLogs = (logsByBroker[broker.name] || []).filter(log => log.path.toLowerCase().endsWith('.log'));
        
        return (
          <TreeNode
            key={broker.name}
            id={broker.name}
            label={`${broker.name} (${broker.port})`}
            icon="hub"
            level={1}
            status={broker.state === 'ON' ? 'on' : 'off'}
            isActive={isBrokerSelected && !selectedBrokerSubItem}
            hasChildren={true}
            onSelect={() => {
              dispatch(setSelectedBroker(broker.name));
              dispatch(setSelectedBrokerSubItem(null));
            }}
            onToggle={() => {
              if (!logsByBroker[broker.name] && !logsLoading) {
                dispatch(fetchBrokerLogs({ hostUid, brokerName: broker.name }));
              }
            }}
            onDoubleClick={() => dispatch(openTab(`broker_status:${hostUid}:${broker.name}`))}
            onContextMenu={(e) => onContextMenu(e, broker.name, broker.state)}
          >
            <TreeNode
              label={CM.sqlLog}
              icon="history_edu"
              level={2}
              isActive={isBrokerSelected && selectedBrokerSubItem === 'SQL Log'}
              hasChildren={true}
              isLoading={logsLoading && !logsByBroker[broker.name]}
              onSelect={() => {
                dispatch(setSelectedBroker(broker.name));
                dispatch(setSelectedBrokerSubItem('SQL Log'));
              }}
              onContextMenu={(e) => onSqlLogContextMenu && onSqlLogContextMenu(e, broker.name)}
            >
              {brokerLogs.map((log, idx) => {
                const fileName = log.path.split('/').pop();
                const isLogSelected = isBrokerSelected && selectedBrokerSubItem === log.path;
                return (
                  <TreeNode
                    key={idx}
                    id={log.path}
                    label={fileName}
                    icon="description"
                    isActive={isLogSelected}
                    level={3}
                    onSelect={() => {
                      dispatch(setSelectedBroker(broker.name));
                      dispatch(setSelectedBrokerSubItem(log.path));
                    }}
                    onDoubleClick={() => dispatch(openTab(`log:${hostUid}:${log.path}`))}
                  />
                );
              })}
              {!logsLoading && brokerLogs.length === 0 && (
                <div className="px-10 py-3 opacity-30 flex items-center gap-2">
                    <Icon name="block" size="xs" weight={300} />
                    <Typography variant="caption" className="italic font-bold uppercase tracking-widest text-10">{CM.emptyListLabel}</Typography>
                </div>
              )}
            </TreeNode>
          </TreeNode>
        );
      })}
    </div>
  );
}
