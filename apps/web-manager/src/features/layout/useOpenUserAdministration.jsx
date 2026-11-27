import { useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ds/layout/ConfirmDialog';
import { useCM } from '../../constants/useCM';
import { clearDirtyTabs } from './layoutSlice';

const NO_TABS = [];
const USER_ADMINISTRATION_PATH = '/admin/accounts';

/**
 * Opens User Administration, which replaces the dashboard and its editors:
 * with a tab's changes unsaved, it asks first, and going on drops them.
 * Returns the function to call and the dialog to render.
 */
export function useOpenUserAdministration() {
  const CM = useCM();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const dirtyTabs = useSelector((state) => state.layout?.dirtyTabs ?? NO_TABS, shallowEqual);
  const [asking, setAsking] = useState(false);

  const open = () => {
    if (dirtyTabs.length > 0) setAsking(true);
    else navigate(USER_ADMINISTRATION_PATH);
  };

  const confirmDialog = (
    <ConfirmDialog
      isOpen={asking}
      title={CM.unsavedChangesTitle}
      description={CM.openUserAdministrationUnsavedDesc}
      confirmLabel={CM.openUserAdministrationConfirmBtn}
      variant="danger"
      onCancel={() => setAsking(false)}
      onConfirm={() => {
        setAsking(false);
        dispatch(clearDirtyTabs());
        navigate(USER_ADMINISTRATION_PATH);
      }}
      testId="user-administration-unsaved"
    />
  );

  return { open, confirmDialog };
}
