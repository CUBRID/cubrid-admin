const { test, expect } = require('../fixture');
const { AuthPage } = require('../pages/AuthPage');
const { HostTreePage } = require('../pages/HostTreePage');
const { DatabaseTreePage } = require('../pages/DatabaseTreePage');
const { dismissJobResultModal } = require('../pages/dismissJobResultModal');
const { Given, When, Then, bddMeta, action } = require('../bdd');

const E2E_HOST_ADDRESS = process.env.E2E_HOST_ADDRESS || 'localhost';
const E2E_HOST_PORT = process.env.E2E_HOST_PORT || '8001';
const E2E_DB = process.env.E2E_DB || 'demodb';
const E2E_OFFLINE_DB = process.env.E2E_OFFLINE_DB || 'db1';

test.describe('Feature: Database Lifecycle (Start / Stop)', () => {
  let hostUid;
  let apiContext;
  let originalRunning;

  function runningState(body, dbname) {
    const active = (body.data || body).activelist?.active;
    expect(Array.isArray(active), 'Status must contain an active database list; missing status is not stopped').toBe(true);
    expect(active.every(db => typeof db === 'string' ? db.length > 0 : typeof db?.dbname === 'string' && db.dbname.length > 0)).toBe(true);
    return active.some(db => (typeof db === 'string' ? db : db.dbname) === dbname);
  }

  // Browser fetch supports both web and Electron's API proxy; the web's
  // session cookies go with it, and POST needs the X-CWM-Request header.
  async function databaseRequest(page, operation = 'start-info') {
    expect(apiContext, 'No API context captured for the selected host').toBeTruthy();
    return page.evaluate(async ({ url, operation, dbname }) => {
      const endpoint = operation === 'start-info' ? url
        : url.replace(/start-info$/, `${operation}/${encodeURIComponent(dbname)}`);
      const response = await fetch(endpoint, {
        method: operation === 'start-info' ? 'GET' : 'POST',
        headers: { 'X-CWM-Request': '1', 'Content-Type': 'application/json' },
        ...(operation === 'start-info' ? {} : { body: '{}' }),
        signal: AbortSignal.timeout(65000),
      });
      return { status: response.status, ok: response.ok, body: await response.json() };
    }, { ...apiContext, operation, dbname: E2E_OFFLINE_DB });
  }

  async function readRunning(page) {
    const result = await databaseRequest(page);
    expect(result.ok, `Status API returned HTTP ${result.status}`).toBe(true);
    return runningState(result.body, E2E_OFFLINE_DB);
  }

  async function changeState(page, dbTree, operation) {
    await dbTree.openContextMenu(E2E_OFFLINE_DB);
    const name = operation === 'stop'
      ? /Stop Database|데이터베이스 정지|데이터베이스 중지/i
      : /Start Database|데이터베이스 시작/i;
    const started = Date.now();
    const [response] = await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST'
        && response.url().endsWith(`/${hostUid}/database/${operation}/${encodeURIComponent(E2E_OFFLINE_DB)}`),
      { timeout: 65000 }).catch(() => {
        throw new Error(`Database ${operation} API did not respond within 65s; check CMS execution and queue timings.`);
      }),
      page.getByRole('button', { name }).click(),
    ]);
    const body = await response.json();
    const data = body.data || body;
    const diagnostic = { operation, database: E2E_OFFLINE_DB, status: response.status(),
      elapsedMs: Date.now() - started, code: data.code, message: data.message || body.note };
    await test.info().attach(`${operation}-api-result`, {
      body: JSON.stringify(diagnostic, null, 2), contentType: 'application/json',
    });
    expect(response.ok(), `Database ${operation} failed: HTTP ${response.status()}, ${data.code || ''}: ${data.message || body.note || ''}`).toBe(true);
    expect(runningState(body, E2E_OFFLINE_DB), `${operation} API returned the wrong database state`).toBe(operation === 'start');
    await expect(dbTree.dbNode(E2E_OFFLINE_DB), 'Tree status must reflect the completed lifecycle operation')
      .toHaveAttribute('data-status', operation === 'start' ? 'on' : 'off', { timeout: 10000 });
    await dismissJobResultModal(page);
  }

  test.beforeEach(async ({ appPage: page }) => {
    test.setTimeout(90000);
    apiContext = null;
    originalRunning = undefined;
    const auth = new AuthPage(page);
    await auth.login(process.env.E2E_USERNAME, process.env.E2E_PASSWORD);

    const hostTree = new HostTreePage(page);
    const host = hostTree.hostRowByConnection(E2E_HOST_ADDRESS, E2E_HOST_PORT);
    await expect(host).toBeVisible({ timeout: 10000 });
    hostUid = await hostTree.getUidByConnection(E2E_HOST_ADDRESS, E2E_HOST_PORT);
    page.on('request', request => {
      if (request.method() === 'GET' && request.url().endsWith(`/${hostUid}/database/start-info`)) {
        apiContext = { url: request.url() };
      }
    });
    await hostTree.activateHost(hostUid);
  });

  test.afterEach(async ({ appPage: page }) => {
    if (originalRunning === undefined) return;
    test.setTimeout(180000);
    await action('Restore and verify the database state captured before this test', async () => {
      const current = await readRunning(page);
      if (current !== originalRunning) {
        const result = await databaseRequest(page, originalRunning ? 'start' : 'stop');
        expect(result.ok, `Could not restore ${E2E_OFFLINE_DB}: HTTP ${result.status}, ${result.body.note || ''}`).toBe(true);
        expect(runningState(result.body, E2E_OFFLINE_DB)).toBe(originalRunning);
      }
      expect(await readRunning(page), `Cleanup must restore ${E2E_OFFLINE_DB}'s original state`).toBe(originalRunning);
      await test.info().attach('restored-database-state', {
        body: JSON.stringify({ database: E2E_OFFLINE_DB, running: originalRunning }), contentType: 'application/json',
      });
    });
  });

  test('Scenario: Context menu conditionally offers Stop Database if running or Start Database if stopped', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Database Operations',
      feature: 'Lifecycle Controls',
      story: 'Context Menu Actions',
    });

    const dbTree = new DatabaseTreePage(page);
    let stopVisible, startVisible;

    await Given('the database is listed in the tree', async () => {
      await action('Verify database tree container is authorized', () => expect(page.locator('#db-tree-container')).toHaveAttribute('data-authorized', 'true'), 'Database tree container was not authorized.');
    });

    await When('the user opens the database context menu', async () => {
      await action('Open context menu for database ' + E2E_DB, () => dbTree.openContextMenu(E2E_DB), 'Could not open context menu for database.');
      const stopBtn = page.getByRole('button', { name: /Stop Database|데이터베이스 정지|데이터베이스 중지/i });
      const startBtn = page.getByRole('button', { name: /Start Database|데이터베이스 시작/i });
      stopVisible = await stopBtn.isVisible().catch(() => false);
      startVisible = await startBtn.isVisible().catch(() => false);
    });

    await Then('exactly one of Start or Stop database menu options is visible', async () => {
      await action('Verify exactly one of Start or Stop menu option is available', () => {
        expect(stopVisible || startVisible).toBe(true);
        expect(stopVisible && startVisible).toBe(false);
      }, 'Expected exactly one of Start or Stop database menu options to be visible.');
      await action('Dismiss context menu', () => page.mouse.click(2, 2), 'Could not dismiss context menu.');
    });
  });

  test('Scenario: Stopping a running database and restarting updates status indicator from off to on', async ({ appPage: page }) => {
    test.setTimeout(180000);
    await bddMeta({
      epic: 'Database Operations',
      feature: 'Lifecycle Controls',
      story: 'Stop and Restart Database',
    });

    const dbTree = new DatabaseTreePage(page);
    const targetDb = E2E_OFFLINE_DB;

    await Given('the database is in a running state', async () => {
      await dbTree.waitForAuthorized();
      originalRunning = await readRunning(page);
      await expect(dbTree.dbNode(targetDb)).toHaveAttribute('data-status', originalRunning ? 'on' : 'off');
      if (!originalRunning) {
        await action('Start database ' + targetDb, () => changeState(page, dbTree, 'start'));
      }
    });

    await When('the user chooses Stop Database', async () => {
      await action('Stop database and verify its indicator is off', () => changeState(page, dbTree, 'stop'));
    });

    await Then('the database transitions to stopped and can be started again', async () => {
      await action('Start database and verify its indicator is on', () => changeState(page, dbTree, 'start'));
    });
  });
});
