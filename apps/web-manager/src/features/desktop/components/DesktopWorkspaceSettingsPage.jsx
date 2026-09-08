import { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { logout } from '../../auth/authSlice';
import { Icon } from '../../../components/ds/foundation/Icon';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { Input } from '../../../components/ds/forms/Input';
import { useCM } from '../../../constants/useCM';

function SettingsShell({ children }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-white dark:bg-[#0d0d0f]">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}

function isDesktopApp() {
  if (typeof window === 'undefined') {
    return false;
  }
  return (
    window.location.protocol === 'app:' ||
    window.desktopConfig?.isDesktop === true ||
    Boolean(window.desktopBridge)
  );
}

export default function DesktopWorkspaceSettingsPage() {
  const CM = useCM();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const bridge = window.desktopBridge;
  const inDesktopApp = isDesktopApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadInfo = useCallback(async () => {
    if (!bridge) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [next, setupRequired] = await Promise.all([
        bridge.getWorkspaceInfo(),
        bridge.isWorkspaceSetupRequired(),
      ]);
      setInfo(next);
      setWorkspaceRoot(next.workspaceRoot);
      setSetupMode(setupRequired);
    } catch (err) {
      setError(err?.message || CM.workspaceSettingsLoadFailedMsg);
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

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
      setError(err?.message || CM.workspaceSaveFailedMsg);
      setSaving(false);
    }
  };

  const afterWorkspaceApplied = () => {
    dispatch(logout());
    setMessage(CM.workspaceAppliedRelogMsg);
    setSaving(false);
    navigate('/login', { replace: true });
  };

  const handleSave = async () => {
    if (!bridge) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await bridge.setWorkspaceRoot(workspaceRoot);
      afterWorkspaceApplied();
    } catch (err) {
      setError(err?.message || CM.workspaceSaveFailedMsg);
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!bridge || !info) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await bridge.resetWorkspaceRoot();
      setWorkspaceRoot(info.defaultWorkspaceRoot);
      await loadInfo();
      afterWorkspaceApplied();
    } catch (err) {
      setError(err?.message || CM.workspaceResetFailedMsg);
      setSaving(false);
    }
  };

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
        {!setupMode && (
          <Link to="/login" className="inline-flex items-center gap-1 text-14 text-slate-500 hover:text-amber-500 mb-4">
            <Icon name="arrow_back" size="sm" weight={300} />
            {CM.signIn}
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
          {message && (
            <InfoBanner variant="success" title={CM.policiesSaved}>
              {message}
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
                disabled={saving || !workspaceRoot.trim()}
                onClick={() => void handleContinue()}
                className="h-10 px-4 text-15 font-bold rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-black disabled:opacity-50"
              >
                {CM.continueBtn}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  data-testid="workspace-save-btn"
                  disabled={saving || !workspaceRoot.trim()}
                  onClick={() => void handleSave()}
                  className="h-10 px-4 text-15 font-bold rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-black disabled:opacity-50"
                >
                  {CM.save}
                </button>
                {info?.isCustomWorkspace && (
                  <button
                    type="button"
                    data-testid="workspace-reset-btn"
                    disabled={saving}
                    onClick={() => void handleReset()}
                    className="h-10 px-4 text-15 font-semibold rounded-xl text-slate-600 dark:text-slate-300"
                  >
                    {CM.defaultLocationBtn}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </SettingsShell>
  );
}
