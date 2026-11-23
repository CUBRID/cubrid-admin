import { useDispatch, useSelector } from 'react-redux';
import { useCM } from '../../../constants/useCM';
import { closeWorkspaceExport, showStatusModal } from '../../layout/layoutSlice';
import WorkspaceExportDialog from './WorkspaceExportDialog';

/** File > Export Workspace over the dashboard (layout.workspaceExportOpen). */
export default function MenuWorkspaceExport() {
  const CM = useCM();
  const dispatch = useDispatch();
  const isOpen = useSelector((state) => state.layout.workspaceExportOpen);
  return (
    <WorkspaceExportDialog
      isOpen={isOpen}
      onClose={() => dispatch(closeWorkspaceExport())}
      onExported={(filePath) => dispatch(showStatusModal({ type: 'success', title: CM.exportWorkspaceTitle, message: CM.workspaceExportedMsg(filePath) }))}
    />
  );
}
