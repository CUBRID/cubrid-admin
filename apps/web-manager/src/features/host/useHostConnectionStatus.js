import { shallowEqual, useSelector } from 'react-redux';
import { useCM } from '../../constants/useCM';
import { hostConnectionStatus, hostConnectionStatusText } from './hostConnectionStatus';

const NO_HOST_STATE = {};

/** A host's status and its text (for title / aria-label), from the host slice. */
export function useHostConnectionStatus(hostUid) {
  const CM = useCM();
  const host = useSelector((state) => {
    const h = state.host ?? NO_HOST_STATE;
    return {
      authorizedHosts: h.authorizedHosts,
      reconnectQueue: h.reconnectQueue,
      hostAuthErrors: h.hostAuthErrors,
      hostNotResponding: h.hostNotResponding,
      loggingInHosts: h.loggingInHosts,
    };
  }, shallowEqual);
  const status = hostConnectionStatus(hostUid, host);
  return { status, text: hostConnectionStatusText(status, hostUid, host, CM) };
}
