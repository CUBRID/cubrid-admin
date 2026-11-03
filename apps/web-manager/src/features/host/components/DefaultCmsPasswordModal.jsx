import { useDispatch, useSelector } from 'react-redux';
import { openChangePasswordModal } from '../hostSlice';
import { dismissDefaultCmsPassword } from '../../layout/layoutSlice';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Typography } from '../../../components/ds/foundation/Typography';
import { useCM } from '../../../constants/useCM';

/**
 * Points out hosts whose CMS login is still the installed admin/admin, once
 * per host per session. A suggestion only: the user may close it.
 */
export default function DefaultCmsPasswordModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const hostUids = useSelector((state) => state.layout.defaultCmsPasswordHosts);
  const hosts = useSelector((state) => state.host.hosts);
  // Stays out of the way while a host password change it opened is showing.
  const changingPassword = useSelector((state) => state.host.isChangePasswordModalOpen);

  if (hostUids.length === 0 || changingPassword) return null;

  const close = () => dispatch(dismissDefaultCmsPassword());
  const change = (uid) => {
    dispatch(dismissDefaultCmsPassword(uid));
    dispatch(openChangePasswordModal(uid));
  };
  const nameOf = (uid) => {
    const host = hosts.find((h) => h.uid === uid);
    return host?.alias || host?.address || uid;
  };

  return (
    <Modal
      isOpen
      testId="default-cms-password"
      onClose={close}
      title={CM.defaultCmsPasswordTitle}
      icon="key"
      maxWidth="460px"
      footer={<Button variant="outline" onClick={close} data-testid="default-cms-password-close-btn">{CM.close}</Button>}
    >
      <div className="space-y-4">
        <Typography variant="p" className="text-13 text-slate-600 dark:text-slate-300">
          {CM.defaultCmsPasswordMsg}
        </Typography>
        <ul className="divide-y divide-slate-100 dark:divide-white/5 rounded-xl border border-slate-200 dark:border-white/8">
          {hostUids.map((uid) => (
            <li key={uid} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-13 font-bold text-slate-700 dark:text-slate-200 truncate">{nameOf(uid)}</span>
              <Button size="sm" onClick={() => change(uid)} data-testid={`default-cms-password-change-${uid}`}>
                {CM.changePassword}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
