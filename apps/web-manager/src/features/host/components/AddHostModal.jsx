import { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import {
  addHost,
  clearHostError,
  openDiscoveryModal,
  loginToHostWithSideEffects,
  setSelectedHost,
  fetchHostEnv,
  openEditHostModal,
} from '../hostSlice';
import { fetchDatabaseStartInfo } from '../../database/databaseSlice';
import { fetchBrokerList } from '../../broker/brokerSlice';
import { setActiveMainTab } from '../../layout/layoutSlice';
import { orderedGroupEntries, UNGROUPED_GROUP_ID, findHostUidByConnection, flattenHostsFromGroups } from '../hostGroupUtils';
import { Modal } from '../../../components/ds/layout/Modal';
import { Input } from '../../../components/ds/forms/Input';
import { Select } from '../../../components/ds/forms/Select';
import { Button } from '../../../components/ds/foundation/Button';
import { Icon } from '../../../components/ds/foundation/Icon';
import { SectionHeader } from '../../../components/ds/foundation/SectionHeader';
import { useCM } from '../../../constants/useCM';

export default function AddHostModal({ isOpen, onClose }) {
  const CM = useCM();
  const [formData, setFormData] = useState({
    id: '',
    address: '',
    port: '8001',
    password: '',
    alias: '',
    groupId: '',
  });
  const [errors, setErrors] = useState({});
  const dispatch = useDispatch();
  const { loading, error: apiError, initialHostData, hostGroups } = useSelector((state) => state.host, shallowEqual);

  const groupOptions = useMemo(() => [
    { value: '', label: CM.noGroupOption },
    ...orderedGroupEntries(hostGroups)
      .filter(([groupId]) => groupId !== UNGROUPED_GROUP_ID)
      .map(([groupId, group]) => ({ value: groupId, label: group.name })),
  ], [hostGroups, CM]);

  useEffect(() => {
    if (isOpen) {
      if (initialHostData) {
        setFormData({
          id: initialHostData.id || '',
          address: initialHostData.address || '',
          port: String(initialHostData.port || '8001'),
          password: initialHostData.password || '',
          alias: initialHostData.alias || '',
          groupId: initialHostData.groupId || '',
        });
      } else {
        setFormData({ id: '', address: '', port: '8001', password: '', alias: '', groupId: '' });
      }
      setErrors({});
    }
  }, [isOpen, initialHostData]);

  if (!isOpen) return null;

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
    } else if (flattenHostsFromGroups(hostGroups).some((h) => h.alias?.trim() === trimmedAlias)) {
      errs.alias = CM.hostNameDuplicate;
    }
    if (!formData.address.trim()) errs.address = CM.addressRequired;
    if (!formData.port.trim()) errs.port = CM.portRequired;
    if (!formData.id.trim()) errs.id = CM.usernameRequired;
    if (!formData.password) errs.password = CM.passwordRequired;
    return errs;
  };

  const buildPayload = () => ({
    ...formData,
    port: Number(formData.port),
  });

  // Save only — persists the host without attempting a CMS login.
  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    try {
      await dispatch(addHost(buildPayload())).unwrap();
      if (initialHostData) {
        dispatch(openDiscoveryModal());
      }
    } catch {
      // Error handled by slice
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

    const payload = buildPayload();
    let nextHostGroups;
    try {
      nextHostGroups = await dispatch(addHost(payload)).unwrap();
    } catch {
      return; // Add failed: modal stays open, error shown via state.host.error
    }

    const newHostUid = findHostUidByConnection(nextHostGroups, payload);
    if (!newHostUid) {
      if (initialHostData) dispatch(openDiscoveryModal());
      return;
    }

    try {
      await dispatch(loginToHostWithSideEffects(newHostUid)).unwrap();
      if (initialHostData) {
        dispatch(openDiscoveryModal());
      }
      dispatch(setSelectedHost(newHostUid));
      dispatch(setActiveMainTab(`host:${newHostUid}`));
      dispatch(fetchDatabaseStartInfo(newHostUid));
      dispatch(fetchBrokerList(newHostUid));
      dispatch(fetchHostEnv(newHostUid));
    } catch {
      // addHost.fulfilled already closed this modal — the host is saved,
      // but login failed (e.g. wrong/missing password). Reopen it in Edit
      // mode so the user can fix the credentials right away.
      dispatch(openEditHostModal(newHostUid));
    }
  };

  const handleClose = () => {
    onClose();
    dispatch(clearHostError());
    if (initialHostData) {
      dispatch(openDiscoveryModal());
    }
  };

  const connectionPreview = formData.address
    ? `${formData.address}:${formData.port || '8001'}`
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      onSubmit={handleSave}
      title={CM.newConnection}
      icon="add_link"
      maxWidth="max-w-[500px]"
      loading={loading}
      testId="add-host"
      footer={
        <>
          <Button data-testid="add-host-cancel-btn" variant="secondary" onClick={handleClose} disabled={loading}>
            {CM.cancel}
          </Button>
          <Button
            data-testid="add-host-save-btn"
            variant="secondary"
            onClick={handleSave}
            loading={loading}
            icon="save_as"
            className="min-w-[100px]"
          >
            {CM.saveChanges}
          </Button>
          <Button
            data-testid="add-host-connect-save-btn"
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

        {/* API Error Banner */}
        {apiError && (
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
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              error={errors.password}
              placeholder="••••••••"
              icon="key"
              disabled={loading}
              required
            />
          </div>
        </div>

      </div>
    </Modal>
  );
}
