import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../../components/ds/layout/ConfirmDialog';
import { useCM } from '../../../constants/useCM';
import { clearDirtyTabs, closeWorkspaceSwitchConfirm } from '../../layout/layoutSlice';
import { DESKTOP_WORKSPACE_PATH } from '../../layout/menuActions';

/**
 * File > Switch Workspace while a tab has unsaved changes: the workspace page
 * replaces the dashboard and its editors, so the edits go. Asks first; going
 * on drops them (and their unsaved marks) and opens the workspace page.
 */
export default function WorkspaceSwitchConfirm() {
  const CM = useCM();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isOpen = useSelector((state) => state.layout.workspaceSwitchConfirmOpen);

  return (
    <ConfirmDialog
      isOpen={isOpen}
      title={CM.unsavedChangesTitle}
      description={CM.switchWorkspaceUnsavedDesc}
      confirmLabel={CM.switchWorkspaceConfirmBtn}
      variant="danger"
      onCancel={() => dispatch(closeWorkspaceSwitchConfirm())}
      onConfirm={() => {
        dispatch(closeWorkspaceSwitchConfirm());
        dispatch(clearDirtyTabs());
        navigate(DESKTOP_WORKSPACE_PATH);
      }}
      testId="workspace-switch-unsaved"
    />
  );
}
