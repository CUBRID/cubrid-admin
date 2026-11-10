import { useState } from 'react';
import { useCM } from '../../../constants/useCM';
import { desktopErrorText } from '../desktopErrorText';
import WorkspacePasswordDialog from './WorkspacePasswordDialog';

/**
 * File > Export Workspace (over the dashboard) and the workspace page's
 * Export: asks the password, then the app asks where to save. `onExported`
 * gets the saved file's path; a cancelled save dialog just closes.
 */
export default function WorkspaceExportDialog({ isOpen, onClose, onExported }) {
  const CM = useCM();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setError('');
    onClose();
  };

  const exportWith = async (password) => {
    setBusy(true);
    setError('');
    try {
      const result = await window.desktopBridge.exportWorkspace(password);
      setBusy(false);
      close();
      if (result?.filePath) onExported?.(result.filePath);
    } catch (err) {
      setBusy(false);
      setError(desktopErrorText(err, CM, CM.workspaceSaveFailedMsg));
    }
  };

  return (
    <WorkspacePasswordDialog
      isOpen={isOpen}
      title={CM.exportWorkspaceTitle}
      submitLabel={CM.workspaceExportBtn}
      confirm
      busy={busy}
      error={error}
      onSubmit={(password) => void exportWith(password)}
      onCancel={close}
      testId="workspace-export"
    />
  );
}
