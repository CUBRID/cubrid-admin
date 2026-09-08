import { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { editHost, loginToHostWithSideEffects, closeEditHostModal, clearHostError, setSelectedHost, fetchHostEnv } from '../hostSlice';
import { fetchDatabaseStartInfo } from '../../database/databaseSlice';
import { fetchBrokerList } from '../../broker/brokerSlice';
import { setActiveMainTab } from '../../layout/layoutSlice';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Input } from '../../../components/ds/forms/Input';
import { Icon } from '../../../components/ds/foundation/Icon';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { useCM } from '../../../constants/useCM';

export default function EditHostModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isEditHostModalOpen, hostToEditUid, hosts, selectedHostUid, loading, error: apiError } = useSelector((state) => state.host, shallowEqual);
  const isCredentialError = /password/i.test(apiError || '');

  const [formData, setFormData] = useState({
    id: '',
    address: '',
    port: '8001',
    password: '',
    alias: '',
  });
  const [errors, setErrors] = useState({});

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
        });
      }
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditHostModalOpen, hostToEditUid]);

  if (!isEditHostModalOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    if (apiError) dispatch(clearHostError());
  };

  const validate = () => {
    const errs = {};
    const trimmedAlias = formData.alias.trim();
    if (!trimmedAlias) {
      errs.alias = CM.hostNameRequired;
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
    if (formData.password) {
      payload.password = formData.password;
    }
    return payload;
  };

  // Save only — persists changes without attempting a CMS login.
  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    try {
      await dispatch(editHost({ hostUid: hostToEditUid, payload: buildPayload() })).unwrap();
      dispatch(closeEditHostModal());
      dispatch(clearHostError());
    } catch {
      // Edit failed: modal stays open, error shown via state.host.error
    }
  };

  // Save then attempt to actually log in with the given credentials. On
  // failure the modal stays open (loginToHost.rejected populates
  // state.host.error) so the user can see why and correct the password here.
  const handleTestConnectionAndSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const targetUid = hostToEditUid;

    try {
      await dispatch(editHost({ hostUid: targetUid, payload: buildPayload() })).unwrap();
    } catch {
      return; // Edit failed: modal stays open, error shown via state.host.error
    }

    try {
      await dispatch(loginToHostWithSideEffects(targetUid)).unwrap();
      dispatch(closeEditHostModal());
      dispatch(clearHostError());
      dispatch(setSelectedHost(targetUid));
      dispatch(setActiveMainTab(`host:${targetUid}`));
      dispatch(fetchDatabaseStartInfo(targetUid));
      dispatch(fetchBrokerList(targetUid));
      dispatch(fetchHostEnv(targetUid));
    } catch {
      // Login failed: modal stays open, error shown via state.host.error
    }
  };

  const handleClose = () => {
    dispatch(closeEditHostModal());
    dispatch(clearHostError());
  };

  const connectionPreview = formData.address
    ? `${formData.address}:${formData.port || '8001'}`
    : null;

  return (
    <Modal
      isOpen={isEditHostModalOpen}
      onClose={handleClose}
      onSubmit={handleSave}
      title={CM.modifyHost}
      icon="settings_input_component"
      loading={loading}
      maxWidth="max-w-[500px]"
      testId="edit-host"
      footer={
        <>
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
        </>
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
        <div className="px-1">
          <Input
            label={CM.friendlyName}
            name="alias"
            value={formData.alias}
            onChange={handleChange}
            error={errors.alias}
            placeholder={CM.friendlyNamePlaceholder}
            icon="label"
            disabled={loading}
            required
          />
        </div>

        {/* Section 2: Host Connection */}
        <SectionHeader
          title={CM.host}
          icon="lan"
          className="mt-8"
        />
        <div className="px-1">
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-3">
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
            <div className="col-span-1">
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
        <div className="px-1">
          <div className="grid grid-cols-2 gap-3">
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
              label={CM.password}
              labelExtra="(optional)"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              error={errors.password || (isCredentialError ? apiError : undefined)}
              placeholder={CM.leaveBlankToKeep}
              icon="key"
              disabled={loading}
            />
          </div>
        </div>

      </div>
    </Modal>
  );
}
