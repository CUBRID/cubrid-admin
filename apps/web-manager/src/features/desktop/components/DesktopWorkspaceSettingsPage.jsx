import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isDesktopApp } from '../isDesktopApp';
import { Icon } from '../../../components/ds/foundation/Icon';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { Input } from '../../../components/ds/forms/Input';
import { useCM } from '../../../constants/useCM';
import { desktopErrorText } from '../desktopErrorText';
import LanguageToggle from '../../layout/components/LanguageToggle';
import { ConfirmDialog } from '../../../components/ds/layout/ConfirmDialog';

// For comparing workspace folders as typed: no surrounding spaces or
// trailing separator ("/ws/" is "/ws").
function normalizeWorkspacePath(value) {
  const trimmed = (value ?? '').trim();
  const stripped = trimmed.replace(/[\\/]+$/, '');
  return stripped || trimmed.slice(0, 1);
}

function SettingsShell({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-[#070709] font-sans selection:bg-amber-500/20 relative overflow-hidden">
      <div className="w-full max-w-lg bg-white/90 dark:bg-[#121215]/90 backdrop-blur-xl border border-slate-200/80 dark:border-white/10 rounded-2xl shadow-[0_24px_60px_-15px_rgba(0,0,0,0.08),0_0_40px_rgba(245,158,11,0.04)] dark:shadow-[0_24px_60px_-15px_rgba(0,0,0,0.6),0_0_50px_rgba(245,158,11,0.08)] relative z-10 overflow-hidden p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-500">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-amber-500/40 via-amber-400 to-amber-500/40 shadow-[0_1px_8px_rgba(245,158,11,0.25)]" />
        {/* The same language setting as the sign-in page and the app; the
            desktop menu and folder dialog follow it (useDesktopMenuLanguage). */}
        <div className="flex justify-end mb-4">
          <LanguageToggle />
        </div>
        {children}
      </div>
    </div>
  );
}

export default function DesktopWorkspaceSettingsPage() {
  const CM = useCM();
  const bridge = window.desktopBridge;
  const inDesktopApp = isDesktopApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // The server could not say whether a job runs: switch only if the user says so.
  const [askIgnoreUnknownJobs, setAskIgnoreUnknownJobs] = useState(false);
  // The server start in progress: { state: 'idle' | 'starting' | 'slow', elapsedMs }.
  const [startStatus, setStartStatus] = useState({ state: 'idle' });
  const navigate = useNavigate();

  const loadInfo = useCallback(async () => {
    if (!bridge) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [next, setupRequired, startupError] = await Promise.all([
        bridge.getWorkspaceInfo(),
        bridge.isWorkspaceSetupRequired(),
        bridge.getWorkspaceStartupError?.() ?? null,
      ]);
      setInfo(next);
      setWorkspaceRoot(next.workspaceRoot);
      setSetupMode(setupRequired);
      // The configured workspace failed at launch: say why (a WORKSPACE_* code).
      if (startupError) setError(desktopErrorText({ message: startupError }, CM, CM.workspaceSaveFailedMsg));
    } catch (err) {
      setError(desktopErrorText(err, CM, CM.workspaceSettingsLoadFailedMsg));
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  // A slow start shows its time; nothing fails only because it is slow.
  useEffect(() => {
    if (!bridge?.onApiStartStatus) return undefined;
    void bridge.getApiStartStatus?.().then((status) => status && setStartStatus(status));
    return bridge.onApiStartStatus((status) => setStartStatus(status));
  }, [bridge]);

  const starting = startStatus.state === 'starting' || startStatus.state === 'slow';
  const startSeconds = Math.round((startStatus.elapsedMs ?? 0) / 1000);

  const handlePick = async () => {
    if (!bridge) return;
    setError('');
    const picked = await bridge.pickWorkspaceDirectory();
    if (picked) {
      setWorkspaceRoot(picked);
    }
  };

  const handleContinue = async () => {
    if (!bridge) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await bridge.finishWorkspaceSetup(workspaceRoot);
      setMessage(CM.applyingWorkspaceMsg);
    } catch (err) {
      setError(desktopErrorText(err, CM, CM.workspaceSaveFailedMsg));
      setSaving(false);
    }
  };

  // The app reloads on the new workspace by itself; the buttons stay off until then.
  const afterWorkspaceApplied = () => {
    setMessage(CM.applyingWorkspaceMsg);
  };

  const handleSave = async ({ ignoreUnknownJobs = false } = {}) => {
    if (!bridge) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = ignoreUnknownJobs
        ? await bridge.setWorkspaceRoot(workspaceRoot, { ignoreUnknownJobs: true })
        : await bridge.setWorkspaceRoot(workspaceRoot);
      // The folder in use, written another way: nothing restarts, back to the dashboard.
      if (result?.unchanged) {
        navigate('/home');
        return;
      }
      afterWorkspaceApplied();
    } catch (err) {
      setSaving(false);
      if (String(err?.message ?? '').includes('WORKSPACE_JOBS_UNKNOWN')) {
        setAskIgnoreUnknownJobs(true);
        return;
      }
      setError(desktopErrorText(err, CM, CM.workspaceSaveFailedMsg));
    }
  };

  // Saving the folder the app already runs on would restart it for nothing.
  const unchanged = Boolean(info)
    && normalizeWorkspacePath(workspaceRoot) === normalizeWorkspacePath(info.workspaceRoot);

  if (!inDesktopApp) {
    return (
      <SettingsShell>
        <InfoBanner variant="warning" title={CM.desktopOnly}>
          {CM.workspaceDesktopOnlyDesc}
        </InfoBanner>
        <Link to="/login" className="text-amber-500 text-sm font-semibold hover:underline mt-4 inline-block">
          {CM.backToSignIn}
        </Link>
      </SettingsShell>
    );
  }

  if (!bridge) {
    return (
      <SettingsShell>
        <InfoBanner variant="danger" title={CM.desktopBridgeUnavailable}>
          {CM.desktopConnectFailedMsg}{' '}
          <code className="text-xs">npm run dev:desktop</code>.
        </InfoBanner>
      </SettingsShell>
    );
  }

  return (
    <SettingsShell>
      <div className="mb-8">
        {/* Opened from a running app (File > Switch Workspace): back to its dashboard.
            Not before the page knows it is not the first-run setup. */}
        {!loading && !setupMode && (
          <Link
            to="/home"
            data-testid="workspace-back-link"
            className="inline-flex items-center gap-1 text-14 text-slate-500 hover:text-amber-500 mb-4"
          >
            <Icon name="arrow_back" size="sm" weight={300} />
            {CM.backBtn}
          </Link>
        )}
        <h1 data-testid="workspace-setup-title" className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          {setupMode ? CM.selectWorkspaceTitle : CM.workspaceTitle}
        </h1>
        <p className="text-15 text-slate-500 dark:text-slate-400 mt-1">
          {CM.workspaceDescPrefix}
          <strong className="font-semibold text-slate-700 dark:text-slate-200">{CM.workspaceDescFolderPhrase}</strong>
          {CM.workspaceDescMiddle}
          <code className="text-xs">data/</code>,{' '}
          <code className="text-xs">ssl/</code>
          {CM.workspaceDescSuffix}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">{CM.loadingLabel}</p>
      ) : (
        <div className="space-y-5">
          <Input
            data-testid="workspace-root-input"
            label={CM.workspaceFolderLabel}
            value={workspaceRoot}
            onChange={(e) => setWorkspaceRoot(e.target.value)}
            placeholder={info?.defaultWorkspaceRoot}
          />

          {info && (
            <div className="text-14 text-slate-500 dark:text-slate-400 space-y-1 font-mono break-all">
              {!info.isCustomWorkspace && (
                <p className="text-amber-600 dark:text-amber-400">
                  {CM.defaultLocationLabel(info.defaultWorkspaceRoot)}
                </p>
              )}
              <p>{CM.settingsFileLabel(info.settingsFilePath)}</p>
            </div>
          )}

          {error && (
            <InfoBanner variant="danger" title={CM.error}>
              {error}
            </InfoBanner>
          )}
          {message && !starting && (
            <InfoBanner variant="success" title={CM.policiesSaved}>
              {message}
            </InfoBanner>
          )}
          {startStatus.state === 'starting' && (
            <InfoBanner variant="info" title={CM.loadingLabel}>
              <span data-testid="api-start-progress">{CM.apiStartingMsg(startSeconds)}</span>
            </InfoBanner>
          )}
          {startStatus.state === 'slow' && (
            <InfoBanner variant="warning" title={CM.loadingLabel}>
              <span data-testid="api-start-slow">{CM.apiStartSlowMsg(startSeconds)}</span>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  data-testid="api-start-keep-waiting-btn"
                  onClick={() => void bridge.decideApiStart('wait')}
                  className="h-9 px-3 text-14 font-semibold rounded-xl border border-slate-200 dark:border-white/10 hover:border-amber-500/40"
                >
                  {CM.keepWaitingBtn}
                </button>
                <button
                  type="button"
                  data-testid="api-start-stop-btn"
                  onClick={() => void bridge.decideApiStart('stop')}
                  className="h-9 px-3 text-14 font-semibold rounded-xl border border-rose-300 text-rose-600 dark:border-rose-500/40 dark:text-rose-400"
                >
                  {CM.stopServerStartBtn}
                </button>
              </div>
            </InfoBanner>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="workspace-pick-btn"
              onClick={() => void handlePick()}
              className="h-10 px-4 text-15 font-semibold rounded-xl border border-slate-200 dark:border-white/10 hover:border-amber-500/40"
            >
              {CM.selectFolderEllipsis}
            </button>
            {setupMode ? (
              <button
                type="button"
                data-testid="workspace-continue-btn"
                disabled={saving || starting || !workspaceRoot.trim()}
                onClick={() => void handleContinue()}
                className="h-10 px-4 text-15 font-bold rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-black disabled:opacity-50"
              >
                {CM.continueBtn}
              </button>
            ) : (
              <button
                type="button"
                data-testid="workspace-save-btn"
                disabled={saving || starting || !workspaceRoot.trim() || unchanged}
                onClick={() => void handleSave()}
                className="h-10 px-4 text-15 font-bold rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-black disabled:opacity-50"
              >
                {CM.save}
              </button>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        isOpen={askIgnoreUnknownJobs}
        title={CM.workspaceTitle}
        description={CM.workspaceJobsUnknownDesc}
        confirmLabel={CM.switchWorkspaceConfirmBtn}
        variant="danger"
        onCancel={() => setAskIgnoreUnknownJobs(false)}
        onConfirm={() => {
          setAskIgnoreUnknownJobs(false);
          void handleSave({ ignoreUnknownJobs: true });
        }}
        testId="workspace-jobs-unknown"
      />
    </SettingsShell>
  );
}
