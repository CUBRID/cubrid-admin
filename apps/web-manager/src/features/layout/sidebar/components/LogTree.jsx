import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { setSelectedBroker, setSelectedBrokerSubItem, fetchBrokerLogs, fetchAdminLogs, fetchCMSLogs, fetchDatabaseLogs } from '../../../broker/brokerSlice';
import { openTab } from '../../layoutSlice';
import { TreeNode } from '../../../../components/domain/tree/TreeNode';
import { Skeleton } from '../../../../components/ds/layout/Skeleton';
import { Typography } from '../../../../components/ds/foundation/Typography';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { useCM } from '../../../../constants/useCM';

export default function LogTree({ hostUid, onDbLogContextMenu, onBrokerLogRootContextMenu, onBrokerErrorLogContextMenu, onAdminLogContextMenu, onManagerLogContextMenu, onServerLogRootContextMenu }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const { databases } = useSelector((state) => state.database, shallowEqual);
  const { brokers, logsByBroker, logsLoading, adminLogsByHost, adminLogsLoading, cmsLogsByHost, selectedBrokerSubItem, dbLogsByDbName, dbLogsLoading } = useSelector((state) => state.broker, shallowEqual);

  return (
    <div className="space-y-0.5 px-2 py-2">
      {/* Broker Logs Section */}
      <TreeNode
        label={CM.broker}
        icon="hub"
        level={1}
        isActive={selectedBrokerSubItem === 'log-broker-root'}
        hasChildren={true}
        onSelect={() => {
          dispatch(setSelectedBroker(null));
          dispatch(setSelectedBrokerSubItem('log-broker-root'));
        }}
        onContextMenu={(e) => onBrokerLogRootContextMenu && onBrokerLogRootContextMenu(e)}
      >
          {/* Access Logs */}
          <TreeNode
            label={CM.access}
            icon="login"
            level={2}
            isActive={selectedBrokerSubItem === 'log-access'}
            hasChildren={false}
            onSelect={() => {
              dispatch(setSelectedBroker(null));
              dispatch(setSelectedBrokerSubItem('log-access'));
            }}
            onContextMenu={(e) => onBrokerLogRootContextMenu && onBrokerLogRootContextMenu(e)}
          />

          {/* Error Logs */}
          <TreeNode
            label={CM.error}
            icon="report"
            level={2}
            isActive={selectedBrokerSubItem === 'log-error'}
            hasChildren={true}
            isLoading={logsLoading}
            onSelect={() => {
              dispatch(setSelectedBroker(null));
              dispatch(setSelectedBrokerSubItem('log-error'));
            }}
            onContextMenu={(e) => onBrokerErrorLogContextMenu && onBrokerErrorLogContextMenu(e)}
            onToggle={() => {
              if (!logsLoading) {
                brokers.forEach(broker => {
                  if (!logsByBroker[broker.name]) {
                    dispatch(fetchBrokerLogs({ hostUid, brokerName: broker.name }));
                  }
                });
              }
            }}
          >
              {(() => {
                const errorLogs = Object.values(logsByBroker)
                  .flat()
                  .filter(log => log.path.toLowerCase().endsWith('.err'));

                if (!logsLoading && errorLogs.length === 0) {
                  return (
                    <div className="px-10 py-3 opacity-30 flex items-center gap-2">
                       <Icon name="block" size="xs" weight={300} />
                       <Typography variant="caption" className="italic font-bold uppercase tracking-widest text-10">{CM.emptyListLabel}</Typography>
                    </div>
                  );
                }

                return errorLogs.map((log, idx) => {
                  const fileName = log.path.split('/').pop();
                  const isLogSelected = selectedBrokerSubItem === log.path;
                  return (
                    <TreeNode
                      key={idx}
                      label={fileName}
                      icon="description"
                      isActive={isLogSelected}
                      level={3}
                      onSelect={() => {
                        dispatch(setSelectedBroker(null));
                        dispatch(setSelectedBrokerSubItem(log.path));
                      }}
                      onDoubleClick={() => dispatch(openTab(`log:${hostUid}:${log.path}`))}
                    />
                  );
                });
              })()}
          </TreeNode>

          {/* Admin Logs */}
          <TreeNode
            label={CM.adminLog}
            icon="admin_panel_settings"
            level={2}
            isActive={selectedBrokerSubItem === 'log-admin'}
            hasChildren={true}
            isLoading={adminLogsLoading}
            onSelect={() => {
              dispatch(setSelectedBroker(null));
              dispatch(setSelectedBrokerSubItem('log-admin'));
            }}
            onContextMenu={(e) => onAdminLogContextMenu && onAdminLogContextMenu(e)}
            onToggle={() => {
              if (!adminLogsByHost[hostUid] && !adminLogsLoading) {
                dispatch(fetchAdminLogs(hostUid));
              }
            }}
          >
              {(adminLogsByHost[hostUid] || []).map((log, idx) => {
                const fileName = log.path.split('/').pop();
                const isLogSelected = selectedBrokerSubItem === log.path;
                return (
                  <TreeNode
                    key={idx}
                    label={fileName}
                    icon="description"
                    isActive={isLogSelected}
                    level={3}
                    onSelect={() => {
                      dispatch(setSelectedBroker(null));
                      dispatch(setSelectedBrokerSubItem(log.path));
                    }}
                    onDoubleClick={() => dispatch(openTab(`log:${hostUid}:${log.path}`))}
                  />
                );
              })}
              {!adminLogsLoading && (adminLogsByHost[hostUid] || []).length === 0 && (
                <div className="px-10 py-3 opacity-30 flex items-center gap-2">
                   <Icon name="block" size="xs" weight={300} />
                   <Typography variant="caption" className="italic font-bold uppercase tracking-widest text-10">{CM.emptyListLabel}</Typography>
                </div>
              )}
          </TreeNode>
      </TreeNode>

      {/* Manager Logs Section */}
      <TreeNode
        label={CM.manager}
        icon="manage_accounts"
        level={1}
        isActive={selectedBrokerSubItem === 'log-manager-root'}
        hasChildren={true}
        onSelect={() => {
          dispatch(setSelectedBroker(null));
          dispatch(setSelectedBrokerSubItem('log-manager-root'));
        }}
        onContextMenu={(e) => onManagerLogContextMenu && onManagerLogContextMenu(e)}
        onToggle={() => {
          if (!cmsLogsByHost[hostUid] && !logsLoading) {
            dispatch(fetchCMSLogs(hostUid));
          }
        }}
      >
          <TreeNode
            label={CM.accessLog}
            icon="login"
            level={2}
            isActive={selectedBrokerSubItem === 'cms-access'}
            onSelect={() => {
              dispatch(setSelectedBroker(null));
              dispatch(setSelectedBrokerSubItem('cms-access'));
            }}
            onDoubleClick={() => dispatch(openTab(`cms-access:${hostUid}`))}
            onContextMenu={(e) => onManagerLogContextMenu && onManagerLogContextMenu(e)}
          />
          <TreeNode
            label={CM.errorLog}
            icon="report"
            level={2}
            isActive={selectedBrokerSubItem === 'cms-error'}
            onSelect={() => {
              dispatch(setSelectedBroker(null));
              dispatch(setSelectedBrokerSubItem('cms-error'));
            }}
            onDoubleClick={() => dispatch(openTab(`cms-error:${hostUid}`))}
            onContextMenu={(e) => onManagerLogContextMenu && onManagerLogContextMenu(e)}
          />
      </TreeNode>

      {/* Server/Database Logs Section */}
      <TreeNode
        label={CM.serverLogs}
        icon="dns"
        level={1}
        isActive={selectedBrokerSubItem === 'log-server-root'}
        hasChildren={true}
        onSelect={() => {
          dispatch(setSelectedBroker(null));
          dispatch(setSelectedBrokerSubItem('log-server-root'));
        }}
        onContextMenu={(e) => onServerLogRootContextMenu && onServerLogRootContextMenu(e)}
      >
          {(databases || []).map((db, idx) => (
            <TreeNode 
              key={idx} 
              label={db.dbname}
              icon="database"
              level={2}
              isActive={selectedBrokerSubItem === `log-db-${db.dbname}`}
              hasChildren={true}
              onSelect={() => {
                dispatch(setSelectedBroker(null));
                dispatch(setSelectedBrokerSubItem(`log-db-${db.dbname}`));
              }}
              onToggle={() => {
                if (!dbLogsByDbName[db.dbname] && !dbLogsLoading) {
                  dispatch(fetchDatabaseLogs({ hostUid, dbname: db.dbname }));
                }
              }}
              isLoading={dbLogsLoading && !dbLogsByDbName[db.dbname]}
              onContextMenu={(e) => onDbLogContextMenu && onDbLogContextMenu(e, db.dbname)}
            >
                  {(dbLogsByDbName[db.dbname] || []).map((log, lIdx) => {
                    const fileName = log.path.split('/').pop();
                    const isLogSelected = selectedBrokerSubItem === log.path;
                    return (
                      <TreeNode 
                        key={lIdx}
                        label={fileName}
                        icon="description"
                        isActive={isLogSelected}
                        level={3}
                        onSelect={() => {
                          dispatch(setSelectedBroker(null));
                          dispatch(setSelectedBrokerSubItem(log.path));
                        }}
                        onDoubleClick={() => dispatch(openTab(`log:${hostUid}:${log.path}`))}
                      />
                    );
                  })}
                  {!dbLogsLoading && (dbLogsByDbName[db.dbname] || []).length === 0 && (
                    <div className="px-10 py-3 opacity-30 flex items-center gap-2">
                       <Icon name="block" size="xs" weight={300} />
                       <Typography variant="caption" className="italic font-bold uppercase tracking-widest text-10">{CM.emptyListLabel}</Typography>
                    </div>
                  )}
            </TreeNode>
          ))}
          {(!databases || databases.length === 0) && (
            <div className="px-10 py-5 opacity-40 flex flex-col items-center justify-center">
               <Typography variant="caption" className="italic text-12">{CM.noDatabasesAvailable}</Typography>
            </div>
          )}
      </TreeNode>
    </div>
  );
}

