import React from 'react';
import { useSelector } from 'react-redux';
import { InfoBanner } from '../../../../components/ds/foundation/InfoBanner';
import { useCM } from '../../../../constants/useCM';

// Why the host dashboard couldn't read the host's status (its CMS not
// answering, for one). Shown at the top of the dashboard, not inside the
// System Status section, so it is seen whichever section is in view.
export default function HostReadErrorBanner({ hostUid }) {
  const CM = useCM();
  const error = useSelector((state) => state.monitoring.hostsData[hostUid]?.error ?? null);
  if (!error) return null;
  return (
    <div data-testid="server-dashboard-host-error">
      <InfoBanner variant="danger" title={CM.systemStatusError} icon="error">
        {typeof error === 'object' ? (error.message || error.note || JSON.stringify(error)) : error}
      </InfoBanner>
    </div>
  );
}
