import { useDispatch } from 'react-redux';
import { setSelectedDatabase, setSelectedDatabaseSubItem } from '../../../database/databaseSlice';
import { setSelectedBroker } from '../../../broker/brokerSlice';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { useCM } from '../../../../constants/useCM';

export default function TreeTabHeader({ activeTab, setActiveTab, onDbTabContextMenu, onBrokerTabContextMenu, onLogTabContextMenu }) {
  const CM = useCM();
  const dispatch = useDispatch();

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    dispatch(setSelectedDatabase(null));
    dispatch(setSelectedDatabaseSubItem(null));
    dispatch(setSelectedBroker(null));
  };

  const tabs = [
    { id: 'db',     label: CM.database, icon: 'database',      onContextMenu: onDbTabContextMenu },
    { id: 'broker', label: CM.broker,   icon: 'hub',           onContextMenu: onBrokerTabContextMenu },
    { id: 'log',    label: CM.log,      icon: 'receipt_long',  onContextMenu: onLogTabContextMenu },
  ];

  return (
    <div className="flex items-center gap-0.5 px-2 py-2 border-b border-slate-100 dark:border-white/5 bg-white dark:bg-background-dark shrink-0">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            data-testid={`tree-tab-${tab.id}`}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-md text-13 font-bold tracking-tight transition-all duration-150 select-none relative

              ${isActive
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-500'
                : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/4'
              }`}

            onClick={() => handleTabChange(tab.id)}
            onContextMenu={tab.onContextMenu}
          >
            <Icon
              name={tab.icon}
              size="sm"
              weight={isActive ? 400 : 300}
              className={isActive ? 'text-amber-500' : ''}
            />
            {tab.label}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500" />
            )}

          </button>
        );
      })}
    </div>
  );
}
