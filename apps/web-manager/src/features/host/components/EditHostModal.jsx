import { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { editHost, moveHost, fetchHosts, loginToHostWithSideEffects, closeEditHostModal, clearHostError, setSelectedHost, fetchHostEnv } from '../hostSlice';
import { fetchDatabaseStartInfo } from '../../database/databaseSlice';
import { fetchBrokerList } from '../../broker/brokerSlice';
import { setActiveMainTab } from '../../layout/layoutSlice';
import { hostApi } from '../hostApi';
import { connectedHostWithSameServer } from '../connectionTestGuard';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import PasswordChangeLink from './PasswordChangeLink';
import { Select } from '../../../components/ds/forms/Select';
import { Icon } from '../../../components/ds/foundation/Icon';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { findGroupIdForHost, orderedGroupEntries, UNGROUPED_GROUP_ID, MAX_HOST_ALIAS_LENGTH } from '../hostGroupUtils';
import { useCM } from '../../../constants/useCM';

export default function EditHostModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isEditHostModalOpen, hostToEditUid, editHostPasswordRejected, hosts, hostGroups, loading, error: apiError, authorizedHosts } = useSelector((state) => state.host, shallowEqual);
  // Opened from an HA follow-up of a bulk-login result dialog, which stays
  // open (z-[2100]) underneath — stack above it like the HA modals do.
  const aboveStatusModal = useSelector((state) => state.layout.statusModal.isOpen);
  // A failure that mentions the password is shown under the password field.
  const isCredentialError = !!apiError && String(apiError).toLowerCase().includes(CM.password.toLowerCase());

  const [formData, setFormData] = useState({
    id: '',
    address: '',
    port: '8001',
    password: '',
    alias: '',
    groupId: UNGROUPED_GROUP_ID,
  });
  const [errors, setErrors] = useState({});
  // The stored password is kept unless the user asks to change it; then an
  // empty field means an empty password.
  const [changePassword, setChangePassword] = useState(false);
  // Test Connection's outcome: null, { testing }, { ok }, or { error }.
  const [connectionTest, setConnectionTest] = useState(null);
  const passwordInputRef = useRef(null);

  const groupOptions = useMemo(() => orderedGroupEntries(hostGroups).map(([groupId, group]) => ({
    value: groupId,
    label: groupId === UNGROUPED_GROUP_ID ? CM.noGroupOption : group.name,
  })), [hostGroups, CM]);

  useEffect(() => {
    // Only re-populate when the modal opens (or targets a different host) —
    // NOT whenever `hosts` changes. A background hosts refresh while this
    // modal is open must not silently overwrite in-progress edits.
    if (isEditHostModalOpen && hostToEditUid) {
      const hostToEdit = hosts.find((h) => h.uid === hostToEditUid);
      if (hostToEdit) {
        setFormData({
          id: hostToEdit.id || '',
          address: hostToEdit.address || '',
          port: hostToEdit.port ? String(hostToEdit.port) : '8001',
          password: '',
          alias: hostToEdit.alias || '',
          groupId: findGroupIdForHost(hostGroups, hostToEditUid) || UNGROUPED_GROUP_ID,
        });
      }
      setErrors({});
      // No saved password (a host imported from a file), or opened for a
      // turned-down one: the field is open.
      setChangePassword(hostToEdit?.hasPassword === false || Boolean(editHostPasswordRejected));
      setConnectionTest(null);
    }
  }, [isEditHostModalOpen, hostToEditUid]);

  // Opened for a turned-down password: put the cursor in the password field
  // once it is enabled, after Modal's own first-field focus (next frame).
  useEffect(() => {
    if (!isEditHostModalOpen || !editHostPasswordRejected || !changePassword) return undefined;
    const frame = requestAnimationFrame(() => passwordInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isEditHostModalOpen, hostToEditUid, editHostPasswordRejected, changePassword]);

  if (!isEditHostModalOpen) return null;

  // Older servers do not say; then the host is taken to have a password.
  const hasSavedPassword = hosts.find((h) => h.uid === hostToEditUid)?.hasPassword !== false;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    if (apiError) dispatch(clearHostError());
    setConnectionTest(null);
  };

  const validate = () => {
    const errs = {};
    const trimmedAlias = formData.alias.trim();
    if (!trimmedAlias) {
      errs.alias = CM.hostNameRequired;
    } else if (trimmedAlias.length > MAX_HOST_ALIAS_LENGTH) {
      errs.alias = CM.hostNameTooLong(MAX_HOST_ALIAS_LENGTH);
    } else if (hosts.some((h) => h.uid !== hostToEditUid && h.alias?.trim() === trimmedAlias)) {
      errs.alias = CM.hostNameDuplicate;
    }
    if (!formData.address.trim()) errs.address = CM.addressRequired;
    if (!formData.port.trim()) errs.port = CM.portRequired;
    if (!formData.id.trim()) errs.id = CM.usernameRequired;
    return errs;
  };

  const buildPayload = () => {
    const payload = {
      id: formData.id,
      address: formData.address,
      port: Number(formData.port),
      alias: formData.alias,
    };
    if (changePassword) {
      payload.password = formData.password;
    }
    return payload;
  };

  // A login with these settings ends a connected host's session where CMS
  // keeps one session per account, so the test is only for a host that is
  // not connected.
  const isConnected = (authorizedHosts ?? []).includes(hostToEditUid);
  // Another connected host with the address, port and CMS user typed here.
  const sameServerConnected = Boolean(connectedHostWithSameServer(hosts, authorizedHosts, formData));
  const testBlockedHint = isConnected
    ? CM.testConnectionConnectedHint
    : sameServerConnected ? CM.testConnectionSameServerConnectedHint : undefined;

  // Logs in to CMS with these settings (the stored password unless it is
  // being changed) and out again, saving nothing.
  const handleTestConnection = async () => {
    const connectionFields = ['address', 'port', 'id'];
    const errs = Object.fromEntries(Object.entries(validate()).filter(([field]) => connectionFields.includes(field)));
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    const { alias: _alias, ...changes } = buildPayload();
    setConnectionTest({ testing: true });
    try {
      await hostApi.testSavedHostConnection(hostToEditUid, changes);
      setConnectionTest({ ok: true });
    } catch (err) {
      setConnectionTest({ error: err?.response?.data?.message || err?.message || CM.hostLoginFailedMsg });
    }
  };

  // Resolves to whether the host was moved (the move's answer carries the
  // whole host list).
  const moveToChosenGroup = async (targetUid) => {
    const currentGroupId = findGroupIdForHost(hostGroups, targetUid) || UNGROUPED_GROUP_ID;
    if (formData.groupId === currentGroupId) return false;
    await dispatch(moveHost({ hostUid: targetUid, targetGroupId: formData.groupId })).unwrap();
    return true;
  };

  const persistHostChanges = async (targetUid) => {
    await dispatch(editHost({ hostUid: targetUid, payload: buildPayload() })).unwrap();
    await moveToChosenGroup(targetUid);
  };

  // Save only — persists changes without attempting a CMS login.
  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    try {
      await persistHostChanges(hostToEditUid);
      dispatch(closeEditHostModal());
      dispatch(clearHostError());
    } catch {
      // Edit failed: modal stays open, error shown via state.host.error
    }
  };

  // Log in with the changed settings; the server saves them only if that
  // login succeeds, so a failed attempt (a wrong port or password, a CMS that
  // does not answer) leaves the stored settings as they were. On failure the
  // modal stays open (loginToHost.rejected populates state.host.error) so the
  // user can see why and correct the settings here.
  const handleTestConnectionAndSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const targetUid = hostToEditUid;

    try {
      await dispatch(loginToHostWithSideEffects({ hostUid: targetUid, changes: buildPayload() })).unwrap();
    } catch {
      return; // Login failed: nothing saved, modal stays open, error shown via state.host.error
    }

    try {
      // The login saved the settings; show them in the host list.
      if (!(await moveToChosenGroup(targetUid))) dispatch(fetchHosts());
    } catch {
      return; // Move failed: modal stays open, error shown via state.host.error
    }

    dispatch(closeEditHostModal());
    dispatch(clearHostError());
    dispatch(setSelectedHost(targetUid));
    dispatch(setActiveMainTab(`host:${targetUid}`));
    dispatch(fetchDatabaseStartInfo(targetUid));
    dispatch(fetchBrokerList(targetUid));
    dispatch(fetchHostEnv(targetUid));
  };

  const handleClose = () => {
    dispatch(closeEditHostModal());
    dispatch(clearHostError());
  };

  return (
    <Modal
      isOpen={isEditHostModalOpen}
      onClose={handleClose}
      zIndexClass={aboveStatusModal ? 'z-[2200]' : undefined}
      onSubmit={handleSave}
      submitDisabled={loading}
      title={CM.modifyHost}
      icon="settings_input_component"
      loading={loading}
      maxWidth="max-w-[580px]"
      testId="edit-host"
      footer={
        // Wraps instead of clipping when the window is narrow.
        <div className="flex flex-wrap justify-end gap-3 w-full">
          <Button data-testid="edit-host-cancel-btn" variant="secondary" onClick={handleClose} disabled={loading}>
            {CM.cancel}
          </Button>
          <Button
            data-testid="edit-host-save-btn"
            variant="secondary"
            onClick={handleSave}
            loading={loading}
            icon="save_as"
            className="min-w-[100px]"
          >
            {CM.saveChanges}
          </Button>
          <Button
            data-testid="edit-host-connect-save-btn"
            variant="primary"
            onClick={handleTestConnectionAndSave}
            loading={loading}
            icon="bolt"
            className="min-w-[170px]"
          >
            {CM.testConnectionAndSave}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-1">

        {/* API Error Banner — credential failures show inline under the
            password field instead (see Section 3) for consistency with
            client-side validation errors. */}
        {apiError && !isCredentialError && (
          <div className="flex items-start gap-3 px-4 py-3 bg-rose-500/5 border border-rose-500/15 rounded-xl">
            <Icon name="error_outline" size="sm" weight={300} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-13 text-rose-500 font-medium flex-1 leading-relaxed">{apiError}</p>
            <button
              onClick={() => dispatch(clearHostError())}
              className="text-rose-400 hover:text-rose-600 transition-colors shrink-0"
            >
              <Icon name="close" size="17px" weight={300} />
            </button>
          </div>
        )}

        {/* Section 1: Identity */}
        <SectionHeader title={CM.identity} icon="badge" />
        <div className="px-1 space-y-4">
          <Input
            label={CM.friendlyName}
            name="alias"
            value={formData.alias}
            onChange={handleChange}
            error={errors.alias}
            placeholder={CM.friendlyNamePlaceholder}
            icon="label"
            maxLength={MAX_HOST_ALIAS_LENGTH}
            disabled={loading}
            required
          />
          <Select
            label={CM.groupLabel}
            value={formData.groupId}
            onChange={(e) => handleChange({ target: { name: 'groupId', value: e.target.value } })}
            options={groupOptions}
            icon="folder"
            disabled={loading}
          />
        </div>

        {/* Section 2: Host Connection */}
        <SectionHeader
          title={CM.host}
          icon="lan"
          className="mt-8"
        />
        <div className="px-1">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-3">
              <Input
                label={CM.ipAddressDomain}
                name="address"
                value={formData.address}
                onChange={handleChange}
                error={errors.address}
                placeholder={CM.hostAddressPlaceholder}
                icon="dns"
                disabled={loading}
                required
              />
            </div>
            <div className="sm:col-span-1">
              <Input
                label={CM.port}
                name="port"
                type="number"
                value={formData.port}
                onChange={handleChange}
                error={errors.port}
                placeholder={CM.hostPortPlaceholder}
                disabled={loading}
                required
              />
            </div>
          </div>
        </div>

        {/* Section 3: Credentials */}
        <SectionHeader title={CM.credentials} icon="lock" className="mt-8" />
        <div className="px-1 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={CM.username}
              name="id"
              value={formData.id}
              onChange={handleChange}
              error={errors.id}
              placeholder={CM.hostUsernamePlaceholder}
              icon="person"
              disabled={loading}
              required
            />
            <Input
              ref={passwordInputRef}
              label={CM.password}
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              error={errors.password || (isCredentialError ? apiError : undefined)}
              icon="key"
              disabled={loading || !changePassword}
              labelAction={hasSavedPassword ? (
                <PasswordChangeLink
                  testId="edit-host-change-password-toggle"
                  active={changePassword}
                  onChange={(on) => { setChangePassword(on); setConnectionTest(null); }}
                  disabled={loading}
                />
              ) : null}
            />
          </div>
        </div>

        {/* Tests the connection fields above, so it sits under them. */}
        <div className="px-1 space-y-3">
          <div className="flex justify-end">
            {/* A disabled button gets no hover, so the reason hangs off this wrapper. */}
            <span title={testBlockedHint}>
              <Button
                data-testid="edit-host-test-connection-btn"
                variant="secondary"
                onClick={handleTestConnection}
                loading={!!connectionTest?.testing}
                disabled={loading || Boolean(testBlockedHint)}
                icon="network_check"
                className={testBlockedHint ? 'pointer-events-none' : ''}
              >
                {CM.testConnection}
              </Button>
            </span>
          </div>
          {connectionTest && !connectionTest.testing && (
            <div
              data-testid="edit-host-test-result"
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${connectionTest.ok
                ? 'bg-emerald-500/5 border-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/5 border-rose-500/15 text-rose-500'}`}
            >
              <Icon name={connectionTest.ok ? 'check_circle' : 'error_outline'} size="sm" weight={300} className="shrink-0 mt-0.5" />
              <p className="text-13 font-medium flex-1 min-w-0 break-words leading-relaxed">
                {connectionTest.ok ? CM.connectionTestSucceededMsg : CM.connectionTestFailedMsg(connectionTest.error)}
              </p>
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
}
