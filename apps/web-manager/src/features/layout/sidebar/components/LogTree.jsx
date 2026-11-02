import { useEffect, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { setSelectedBroker, setSelectedBrokerSubItem, fetchBrokerLogs, fetchAdminLogs, fetchCMSLogs, fetchDatabaseLogs } from '../../../broker/brokerSlice';
import { openTab } from '../../layoutSlice';
import { dbKey } from '../../../database/dbKey';
import { TreeNode } from '../../../../components/domain/tree/TreeNode';
import { Skeleton } from '../../../../components/ds/layout/Skeleton';
import { Typography } from '../../../../components/ds/foundation/Typography';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { useCM } from '../../../../constants/useCM';

export default function LogTree({ hostUid, onDbLogContextMenu, onBrokerLogRootContextMenu, onBrokerErrorLogContextMenu, onAdminLogContextMenu, onManagerLogContextMenu, onServerLogRootContextMenu }) {
  const CM = useCM();
  const dispatch = useDispatch();
  // navigatorDatabasesByHost/navigatorBrokersByHost, not the raw
  // databasesByHost/brokersByHost — this tree should only move on an
  // explicit user action, not every MonitoringProvider interval poll
  // tick. See databaseCoreSlice.js/brokerSlice.js.
  const { navigatorDatabasesByHost, loggedInDatabases } = useSelector((state) => state.database, shallowEqual);
  const databases = navigatorDatabasesByHost[hostUid] || [];
  const { navigatorBrokersByHost, logsByBroker, logsLoading, adminLogsByHost, adminLogsLoading, cmsLogsByHost, selectedBrokerSubItem, dbLogsByDb, dbLogsLoadingByDb } = useSelector((state) => state.broker, shallowEqual);
  const authorizedHosts = useSelector((state) => state.host?.authorizedHosts) || [];
  const reconnectQueue = useSelector((state) => state.host?.reconnectQueue) || [];
  const brokers = navigatorBrokersByHost[hostUid] || [];
  const dbLogs = (dbname) => dbLogsByDb[dbKey(hostUid, dbname)];
  const dbLogsLoading = (dbname) => !!dbLogsLoadingByDb[dbKey(hostUid, dbname)];

  // Databases whose node the user opened. One opened before its login gets
  // its list read once, when the login arrives. A failed read is not
  // retried on its own (only by opening the node again or a refresh), and
  // nothing is read while the host isn't connected — this tree stays
  // mounted while hidden, so a retry here would repeat unseen.
  const openedDbs = useRef(new Set());
  const prevLoggedIn = useRef(loggedInDatabases);
  const hostConnected = authorizedHosts.includes(hostUid) && !reconnectQueue.includes(hostUid);
  useEffect(() => {
    const prev = prevLoggedIn.current;
    prevLoggedIn.current = loggedInDatabases;
    if (!hostConnected) return;
    loggedInDatabases
      .filter((key) => !prev.includes(key) && openedDbs.current.has(key) && !dbLogsByDb[key] && !dbLogsLoadingByDb[key])
      .forEach((key) => dispatch(fetchDatabaseLogs({ hostUid, dbname: key.slice(key.lastIndexOf(':') + 1) })));
    // Only a login change triggers this; the lists are read for the check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, hostUid, hostConnected, loggedInDatabases]);

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
                    <div className="px-10 py-3 opacity-60 flex items-center gap-2">
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
                <div className="px-10 py-3 opacity-60 flex items-center gap-2">
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
          {(databases || []).map((db, idx) => {
            // A database's log list (and so its log files) is a per-db
            // request the server refuses without a DB login.
            const isLoggedIn = loggedInDatabases.includes(dbKey(hostUid, db.dbname));
            return (
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
                onToggle={(open) => {
                  if (open === false) return; // only opening reads
                  openedDbs.current.add(dbKey(hostUid, db.dbname));
                  if (isLoggedIn && hostConnected && !dbLogs(db.dbname) && !dbLogsLoading(db.dbname)) {
                    dispatch(fetchDatabaseLogs({ hostUid, dbname: db.dbname }));
                  }
                }}
                isLoading={isLoggedIn && dbLogsLoading(db.dbname) && !dbLogs(db.dbname)}
                onContextMenu={(e) => onDbLogContextMenu && onDbLogContextMenu(e, db.dbname)}
              >
                    {isLoggedIn && (dbLogs(db.dbname) || []).map((log, lIdx) => {
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
                    {(!isLoggedIn || (!dbLogsLoading(db.dbname) && (dbLogs(db.dbname) || []).length === 0)) && (
                      <div className="px-10 py-3 opacity-60 flex items-center gap-2">
                         <Icon name={isLoggedIn ? 'block' : 'lock'} size="xs" weight={300} />
                         <Typography variant="caption" className="italic font-bold uppercase tracking-widest text-10">{isLoggedIn ? CM.emptyListLabel : CM.databaseNotLoggedIn}</Typography>
                      </div>
                    )}
              </TreeNode>
            );
          })}
          {(!databases || databases.length === 0) && (
            <div className="px-10 py-5 opacity-70 flex flex-col items-center justify-center">
               <Typography variant="caption" className="italic text-12">{CM.noDatabasesAvailable}</Typography>
            </div>
          )}
      </TreeNode>
    </div>
  );
}
