const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Given, When, Then, And, bddMeta } = require('../../shared/bdd');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function defaultExecutablePath() {
  if (process.platform === 'win32') {
    return path.join(REPO_ROOT, 'dist/portable/win-unpacked/Next CUBRID Admin.exe');
  }
  if (process.platform === 'darwin') {
    return path.join(
      REPO_ROOT,
      'dist/portable/mac/Next CUBRID Admin.app/Contents/MacOS/Next CUBRID Admin'
    );
  }
  return path.join(REPO_ROOT, 'dist/portable/linux-unpacked/cubrid-web-manager-desktop');
}

test.describe('Feature: Packaged Electron Application', () => {
  test('Scenario: Packaged Electron binary contains and serves its renderer and embedded API resources', async () => {
    await bddMeta({
      epic: 'Desktop Electron Application',
      feature: 'Packaged Distribution',
      story: 'Packaged Resources and IPC Integration',
      severity: 'critical',
    });

    const executablePath = process.env.E2E_PACKAGED_APP || defaultExecutablePath();
    test.skip(!fs.existsSync(executablePath), `Packaged executable not found: ${executablePath}`);

    let tmpRoot;
    let workspaceRoot;
    let app;
    let window;

    await Given('the packaged desktop application workspace is initialized', async () => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cwm-packaged-e2e-'));
      workspaceRoot = path.join(tmpRoot, 'cwm-workspace');
      fs.mkdirSync(path.join(workspaceRoot, 'data', 'storage'), { recursive: true });
      fs.mkdirSync(path.join(workspaceRoot, 'ssl'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpRoot, 'desktop-settings.json'),
        JSON.stringify({ workspaceRoot, workspaceSetupComplete: true }),
        { encoding: 'utf8', mode: 0o600 }
      );
    });

    try {
      await When('the packaged electron binary is launched', async () => {
        app = await electron.launch({
          executablePath,
          args: ['--no-sandbox', `--user-data-dir=${path.join(tmpRoot, 'electron-user-data')}`],
          env: { ...process.env, CWM_PORTABLE_APP_ROOT: tmpRoot, NODE_ENV: 'test' },
          timeout: 60000,
        });

        window = await app.firstWindow();
        await window.waitForURL(/#\/login$/, { timeout: 60000 });
      });

      await Then('the login view is rendered by the packaged renderer', async () => {
        await expect(window.getByTestId('login-username-input')).toBeVisible();
      });

      await And('all embedded resources exist inside the packaged app bundle', async () => {
        const { isPackaged, resourcesPath } = await app.evaluate(({ app: electronApp }) => ({
          isPackaged: electronApp.isPackaged,
          resourcesPath: process.resourcesPath,
        }));
        expect(isPackaged).toBe(true);
        expect(fs.existsSync(path.join(resourcesPath, 'web-manager', 'index.html'))).toBe(true);
        expect(fs.existsSync(path.join(resourcesPath, 'api-server', 'main.js'))).toBe(true);
      });

      await And('the embedded API server responds correctly to login requests', async () => {
        const proxyResponse = await window.evaluate(async () => {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'missing-packaged-user', password: 'invalid-password' }),
          });
          return { status: response.status, body: await response.json() };
        });
        expect(proxyResponse).toMatchObject({
          status: 404,
          body: { status: 404, data: { code: 'USER_NOT_FOUND' } },
        });
      });
    } finally {
      await app?.close().catch(() => undefined);
      if (tmpRoot) {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    }
  });
});
