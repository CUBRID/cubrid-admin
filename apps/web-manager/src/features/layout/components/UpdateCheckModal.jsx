import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';
import { Icon } from '../../../components/ds/foundation/Icon';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { Spinner } from '../../../components/ds/foundation/Spinner';
import { Typography } from '../../../components/ds/foundation/Typography';
import { useCM } from '../../../constants/useCM';
import { closeUpdateCheck } from '../appBarSlice';
import { dismissUpdate, fetchUpdateStatus, openUpdateUrl } from '../../update/updateCheckClient';

const LOADING_VIEW = { phase: 'loading', status: null };

// 'network' / 'no-release' are expected on a closed network or before the
// first release — shown as neutral info, never as an error.
const REASONS = {
  network: { label: 'updateCheckReasonNetwork', variant: 'info' },
  'no-release': { label: 'updateCheckReasonNoRelease', variant: 'info' },
  'rate-limited': { label: 'updateCheckReasonRateLimited', variant: 'warning' },
  'parse-error': { label: 'updateCheckReasonParseError', variant: 'warning' },
};

function VersionRow({ label, version, testId }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2" data-testid={testId}>
      <Typography variant="p" className="text-13 text-slate-500 dark:text-slate-400">
        {label}
      </Typography>
      <Typography variant="p" className="font-mono font-bold text-14 text-slate-800 dark:text-white">
        {version ? `v${version}` : '—'}
      </Typography>
    </div>
  );
}

export default function UpdateCheckModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isOpen, source, preloadedStatus } = useSelector((state) => state.appBar.updateCheck, shallowEqual);
  const [view, setView] = useState(LOADING_VIEW);
  const requestIdRef = useRef(0);

  const runCheck = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setView(LOADING_VIEW);
    try {
      const status = await fetchUpdateStatus();
      if (requestId === requestIdRef.current) setView({ phase: 'done', status });
    } catch {
      if (requestId === requestIdRef.current) setView({ phase: 'failed', status: null });
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      // Drop any still-in-flight result so it can't land in a later opening.
      requestIdRef.current += 1;
      setView(LOADING_VIEW);
      return;
    }
    if (preloadedStatus) {
      requestIdRef.current += 1;
      setView({ phase: 'done', status: preloadedStatus });
    } else {
      runCheck();
    }
  }, [isOpen, preloadedStatus, runCheck]);

  if (!isOpen) return null;

  const status = view.status;
  const result = status?.result;
  const isUpdateAvailable = view.phase === 'done' && result?.status === 'update-available';
  const isLoading = view.phase === 'loading';

  const handleClose = () => {
    if (source === 'startup' && isUpdateAvailable) {
      dismissUpdate(result.latestVersion).catch(() => undefined);
    }
    dispatch(closeUpdateCheck());
  };

  const handleOpenUrl = async (url, fallbackUrl) => {
    const opened = await openUpdateUrl(url).catch(() => false);
    if (!opened && fallbackUrl && fallbackUrl !== url) {
      await openUpdateUrl(fallbackUrl).catch(() => false);
    }
  };

  let body;
  if (isLoading) {
    body = (
      <div className="flex flex-col items-center gap-3 py-6" data-testid="update-check-loading">
        <Spinner size="lg" className="text-amber-500" />
        <Typography variant="p" className="text-14 text-slate-500 dark:text-slate-400">
          {CM.updateCheckChecking}
        </Typography>
      </div>
    );
  } else if (view.phase === 'failed') {
    body = (
      <InfoBanner variant="warning" title={CM.updateCheckUnavailableTitle}>
        <span data-testid="update-check-request-failed">{CM.updateCheckRequestFailed}</span>
      </InfoBanner>
    );
  } else if (result.status === 'update-available') {
    body = (
      <div className="flex flex-col gap-3" data-testid="update-check-available">
        <div className="flex items-center gap-2">
          <Icon name="new_releases" className="text-amber-500" />
          <Typography variant="p" className="font-semibold text-15 text-slate-800 dark:text-white">
            {CM.updateCheckAvailableTitle}
          </Typography>
        </div>
        <Typography variant="p" className="text-13 text-slate-500 dark:text-slate-400">
          {CM.updateCheckAvailableDesc}
        </Typography>
      </div>
    );
  } else if (result.status === 'up-to-date') {
    body = (
      <div className="flex items-center gap-2" data-testid="update-check-up-to-date">
        <Icon name="check_circle" className="text-emerald-500" />
        <Typography variant="p" className="font-semibold text-15 text-slate-800 dark:text-white">
          {CM.updateCheckUpToDateTitle}
        </Typography>
      </div>
    );
  } else {
    const reason = REASONS[result.reason] ?? REASONS.network;
    body = (
      <InfoBanner variant={reason.variant} title={CM.updateCheckUnavailableTitle}>
        <span data-testid={`update-check-error-${result.reason}`}>{CM[reason.label]}</span>
      </InfoBanner>
    );
  }

  const footer = isUpdateAvailable ? (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="outline" onClick={handleClose} data-testid="update-check-dismiss">
        {source === 'startup' ? CM.updateCheckLater : CM.close}
      </Button>
      <Button
        variant="secondary"
        icon="description"
        onClick={() => handleOpenUrl(result.releaseNotesUrl)}
        data-testid="update-check-release-notes"
      >
        {CM.updateCheckReleaseNotes}
      </Button>
      <Button
        variant="primary"
        icon="download"
        onClick={() => handleOpenUrl(result.downloadUrl, result.releaseNotesUrl)}
        data-testid="update-check-download"
      >
        {CM.updateCheckDownload}
      </Button>
    </div>
  ) : (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        variant="outline"
        icon="refresh"
        disabled={isLoading}
        onClick={runCheck}
        data-testid="update-check-retry"
      >
        {CM.updateCheckRetry}
      </Button>
      <Button variant="primary" onClick={handleClose} data-testid="update-check-close">
        {CM.close}
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={CM.checkForUpdates}
      icon="update"
      testId="update-check"
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        {status && (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            <VersionRow label={CM.updateCheckCurrentVersion} version={status.currentVersion} testId="update-check-current-version" />
            {isUpdateAvailable && (
              <VersionRow label={CM.updateCheckLatestVersion} version={result.latestVersion} testId="update-check-latest-version" />
            )}
          </div>
        )}
        {body}
      </div>
    </Modal>
  );
}
