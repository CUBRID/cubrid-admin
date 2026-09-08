import { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeLoadDatabaseModal } from '../databaseSlice';
import { dbKey } from '../dbKey';
import { databaseApi } from '../databaseApi';
import { databaseJobApi } from '../databaseJobApi';
import { useCmsJob } from '../../../infrastructure/hooks/useCmsJob';
import { getCmsJobLoadingSubtitle } from '../../../infrastructure/cmsJob/cmsJobUi';
import { useCM } from '../../../constants/useCM';

import LoadConfigSection from './load/LoadConfigSection';
import LoadSourceSection from './load/LoadSourceSection';
import LoadOptionsSection from './load/LoadOptionsSection';

import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Icon } from '../../../components/ds/foundation/Icon';
import { EmptyState } from '../../../components/ds/feedback/EmptyState';
import { useActionState } from '../../../infrastructure/hooks/useActionState';
import {
  ModalStatusLoading,
  ModalStatusSuccess,
  ModalStatusError,
} from '../../../components/ds/feedback/ActionStatus';

export default function LoadDatabaseModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isLoadDatabaseModalOpen: isLoadDBModalOpen } = useSelector((state) => state.databaseUI, shallowEqual);
  const { selectedDatabase, activeDatabases, loggedInDatabases } = useSelector((state) => state.database, shallowEqual);
  const { selectedHostUid } = useSelector((state) => state.host, shallowEqual);

  const isActive = !!selectedDatabase && activeDatabases?.includes(selectedDatabase);
  // Load only ever targets an offline database, so this can't be satisfied by
  // logging in right now — it must have happened earlier, while the database
  // was still online (loggedInDatabases persists across stop, see
  // databaseCoreSlice's stopDatabase.fulfilled). Enforces the required
  // sequence: start -> Login Database -> stop -> Load.
  const isLoggedIn = !!selectedDatabase && loggedInDatabases.includes(dbKey(selectedHostUid, selectedDatabase));

  const {
    error: actionError,
    startAction,
    endSuccess,
    endError,
    resetAction,
    isLoading,
    isSuccess,
    isError,
  } = useActionState();
  const { runJob, background, wasBackgrounded } = useCmsJob();
  const [jobStatus, setJobStatus] = useState(null);

  const [unloadList, setUnloadList] = useState([]);
  const [selectedUnload, setSelectedUnload] = useState('');
  const [dataSource, setDataSource] = useState([]);
  const [radio, setRadio] = useState(0);

  const [formData, setFormData] = useState({
    targetDbName: '',
    dbUsername: 'dba',
    dbPassword: '',
    unloadFiles: {
      schema: '',
      object: '',
      index: '',
      trigger: '',
    },
    checkBoxes: {
      schema: false,
      object: false,
      index: false,
      trigger: false,
      checkoption: false,
      nolog: false,
      oiduse: false,
      statisticsuse: false,
      estimated: false,
      period: true,
      errorcontrolfile: false,
      ignoreclassfile: false,
    },
    values: {
      estimated: '',
      period: '10000',
      errorcontrolfile: '',
      ignoreclassfile: '',
    },
  });

  const updateDataSource = (rawData) => {
    const convertedList = Object.entries(rawData)
      .filter(([key]) => key !== 'dbname')
      .map(([key, value]) => {
        const [path, date] = value.split(';');
        return {
          loadType: key,
          path,
          date,
          key: Math.random().toString(36).substr(2, 4),
          checked: false,
        };
      });
    setDataSource(convertedList);
  };

  useEffect(() => {
    if (isLoadDBModalOpen && selectedDatabase) {
      resetAction();
      setFormData((prev) => ({
        ...prev,
        targetDbName: selectedDatabase,
      }));

      if (!isLoggedIn) return;

      databaseApi.getUnloadInfo(selectedHostUid).then((res) => {
        const dbs = res.database || [];
        setUnloadList(dbs);
        if (dbs.length > 0) {
          const firstDb = dbs[0];
          setSelectedUnload(firstDb.dbname);
          updateDataSource(firstDb);
        }
      }).catch((err) => console.error('Failed to fetch unload info:', err));
    }
  }, [isLoadDBModalOpen, selectedDatabase, selectedHostUid, isLoggedIn, resetAction]);

  if (!isLoadDBModalOpen) return null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRadioChange = (newRadio) => {
    const radioVal = Number(newRadio);
    setRadio(radioVal);
    if (radioVal === 0) {
      // select from list: clear selectFromLocal states
      setFormData((prev) => ({
        ...prev,
        checkBoxes: {
          ...prev.checkBoxes,
          schema: false,
          object: false,
          index: false,
          trigger: false,
        },
        unloadFiles: {
          schema: '',
          object: '',
          index: '',
          trigger: '',
        },
      }));
    } else {
      // select from local system: clear table selection
      setDataSource((prev) =>
        prev.map((item) => ({ ...item, checked: false }))
      );
    }
  };

  const handleUnloadSelectChange = (dbname) => {
    setSelectedUnload(dbname);
    const db = unloadList.find((d) => d.dbname === dbname);
    if (db) updateDataSource(db);
  };

  const handleTableCheckboxChange = (checked, key) => {
    setDataSource((prev) => {
      const targetRow = prev.find((item) => item.key === key);
      if (!targetRow) return prev;

      return prev.map((item) => {
        if (item.key === key) {
          return { ...item, checked };
        }
        if (checked && item.loadType === targetRow.loadType) {
          return { ...item, checked: false };
        }
        return item;
      });
    });
  };

  const handleCheckBoxChange = (id, checked) => {
    setFormData((prev) => {
      const newCheckBoxes = { ...prev.checkBoxes, [id]: checked };
      const newValues = { ...prev.values };
      const newUnloadFiles = { ...prev.unloadFiles };

      if (id === 'estimated') {
        newValues.estimated = checked ? (prev.values.estimated || '5000') : '';
      } else if (id === 'period') {
        newValues.period = checked ? (prev.values.period || '10000') : '';
      } else if (id === 'errorcontrolfile' && !checked) {
        newValues.errorcontrolfile = '';
      } else if (id === 'ignoreclassfile' && !checked) {
        newValues.ignoreclassfile = '';
      } else if (['schema', 'object', 'index', 'trigger'].includes(id) && !checked) {
        newUnloadFiles[id] = '';
      }

      return {
        ...prev,
        checkBoxes: newCheckBoxes,
        values: newValues,
        unloadFiles: newUnloadFiles,
      };
    });
  };

  const handleValueChange = (id, value) => {
    setFormData((prev) => ({
      ...prev,
      values: { ...prev.values, [id]: value },
    }));
  };

  const handleUnloadPathChange = (type, value) => {
    setFormData((prev) => ({
      ...prev,
      unloadFiles: { ...prev.unloadFiles, [type]: value },
    }));
  };

  const handleLoadDatabase = async () => {
    if (!selectedHostUid || !selectedDatabase || !isLoggedIn) return;

    startAction();
    try {
      const toYesNo = (val) => (val ? 'yes' : 'no');
      let loadObject = {};

      if (radio === 0) {
        ['index', 'schema', 'object', 'trigger'].forEach((item) => {
          const found = dataSource.find((res) => res.checked && res.loadType === item);
          loadObject[item] = found ? found.path : 'none';
        });
      } else {
        loadObject = {
          index: formData.checkBoxes.index ? formData.unloadFiles.index : 'none',
          schema: formData.checkBoxes.schema ? formData.unloadFiles.schema : 'none',
          object: formData.checkBoxes.object ? formData.unloadFiles.object : 'none',
          trigger: formData.checkBoxes.trigger ? formData.unloadFiles.trigger : 'none',
        };
      }

      const payload = {
        dbname: selectedDatabase,
        ...loadObject,
        // Sent as-is from the form fields, always — omitting --user entirely
        // makes CUBRID's loaddb default to PUBLIC (not DBA), which typically
        // can't create classes, so a visible, always-sent value here is
        // safer than a clever fallback the user can't see or override.
        _DBID: formData.dbUsername,
        _DBPASSWD: formData.dbPassword,
        // Inverted on purpose: the checkboxes are labeled "Don't use OID" /
        // "Don't update statistics" (checked = disable), but CMS's oiduse/
        // statisticsuse fields are worded the other way — CMS only adds
        // --no-oid/--no-statistics when the value is "no", so checked here
        // must send "no", not "yes".
        oiduse: formData.checkBoxes.oiduse ? 'no' : 'yes',
        statisticsuse: formData.checkBoxes.statisticsuse ? 'no' : 'yes',
        nolog: toYesNo(formData.checkBoxes.nolog),
        period: formData.checkBoxes.period ? formData.values.period : 'none',
        estimated: formData.checkBoxes.estimated ? formData.values.estimated : 'none',
        errorcontrolfile: formData.checkBoxes.errorcontrolfile ? formData.values.errorcontrolfile : 'none',
        ignoreclassfile: formData.checkBoxes.ignoreclassfile ? formData.values.ignoreclassfile : 'none',
        checkoption: formData.checkBoxes.checkoption ? 'both' : 'load',
      };

      await runJob(
        () => databaseJobApi.submitLoad(selectedHostUid, selectedDatabase, payload),
        { onProgress: (j) => setJobStatus(j.jobStatus ?? j.status) }
      );
      if (!wasBackgrounded()) endSuccess();
    } catch (err) {
      if (!wasBackgrounded()) endError(typeof err === 'string' ? err : (err.message || CM.failure));
    }
  };

  const handleClose = () => {
    dispatch(closeLoadDatabaseModal());
    resetAction();
  };

  const getValidationError = () => {
    if (radio === 0) {
      if (!selectedUnload) {
        return CM.errLoadFileFromList || 'Please select the unloaded file from the list.';
      }
      const hasChecked = dataSource.some((row) => row.checked);
      if (!hasChecked) {
        return CM.errNoSelectedPath || 'Please check the unloaded files of the selected database from the following list.';
      }
    } else if (radio === 1) {
      const { schema, object, index, trigger } = formData.checkBoxes;
      if (!schema && !object && !index && !trigger) {
        return CM.errLoadFileFromSys || 'Please select the unloaded file from the file system';
      }
      if (schema && !formData.unloadFiles.schema?.trim()) {
        return CM.errLoadSchema || 'Loaded schema file is not valid.';
      }
      if (object && !formData.unloadFiles.object?.trim()) {
        return CM.errLoadOjbects || 'Loaded objects file is not valid.';
      }
      if (index && !formData.unloadFiles.index?.trim()) {
        return CM.errLoadIndex || 'Loaded index file is not valid.';
      }
      if (trigger && !formData.unloadFiles.trigger?.trim()) {
        return CM.errLoadTrigger || 'Loaded trigger file is not valid.';
      }
    }

    if (formData.checkBoxes.estimated) {
      const val = formData.values.estimated;
      if (!val || isNaN(val) || !Number.isInteger(Number(val)) || Number(val) <= 0) {
        return CM.errNumOfInstances || 'The estimated number of instances is not valid. It can only be an integer greater than 0.';
      }
    }

    if (formData.checkBoxes.period) {
      const val = formData.values.period;
      if (!val || isNaN(val) || !Number.isInteger(Number(val)) || Number(val) <= 0) {
        return CM.errInsertCount || 'The value of insertion count for periodic commit is not valid. It can only be an integer value greater than 0.';
      }
    }

    if (formData.checkBoxes.errorcontrolfile) {
      if (!formData.values.errorcontrolfile?.trim()) {
        return CM.errControlFile || 'The error control file is not valid.';
      }
    }

    if (formData.checkBoxes.ignoreclassfile) {
      if (!formData.values.ignoreclassfile?.trim()) {
        return CM.errClassFile || 'The ignored table file is not valid.';
      }
    }

    return null;
  };

  const validationError = getValidationError();
  const isFormValid = !isActive && !!formData.dbUsername && !validationError;

  // handleLoadDatabase itself doesn't re-check isFormValid (only the footer
  // button's disabled prop does), so Enter-to-submit needs its own guard to
  // avoid bypassing that gate.
  const handleFormSubmit = () => {
    if (!isFormValid) return;
    handleLoadDatabase();
  };

  if (isLoading) {
    return (
      <Modal isOpen title={CM.loadDatabase} icon="download" onClose={handleClose} maxWidth="720px">
        <ModalStatusLoading
          title={CM.loadDatabase}
          subtitle={getCmsJobLoadingSubtitle(selectedDatabase, jobStatus, CM)}
          onBackground={() => { background(); handleClose(); }}
        />
      </Modal>
    );
  }

  if (isSuccess) {
    return (
      <Modal isOpen title={CM.loadDatabase} icon="download" iconVariant="success" onClose={handleClose} maxWidth="720px">
        <ModalStatusSuccess
          title={CM.success}
          message={CM.jobCompletedSuccess(CM.loadDatabase)}
          onConfirm={handleClose}
          confirmText={CM.ok}
        />
      </Modal>
    );
  }

  if (isError) {
    return (
      <Modal isOpen title={CM.loadDatabase} icon="database_upload" iconVariant="danger" onClose={resetAction} maxWidth="700px">
        <ModalStatusError
          title={CM.failure}
          error={actionError}
          guidance={CM.loadDbGuidance}
          onRetry={handleLoadDatabase}
          onCancel={resetAction}
          cancelText={CM.close}
        />
      </Modal>
    );
  }

  if (!isLoggedIn) {
    return (
      <Modal
        isOpen={isLoadDBModalOpen}
        onClose={handleClose}
        title={CM.loadDatabase}
        icon="download"
        maxWidth="480px"
        testId="load-database"
        footer={
          <div className="flex justify-end w-full">
            <Button data-testid="load-database-cancel-btn" variant="secondary" onClick={handleClose}>{CM.close}</Button>
          </div>
        }
      >
        <EmptyState
          icon="lock"
          accent="amber"
          title={CM.loadDbLoginRequiredTitle}
          subtitle={CM.loadDbLoginRequiredMsg}
        />
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isLoadDBModalOpen}
      onClose={handleClose}
      title={CM.loadDatabase}
      subtitle={
        validationError ? (
          <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1 font-semibold transition-colors duration-150">
            <Icon name="error" size="13px" className="shrink-0" />
            {validationError}
          </span>
        ) : (
          CM.loadDatabaseMsg
        )
      }
      icon="download"
      maxWidth="720px"
      testId="load-database"
      onSubmit={handleFormSubmit}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button data-testid="load-database-cancel-btn" variant="ghost" onClick={handleClose}>{CM.cancel}</Button>
          <Button data-testid="load-database-run-btn" onClick={handleLoadDatabase} icon="play_circle" disabled={!isFormValid}>
            {CM.ok}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {isActive && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2.5 text-amber-700 dark:text-amber-400 text-xs">
            <Icon name="warning" size="sm" />
            <span>Database loading can only be performed when the database is stopped.</span>
          </div>
        )}
        <LoadConfigSection formData={formData} handleInputChange={handleInputChange} />
        <LoadSourceSection
          radio={radio}
          setRadio={handleRadioChange}
          selectedUnload={selectedUnload}
          handleUnloadSelectChange={handleUnloadSelectChange}
          unloadList={unloadList}
          dataSource={dataSource}
          handleTableCheckboxChange={handleTableCheckboxChange}
          formData={formData}
          handleCheckBoxChange={handleCheckBoxChange}
          handleUnloadPathChange={handleUnloadPathChange}
        />
        <LoadOptionsSection
          formData={formData}
          handleCheckBoxChange={handleCheckBoxChange}
          handleValueChange={handleValueChange}
        />
      </div>
    </Modal>
  );
}
