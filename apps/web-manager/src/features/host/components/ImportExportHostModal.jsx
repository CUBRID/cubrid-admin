import { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import {
  closeImportExportModal,
  addHost,
  createHostGroup,
  deleteHostGroup,
  editHost,
  loginHostsBatch,
  setSkipAutoHostLogin,
} from '../hostSlice';
import { showStatusModal } from '../../layout/layoutSlice';
import {
  exportHostsToXml,
  exportHostGroupsToNativeXml,
  exportHostGroupsToJson,
  parseHostsImportFile,
  buildImportPreviewList,
  validateSelectedImportRows,
} from '../hostImportExport';
import { flattenHostsFromGroups, findNewGroupId } from '../hostGroupUtils';
import { store } from '../../../app/store';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Table } from '../../../components/ds/layout/Table';
import { Badge } from '../../../components/ds/foundation/Badge';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { FileUpload } from '../../../components/ds/forms/FileUpload';
import { Typography } from '../../../components/ds/foundation/Typography';
import { Checkbox } from '../../../components/ds/forms/Checkbox';

import { useCM } from '../../../constants/useCM';

export default function ImportExportHostModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isImportExportModalOpen, importExportMode, hosts, hostGroups } = useSelector((state) => state.host, shallowEqual);
  const [selectedHosts, setSelectedHosts] = useState([]);
  const [importList, setImportList] = useState([]);
  const [pendingPasswordHosts, setPendingPasswordHosts] = useState([]);
  const [passwordDrafts, setPasswordDrafts] = useState({});
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState('export_servers');
  const [exportFormat, setExportFormat] = useState('nativeXml');
  const [importGroupName, setImportGroupName] = useState('Imported');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isImportExportModalOpen) {
      if (importExportMode === 'export') {
        // Row selection (select-all + per-row checkboxes) is keyed by
        // rowId/isSelectable everywhere in this modal — those only exist on
        // parsed import preview rows, so export-mode hosts need the same
        // fields or every checkbox renders permanently disabled.
        const exportRows = hosts.map(h => ({ ...h, rowId: h.uid, isSelectable: true }));
        setImportList(exportRows);
        setSelectedHosts(exportRows.map(h => h.rowId));
      } else {
        setImportList([]);
        setSelectedHosts([]);
        setPendingPasswordHosts([]);
        setPasswordDrafts({});
        setShowPasswordPrompt(false);
        setImportGroupName('Imported');
      }
    }
  }, [isImportExportModalOpen, importExportMode, hosts]);

  if (!isImportExportModalOpen) return null;

  const handleToggleHost = (uid) => {
    setSelectedHosts(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleToggleAll = () => {
    const selectable = importList.filter(h => h.isSelectable);
    if (selectedHosts.length === selectable.length) {
      setSelectedHosts([]);
    } else {
      setSelectedHosts(selectable.map(h => h.rowId));
    }
  };

  const deriveImportGroupName = (filename) => {
    const base = String(filename || '')
      .replace(/\.(xml|prefs|properties|txt)$/i, '')
      .trim();
    return base || 'Imported';
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = parseHostsImportFile(event.target.result);
        if (!parsed.groups?.length) {
          setImportGroupName(deriveImportGroupName(file.name));
        }
        const listWithStatus = buildImportPreviewList(parsed, hosts);

        setImportList(listWithStatus);
        setSelectedHosts(listWithStatus.filter(h => h.isSelectable).map(h => h.rowId));
      } catch (err) {
        dispatch(showStatusModal({
          type: 'error',
          title: CM.importErrorTitle,
          message: err.message || CM.importParseErrorMsg,
        }));
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const rollbackImportGroups = async (groupIds) => {
    for (const groupId of [...groupIds].reverse()) {
      if (!groupId) continue;
      await dispatch(deleteHostGroup(groupId)).unwrap().catch(() => {});
    }
  };

  const createImportGroup = async (name) => {
    const previousGroups = store.getState().host.hostGroups;
    const groupsAfterCreate = await dispatch(createHostGroup({ name })).unwrap();
    const groupId = findNewGroupId(previousGroups, groupsAfterCreate);
    if (!groupId) {
      throw new Error(CM.failedToCreateImportGroupMsg(name));
    }
    return groupId;
  };

  const addImportedHost = async (hostData, groupId) => {
    const hostGroups = await dispatch(addHost({
      alias: hostData.alias,
      address: hostData.address,
      id: hostData.id,
      password: '',
      port: hostData.portNumber,
      groupId,
    })).unwrap();

    const addedHosts = flattenHostsFromGroups(hostGroups);
    return addedHosts.find((h) =>
      h.address === hostData.address &&
      h.port === hostData.portNumber &&
      h.id === hostData.id
    ) ?? null;
  };

  const handleAction = async () => {
    if (selectedHosts.length === 0) return;

    setIsProcessing(true);
    try {
      if (importExportMode === 'export') {
        const baseName = fileName || 'export_servers';
        if (exportFormat === 'caXml') {
          const hostsToExport = hosts.filter(h => selectedHosts.includes(h.uid));
          exportHostsToXml(hostsToExport, `${baseName}.xml`);
        } else if (exportFormat === 'nativeJson') {
          exportHostGroupsToJson(hostGroups, selectedHosts, `${baseName}.json`);
        } else {
          exportHostGroupsToNativeXml(hostGroups, selectedHosts, `${baseName}.xml`);
        }
        dispatch(closeImportExportModal());
      } else {
        const hostsToImport = importList.filter((h) => selectedHosts.includes(h.rowId));
        const hostsToAdd = hostsToImport.filter((row) => row.isSelectable);

        const preflight = validateSelectedImportRows(hostsToAdd);
        if (!preflight.ok) {
          dispatch(showStatusModal({
            type: 'error',
            title: CM.importValidationFailedTitle,
            message: preflight.messages.join('\n'),
          }));
          return;
        }

        if (hostsToAdd.length === 0) {
          dispatch(showStatusModal({
            type: 'info',
            title: CM.importResultTitle,
            message: CM.importNoValidHostsMsg,
          }));
          return;
        }

        const skippedCount = hostsToImport.length - hostsToAdd.length;
        const importedWithoutPassword = [];
        const createdGroupIds = [];
        const importedGroupNames = [];

        const hostsByGroup = new Map();
        const unassignedHosts = [];
        for (const hostData of hostsToAdd) {
          const groupName = hostData.importGroupName?.trim();
          if (groupName) {
            if (!hostsByGroup.has(groupName)) hostsByGroup.set(groupName, []);
            hostsByGroup.get(groupName).push(hostData);
          } else {
            unassignedHosts.push(hostData);
          }
        }

        try {
          dispatch(setSkipAutoHostLogin(true));

          for (const [groupName, rows] of hostsByGroup) {
            const groupId = await createImportGroup(groupName);
            createdGroupIds.push(groupId);
            importedGroupNames.push(groupName);

            for (const hostData of rows) {
              const addedHost = await addImportedHost(hostData, groupId);
              if (addedHost) importedWithoutPassword.push(addedHost);
            }
          }

          if (unassignedHosts.length > 0) {
            const fallbackName = importGroupName.trim() || 'Imported';
            const groupId = await createImportGroup(fallbackName);
            createdGroupIds.push(groupId);
            importedGroupNames.push(fallbackName);

            for (const hostData of unassignedHosts) {
              const addedHost = await addImportedHost(hostData, groupId);
              if (addedHost) importedWithoutPassword.push(addedHost);
            }
          }

          const addedCount = hostsToAdd.length;
          const groupSummary = importedGroupNames.length > 0
            ? importedGroupNames.map((name) => `"${name}"`).join(', ')
            : '"Imported"';

          if (importedWithoutPassword.length > 0) {
            const draft = {};
            importedWithoutPassword.forEach((host) => { draft[host.uid] = ''; });
            setPasswordDrafts(draft);
            setPendingPasswordHosts(importedWithoutPassword);
            setShowPasswordPrompt(true);
          } else {
            dispatch(showStatusModal({
              type: 'success',
              title: CM.importResultTitle,
              message: CM.importSummaryMsg(addedCount, groupSummary, skippedCount),
            }));
            dispatch(closeImportExportModal());
          }
        } catch (err) {
          await rollbackImportGroups(createdGroupIds);
          dispatch(showStatusModal({
            type: 'error',
            title: CM.importFailedTitle,
            message: err?.message || CM.importRolledBackMsg,
          }));
        } finally {
          dispatch(setSkipAutoHostLogin(false));
        }
      }
    } catch (err) {
      dispatch(showStatusModal({
        type: 'error',
        title: CM.importErrorTitle,
        message: err?.message || CM.importFailedMsg,
      }));
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePasswordDraftChange = (uid, value) => {
    setPasswordDrafts((prev) => ({ ...prev, [uid]: value }));
  };

  const handleApplyImportedPasswords = async () => {
    if (pendingPasswordHosts.length === 0) {
      dispatch(closeImportExportModal());
      return;
    }

    setIsProcessing(true);

    try {
      const passwordSaveFailed = [];
      let updatedCount = 0;

      for (const host of pendingPasswordHosts) {
        const password = passwordDrafts[host.uid] ?? '';
        if (password === '') continue;

        const payload = {
          id: host.id,
          address: host.address,
          port: Number(host.port),
          alias: host.alias,
          password,
        };

        try {
          await dispatch(editHost({ hostUid: host.uid, payload })).unwrap();
          updatedCount += 1;
        } catch {
          passwordSaveFailed.push(host.alias || host.id || host.uid);
        }
      }

      const messageParts = [];
      if (updatedCount > 0) {
        messageParts.push(CM.passwordSavedMsg(updatedCount));
      }
      if (passwordSaveFailed.length > 0) {
        messageParts.push(CM.passwordNotSavedMsg(passwordSaveFailed.join(', ')));
      }
      if (messageParts.length === 0) {
        messageParts.push(CM.noPasswordsEnteredMsg);
      }

      let statusType = 'success';
      if (updatedCount === 0) {
        statusType = passwordSaveFailed.length > 0 ? 'error' : 'info';
      } else if (passwordSaveFailed.length > 0) {
        statusType = 'info';
      }

      dispatch(showStatusModal({
        type: statusType,
        title: CM.importResultTitle,
        message: messageParts.join(' '),
      }));
      dispatch(closeImportExportModal());
    } finally {
      setIsProcessing(false);
      setPendingPasswordHosts([]);
      setPasswordDrafts({});
    }
  };

  const handleLoginAllImported = async () => {
    const hostsWithPassword = pendingPasswordHosts.filter(
      (host) => (passwordDrafts[host.uid] ?? '') !== ''
    );
    if (hostsWithPassword.length === 0) return;

    setIsProcessing(true);
    dispatch(setSkipAutoHostLogin(true));

    try {
      const savedUids = [];
      const passwordSaveFailed = [];

      for (const host of hostsWithPassword) {
        const password = passwordDrafts[host.uid] ?? '';
        const payload = {
          id: host.id,
          address: host.address,
          port: Number(host.port),
          alias: host.alias,
          password,
        };
        try {
          await dispatch(editHost({ hostUid: host.uid, payload })).unwrap();
          savedUids.push(host.uid);
        } catch {
          passwordSaveFailed.push(host.alias || host.id || host.uid);
        }
      }

      let successCount = 0;
      let loginFailed = [];
      if (savedUids.length > 0) {
        const loginResult = await dispatch(loginHostsBatch(savedUids)).unwrap();
        successCount = loginResult.successCount;
        loginFailed = loginResult.failed;
      }

      const messageParts = [];
      if (savedUids.length > 0) {
        messageParts.push(CM.passwordSavedCountMsg(savedUids.length));
      }
      if (passwordSaveFailed.length > 0) {
        messageParts.push(CM.passwordNotSavedMsg(passwordSaveFailed.join(', ')));
      }
      if (savedUids.length > 0) {
        messageParts.push(CM.connectedHostsMsg(successCount));
        if (loginFailed.length > 0) {
          messageParts.push(CM.loginFailedListMsg(loginFailed.join(', ')));
        }
      }

      const hasSaveFailures = passwordSaveFailed.length > 0;
      const hasLoginFailures = loginFailed.length > 0;
      let statusType = 'success';
      if (savedUids.length === 0) {
        statusType = 'error';
      } else if (hasSaveFailures || (hasLoginFailures && successCount === 0)) {
        statusType = 'error';
      } else if (hasLoginFailures) {
        statusType = 'info';
      }

      dispatch(showStatusModal({
        type: statusType,
        title: CM.loginAll,
        message: messageParts.join(' '),
      }));
      dispatch(closeImportExportModal());
    } catch {
      dispatch(showStatusModal({
        type: 'error',
        title: CM.loginAll,
        message: CM.loginImportedFailedMsg,
      }));
    } finally {
      dispatch(setSkipAutoHostLogin(false));
      setIsProcessing(false);
      setPendingPasswordHosts([]);
      setPasswordDrafts({});
    }
  };

  const isPasswordPromptStep = showPasswordPrompt && pendingPasswordHosts.length > 0;
  const isPasswordStep = !showPasswordPrompt && importExportMode === 'import' && pendingPasswordHosts.length > 0;
  const hasPasswordDrafts = pendingPasswordHosts.some(
    (host) => (passwordDrafts[host.uid] ?? '') !== ''
  );
  const title = isPasswordPromptStep
    ? CM.importCompleteTitle
    : isPasswordStep
    ? CM.setPasswordsForImportedTitle
    : (importExportMode === 'export' ? CM.exportHosts : CM.importHosts);
  const actionLabel = isPasswordStep
    ? CM.applyPasswordsBtn
    : (importExportMode === 'export' ? CM.exportHost : CM.importHost);
  const icon = importExportMode === 'export' ? 'file_upload' : 'file_download';

  const selectable = importList.filter(h => h.isSelectable);
  const isAllSelected = selectable.length > 0 && selectedHosts.length === selectable.length;
  const isSomeSelected = selectedHosts.length > 0 && selectedHosts.length < selectable.length;
  const hasValidationErrors = importList.some((h) => h.validationError && !h.isDuplicate);
  const fileHasPrefsGroups = importList.some((row) => row.hasPrefsGroups);

  // Mirrors the footer's primary button, which switches target handler by
  // step. The password-prompt confirmation step and the initial file-picker
  // step have no text inputs, so Enter there never reaches this handler.
  const handleFormSubmit = isPasswordStep ? handleApplyImportedPasswords : handleAction;

  return (
    <Modal
      isOpen={isImportExportModalOpen}
      onClose={() => dispatch(closeImportExportModal())}
      title={title}
      icon={icon}
      loading={isProcessing}
      maxWidth="max-w-[720px]"
      testId="import-export-host"
      onSubmit={handleFormSubmit}
      subtitle={isPasswordPromptStep
        ? CM.pendingPasswordsSubtitle(pendingPasswordHosts.length)
        : isPasswordStep
        ? CM.pendingPasswordsDesc
        : importExportMode === 'export'
        ? CM.exportHostsDesc
        : CM.importHostsDesc}
      footer={
        <div className="flex justify-between items-center w-full">
          <div className="flex items-center gap-4">
            {importExportMode === 'import' && importList.length > 0 && !isPasswordStep && (
              <Button
                variant="ghost"
                size="sm"
                icon="change_circle"
                onClick={() => { setImportList([]); setSelectedHosts([]); }}
              >
                {CM.changeFileBtn}
              </Button>
            )}
            {importExportMode === 'export' && !isPasswordStep && (
              <div className="flex items-center gap-2">
                <Typography variant="caption" className="font-bold text-slate-400 uppercase tracking-tight">{CM.exportFormatLabel}</Typography>
                <div className="w-44">
                  <Select
                    size="sm"
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value)}
                    options={[
                      { value: 'nativeXml', label: CM.formatNativeXml },
                      { value: 'nativeJson', label: CM.formatNativeJson },
                      { value: 'caXml', label: CM.formatCaXml },
                    ]}
                  />
                </div>
                <Typography variant="caption" className="font-bold text-slate-400 uppercase tracking-tight">{CM.filenameLabel}</Typography>
                <div className="w-48">
                  <Input
                    size="sm"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder={CM.exportFilenamePlaceholder}
                    suffix={exportFormat === 'nativeJson' ? '.JSON' : '.XML'}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            {isPasswordPromptStep ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPendingPasswordHosts([]);
                    setPasswordDrafts({});
                    setShowPasswordPrompt(false);
                    dispatch(showStatusModal({
                      type: 'success',
                      title: CM.importResultTitle,
                      message: CM.importedSetPasswordsLaterMsg(pendingPasswordHosts.length),
                    }));
                    dispatch(closeImportExportModal());
                  }}
                  disabled={isProcessing}
                >
                  {CM.no}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setShowPasswordPrompt(false)}
                  icon="lock"
                >
                  {CM.addPasswordsBtn}
                </Button>
              </>
            ) : (
            <>
            <Button
              data-testid="import-export-host-cancel-btn"
              variant="secondary"
              onClick={() => {
                if (isPasswordStep) {
                  dispatch(showStatusModal({
                    type: 'info',
                    title: CM.importResultTitle,
                    message: CM.passwordsSkippedMsg,
                  }));
                }
                dispatch(closeImportExportModal());
                setPendingPasswordHosts([]);
                setPasswordDrafts({});
              }}
              disabled={isProcessing}
            >
              {isPasswordStep ? CM.skip : CM.cancel}
            </Button>
            {isPasswordStep && (
              <Button
                variant="secondary"
                onClick={handleLoginAllImported}
                disabled={isProcessing || !hasPasswordDrafts}
                loading={isProcessing}
                icon="login"
              >
                {CM.loginAll}
              </Button>
            )}
            <Button
              data-testid="import-export-host-action-btn"
              variant="primary"
              onClick={isPasswordStep ? handleApplyImportedPasswords : handleAction}
              disabled={isPasswordStep ? isProcessing : (selectedHosts.length === 0 || isProcessing)}
              loading={isProcessing}
              icon={icon === 'file_upload' ? 'bolt' : icon}
              className="min-w-[120px]"
            >
              {actionLabel}
            </Button>
            </>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-[500px]">
        {isPasswordPromptStep ? (
          <div className="flex flex-col items-center justify-center flex-1 px-8 py-6 gap-5 text-center">
            <div className="space-y-1.5">
              <p className="text-16 font-bold text-slate-800 dark:text-slate-100">
                {CM.addPasswordsConfirmTitle}
              </p>
              <p className="text-14 text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                {CM.addPasswordsConfirmDesc}
              </p>
            </div>
            <div className="w-full max-w-xs divide-y divide-slate-100 dark:divide-white/5 border border-slate-200 dark:border-white/8 rounded-xl overflow-hidden">
              {pendingPasswordHosts.map((host) => (
                <div key={host.uid} className="px-4 py-2.5 flex items-center gap-3 bg-white dark:bg-white/2">
                  <div className="min-w-0 text-left">
                    <p className="text-14 font-semibold text-slate-700 dark:text-slate-200 truncate">{host.alias || host.id}</p>
                    <p className="text-12 text-slate-400 font-mono truncate">{host.address}:{host.port}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : isPasswordStep ? (
          <div className="px-4 py-3 space-y-3 overflow-auto">
            {pendingPasswordHosts.map((host) => (
              <div key={host.uid} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="text-xs font-semibold mb-2">
                  {host.alias || host.id} ({host.address}:{host.port})
                </div>
                <Input
                  type="password"
                  size="sm"
                  placeholder={CM.hostPasswordPlaceholder}
                  value={passwordDrafts[host.uid] || ''}
                  onChange={(e) => handlePasswordDraftChange(host.uid, e.target.value)}
                />
              </div>
            ))}
          </div>
        ) : importExportMode === 'import' && importList.length === 0 ? (
            <div className="p-8">
              <FileUpload
                label={CM.importHostsXml}
                accept=".xml,.json,.prefs,.properties,.txt"
                onFileSelect={(file) => {
                  const event = { target: { files: [file] } };
                  handleFileChange(event);
                }}
              />
              <Typography variant="p" className="text-slate-500 mt-4 text-center text-13 max-w-[320px] mx-auto">
                {CM.importFormatHelp}
              </Typography>
            </div>
        ) : (
          <>
            <div className="px-4 py-2 bg-slate-50/50 dark:bg-bk-main/20 flex flex-col gap-2 border-b border-slate-100 dark:border-slate-800">
              {importExportMode === 'import' && (
                fileHasPrefsGroups ? (
                  <Typography variant="caption" className="text-slate-500 text-12">
                    {CM.importGroupsHelp}
                  </Typography>
                ) : (
                  <div className="flex items-center gap-2">
                    <Typography variant="caption" className="font-bold text-slate-400 uppercase tracking-tight shrink-0">
                      {CM.groupLabel}
                    </Typography>
                    <div className="flex-1 max-w-xs">
                      <Input
                        size="sm"
                        value={importGroupName}
                        onChange={(e) => setImportGroupName(e.target.value)}
                        placeholder={CM.importedPlaceholder}
                      />
                    </div>
                    <Typography variant="caption" className="text-slate-400 text-12">
                      {CM.allHostsIntoGroupHelp}
                    </Typography>
                  </div>
                )
              )}
              {importExportMode === 'import' && fileHasPrefsGroups && (
                <div className="flex items-center gap-2">
                  <Typography variant="caption" className="font-bold text-slate-400 uppercase tracking-tight shrink-0">
                    {CM.fallbackGroupLabel}
                  </Typography>
                  <div className="flex-1 max-w-xs">
                    <Input
                      size="sm"
                      value={importGroupName}
                      onChange={(e) => setImportGroupName(e.target.value)}
                      placeholder={CM.importedPlaceholder}
                    />
                  </div>
                </div>
              )}
              {hasValidationErrors && (
                <Typography variant="caption" className="text-amber-600 dark:text-amber-400 text-12">
                  {CM.validationErrorRowsHelp}
                </Typography>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={isAllSelected}
                    indeterminate={isSomeSelected}
                    onChange={handleToggleAll}
                    disabled={selectable.length === 0}
                    label={CM.selectAll}
                    className="text-12! font-bold tracking-wider text-slate-500"
                  />
                </div>
                <Badge variant="yellow" size="sm">
                  {CM.selectedCountLabel(selectedHosts.length)}
                </Badge>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
               <Table
                  className="h-full"
                   columns={[
                    {
                      accessor: 'select',
                      header: '',
                      width: '48px',
                      render: (_, host) => {
                        const rowId = host.rowId;
                        const isSelected = selectedHosts.includes(rowId);
                        return (
                          <div
                            className="flex justify-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={isSelected}
                              onChange={() => host.isSelectable && handleToggleHost(rowId)}
                              disabled={!host.isSelectable}
                            />
                          </div>
                        );
                      }
                    },
                    {
                      accessor: 'alias',
                      header: CM.name,
                      render: (alias, host) => (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Typography variant="caption" className={`font-bold ${host.isSelectable ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>
                              {alias || CM.unnamedFallback}
                            </Typography>
                            {host.isDuplicate && (
                              <Badge variant="secondary" size="xs">{CM.duplicateLabel}</Badge>
                            )}
                            {host.validationError && !host.isDuplicate && (
                              <Badge variant="secondary" size="xs">{CM.invalidLabel}</Badge>
                            )}
                          </div>
                          {host.validationError && (
                            <Typography variant="caption" className="text-12 text-amber-600 dark:text-amber-400">
                              {host.validationError}
                            </Typography>
                          )}
                        </div>
                      )
                    },
                    { accessor: 'address', header: CM.address },
                    { accessor: 'port', header: CM.port },
                    ...(fileHasPrefsGroups ? [{
                      accessor: 'importGroupName',
                      header: CM.groupLabel,
                      render: (groupName) => (
                        <Typography variant="caption" className="text-slate-600 dark:text-slate-300">
                          {groupName || '—'}
                        </Typography>
                      ),
                    }] : []),
                  ]}
                  data={importList}
                  onRowClick={(host) => {
                    if (host.isSelectable) handleToggleHost(host.rowId);
                  }}
                  rowClassName={(host) => {
                    const isSelected = selectedHosts.includes(host.rowId);
                    return `
                      ${isSelected ? 'bg-bk-yellow/3' : ''}
                      ${host.isSelectable ? 'cursor-pointer' : 'opacity-60 grayscale-[0.35]'}
                    `;
                  }}
               />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
