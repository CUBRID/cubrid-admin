import React from 'react';
import { useSelector } from 'react-redux';
import { InfoBanner } from '../../../../components/ds/foundation/InfoBanner';
import { useCM } from '../../../../constants/useCM';

const errorText = (error) => (typeof error === 'object' ? (error.message || error.note || JSON.stringify(error)) : error);

// Why the host dashboard couldn't read the host (its CMS not answering, for
// one), at the top of the dashboard so it is seen whichever section is in
// view. startInfoError is the dashboard's own database list read, made on
// every refresh. The system status read runs only while statusReadActive
// (an HA host, or its section expanded); its last error is shown only then,
// so a section collapsed after a failure doesn't leave a stale banner.
export default function HostReadErrorBanner({ hostUid, startInfoError = null, statusReadActive = true }) {
  const CM = useCM();
  const statusError = useSelector((state) => state.monitoring.hostsData[hostUid]?.error ?? null);
  const error = startInfoError ?? (statusReadActive ? statusError : null);
  if (!error) return null;
  return (
    <div data-testid="server-dashboard-host-error">
      <InfoBanner variant="danger" title={CM.systemStatusError} icon="error">
        {errorText(error)}
      </InfoBanner>
    </div>
  );
}
