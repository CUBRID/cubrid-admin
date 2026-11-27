import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { isDesktopApp } from '../isDesktopApp';
import { Icon } from '../../../components/ds/foundation/Icon';
import { InfoBanner } from '../../../components/ds/foundation/InfoBanner';
import { Input } from '../../../components/ds/forms/Input';
import { useCM } from '../../../constants/useCM';
import { desktopErrorText } from '../desktopErrorText';
import LanguageToggle from '../../layout/components/LanguageToggle';
import { ConfirmDialog } from '../../../components/ds/layout/ConfirmDialog';
import { useResetEffect } from '../../../infrastructure/hooks/useResetEffect';
import { useLatestRef } from '../../../infrastructure/hooks/useLatestRef';
import WorkspaceExportDialog from './WorkspaceExportDialog';
import WorkspacePasswordDialog from './WorkspacePasswordDialog';
import { Modal } from '../../../components/ds/layout/Modal';
import { Button } from '../../../components/ds/foundation/Button';

// Why a folder will not take an import: another folder may.
const FOLDER_ERRORS = [
  'WORKSPACE_IMPORT_FOLDER_NOT_EMPTY',
  'WORKSPACE_IN_USE',
  'WORKSPACE_PATH_TOO_LONG',
  'WORKSPACE_PATH_REQUIRED',
  'WORKSPACE_NOT_WRITABLE',
  'WORKSPACE_NOT_READABLE',
  'WORKSPACE_CANNOT_CREATE_FOLDER',
  'WORKSPACE_SOCKET_FAILED',
  'WORKSPACE_IN_APP_BUNDLE',
];

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
  const [exportOpen, setExportOpen] = useState(false);
  // The export file being imported, while its password is asked; then the
  // opened export (main's token) while a folder is chosen.
  const [importFile, setImportFile] = useState(null);
  const [importToken, setImportToken] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [folderError, setFolderError] = useState('');
  // Where the last import put the workspace, said with a failed switch to it.
  const [importedAt, setImportedAt] = useState('');
  // Leaving the page drops the opened export the main process holds for it.
  const importTokenRef = useRef(null);
  importTokenRef.current = importToken;
  useEffect(() => () => {
    const token = importTokenRef.current;
    if (token) void window.desktopBridge?.forgetWorkspaceArchive?.(token)?.catch?.(() => undefined);
  }, []);
  // The server start in progress: { state: 'idle' | 'starting' | 'slow', elapsedMs }.
  const [startStatus, setStartStatus] = useState({ state: 'idle' });
  // First run: the workspace used last by another copy of the app, offered until declined.
  const [previous, setPrevious] = useState(null);
  const [previousDeclined, setPreviousDeclined] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Without a bridge (not the desktop app) there is nothing to read.
  useResetEffect(() => {
    if (!bridge) setLoading(false);
  }, [bridge]);
  // Read once per bridge: a language switch must not read the settings again
  // (that would drop a folder being typed and any error shown). The labels
  // for an error are the current ones at that time.
  const cmRef = useLatestRef(CM);
  useEffect(() => {
    if (!bridge) return;
    const loadInfo = async () => {
      setLoading(true);
      setError('');
      try {
        const [next, setupRequired, startupError, previousWorkspace] = await Promise.all([
          bridge.getWorkspaceInfo(),
          bridge.isWorkspaceSetupRequired(),
          bridge.getWorkspaceStartupError?.() ?? null,
          bridge.getPreviousWorkspace?.() ?? null,
        ]);
        setInfo(next);
        setWorkspaceRoot(next.workspaceRoot);
        setSetupMode(setupRequired);
        setPrevious(setupRequired && previousWorkspace?.workspaceRoot ? previousWorkspace : null);
        // The configured workspace failed at launch: say why (a WORKSPACE_* code).
        const labels = cmRef.current;
        if (startupError) setError(desktopErrorText({ message: startupError }, labels, labels.workspaceSaveFailedMsg));
      } catch (err) {
        const labels = cmRef.current;
        setError(desktopErrorText(err, labels, labels.workspaceSettingsLoadFailedMsg));
      } finally {
        setLoading(false);
      }
    };
    void loadInfo();
  }, [bridge, cmRef]);

  // A slow start shows its time; nothing fails only because it is slow.
  useEffect(() => {
    if (!bridge?.onApiStartStatus) return undefined;
    void bridge.getApiStartStatus?.().then((status) => status && setStartStatus(status));
    return bridge.onApiStartStatus((status) => setStartStatus(status));
  }, [bridge]);

  const starting = startStatus.state === 'starting' || startStatus.state === 'slow';
  // Read after awaits (the import's steps), where `starting` would be stale.
  const startingRef = useRef(starting);
  startingRef.current = starting;
  const startSeconds = Math.round((startStatus.elapsedMs ?? 0) / 1000);

  const handlePick = async () => {
    if (!bridge) return;
    setError('');
    const picked = await bridge.pickWorkspaceDirectory();
    if (picked) {
      setImportedAt('');
      setWorkspaceRoot(picked);
    }
  };

  const handleContinue = async (root = workspaceRoot) => {
    if (!bridge) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await bridge.finishWorkspaceSetup(root);
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

  const handleSave = async ({ ignoreUnknownJobs = false, root = workspaceRoot } = {}) => {
    if (!bridge) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = ignoreUnknownJobs
        ? await bridge.setWorkspaceRoot(root, { ignoreUnknownJobs: true })
        : await bridge.setWorkspaceRoot(root);
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

  // Import: the export file, its password (asked again while wrong), then a
  // folder (chosen again while it will not do), and the same switch as Save
  // (or Continue on first run), with its checks. The opened export stays in
  // the main process between the steps (the token).
  const startImport = async () => {
    // A switch now would stop the server start (main refuses it too).
    if (!bridge || startingRef.current) return;
    setError('');
    setMessage('');
    setImportedAt('');
    const file = await bridge.pickWorkspaceArchive();
    if (!file) return;
    setImportError('');
    setImportFile(file);
  };

  const dropImport = (token = importToken) => {
    if (token) void bridge.forgetWorkspaceArchive?.(token).catch(() => undefined);
    setImportToken(null);
    setImportFile(null);
    setFolderError('');
    setImportBusy(false);
  };

  const chooseImportFolder = async (token) => {
    setFolderError('');
    if (startingRef.current) {
      // Kept open with the opened export: choose the folder once it has started.
      setFolderError(CM.desktopErrors.WORKSPACE_API_STARTING);
      return;
    }
    const folder = await bridge.pickImportFolder();
    if (!folder) return; // the folder step stays open: choose again or cancel
    setImportBusy(true);
    let root;
    try {
      ({ workspaceRoot: root } = await bridge.importWorkspaceArchive(token, folder));
    } catch (err) {
      setImportBusy(false);
      const text = desktopErrorText(err, CM, CM.workspaceSaveFailedMsg);
      if (FOLDER_ERRORS.some((code) => String(err?.message ?? '').includes(code))) {
        setFolderError(text);
        return;
      }
      dropImport(token);
      setError(text);
      return;
    }
    setImportToken(null);
    setImportFile(null);
    setImportBusy(false);
    setImportedAt(root);
    setWorkspaceRoot(root);
    if (setupMode) await handleContinue(root);
    else await handleSave({ root });
  };

  const importWith = async (password) => {
    setImportBusy(true);
    setImportError('');
    let token;
    try {
      ({ token } = await bridge.openWorkspaceArchive(importFile, password));
    } catch (err) {
      setImportBusy(false);
      const text = desktopErrorText(err, CM, CM.workspaceSaveFailedMsg);
      if (String(err?.message ?? '').includes('WORKSPACE_ARCHIVE_WRONG_PASSWORD')) {
        setImportError(text);
        return;
      }
      setImportFile(null);
      setError(text);
      return;
    }
    setImportBusy(false);
    setImportFile(null);
    setImportToken(token);
    await chooseImportFolder(token);
  };

  // File > Import Workspace opens this page with ?do=import: start once.
  const startedFromMenu = useRef(false);
  const startImportRef = useLatestRef(startImport);
  useEffect(() => {
    // Opened once the server start in progress is over.
    if (loading || starting || startedFromMenu.current) return;
    if (new URLSearchParams(location.search).get('do') !== 'import') return;
    startedFromMenu.current = true;
    navigate(location.pathname, { replace: true });
    void startImportRef.current();
  }, [loading, starting, location.search, location.pathname, navigate, startImportRef]);

  const offeringPrevious = setupMode && Boolean(previous) && !previousDeclined;

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
          {offeringPrevious ? (
            <div
              data-testid="previous-workspace-offer"
              className="rounded-xl border border-slate-200 dark:border-white/10 p-4 space-y-3"
            >
              <p className="text-15 font-semibold text-slate-900 dark:text-white">{CM.previousWorkspaceTitle}</p>
              <p data-testid="previous-workspace-path" className="text-14 font-mono break-all text-slate-600 dark:text-slate-300">
                {previous.workspaceRoot}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="previous-workspace-use-btn"
                  disabled={saving || starting}
                  onClick={() => void handleContinue(previous.workspaceRoot)}
                  className="h-10 px-4 text-15 font-bold rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-black disabled:opacity-50"
                >
                  {CM.usePreviousWorkspaceBtn}
                </button>
                <button
                  type="button"
                  data-testid="previous-workspace-new-btn"
                  disabled={saving || starting}
                  onClick={() => setPreviousDeclined(true)}
                  className="h-10 px-4 text-15 font-semibold rounded-xl border border-slate-200 dark:border-white/10 hover:border-amber-500/40 disabled:opacity-50"
                >
                  {CM.startNewWorkspaceBtn}
                </button>
              </div>
            </div>
          ) : (
            <Input
              data-testid="workspace-root-input"
              label={CM.workspaceFolderLabel}
              value={workspaceRoot}
              onChange={(e) => { setImportedAt(''); setWorkspaceRoot(e.target.value); }}
              placeholder={info?.defaultWorkspaceRoot}
            />
          )}

          {info && !offeringPrevious && (
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
              {importedAt && (
                <span data-testid="workspace-imported-at" className="block mt-1 font-mono break-all">{CM.workspaceImportedAtMsg(importedAt)}</span>
              )}
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

          {!offeringPrevious && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="workspace-pick-btn"
                onClick={() => void handlePick()}
                className="h-10 px-4 text-15 font-semibold rounded-xl border border-slate-200 dark:border-white/10 hover:border-amber-500/40"
              >
                {CM.selectFolderEllipsis}
              </button>
              <button
                type="button"
                data-testid="workspace-import-btn"
                disabled={saving || starting}
                onClick={() => void startImport()}
                className="h-10 px-4 text-15 font-semibold rounded-xl border border-slate-200 dark:border-white/10 hover:border-amber-500/40 disabled:opacity-50"
              >
                {CM.importWorkspace}
              </button>
              {!setupMode && (
                <button
                  type="button"
                  data-testid="workspace-export-btn"
                  disabled={saving || starting}
                  onClick={() => { setError(''); setMessage(''); setExportOpen(true); }}
                  className="h-10 px-4 text-15 font-semibold rounded-xl border border-slate-200 dark:border-white/10 hover:border-amber-500/40 disabled:opacity-50"
                >
                  {CM.exportWorkspace}
                </button>
              )}
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
          )}
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
      <WorkspaceExportDialog
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        onExported={(filePath) => setMessage(CM.workspaceExportedMsg(filePath))}
      />
      <WorkspacePasswordDialog
        isOpen={importFile !== null}
        title={CM.importWorkspaceTitle}
        submitLabel={CM.workspaceImportBtn}
        busy={importBusy}
        error={importError}
        onSubmit={(password) => void importWith(password)}
        onCancel={() => { if (!importBusy) setImportFile(null); }}
        testId="workspace-import"
      />
      <Modal
        isOpen={importToken !== null}
        onClose={() => { if (!importBusy) dropImport(); }}
        title={CM.importWorkspaceTitle}
        icon="drive_folder_upload"
        maxWidth="max-w-[440px]"
        testId="workspace-import-folder"
        footer={(
          <div className="flex justify-end gap-2 w-full">
            <Button variant="ghost" onClick={() => dropImport()} disabled={importBusy}>{CM.cancel}</Button>
            <Button data-testid="workspace-import-folder-btn" variant="primary" onClick={() => void chooseImportFolder(importToken)} disabled={importBusy}>
              {CM.workspaceChooseAnotherFolder}
            </Button>
          </div>
        )}
      >
        {folderError && <p role="alert" className="text-14 text-rose-500">{folderError}</p>}
      </Modal>
    </SettingsShell>
  );
}
