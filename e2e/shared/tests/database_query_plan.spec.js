const { test, expect } = require('../fixture');
const { AuthPage } = require('../pages/AuthPage');
const { HostTreePage } = require('../pages/HostTreePage');
const { DatabaseTreePage } = require('../pages/DatabaseTreePage');
const { Given, When, Then, And, bddMeta, action } = require('../bdd');
const { randomUUID } = require('node:crypto');

const E2E_HOST_ADDRESS = process.env.E2E_HOST_ADDRESS || 'localhost';
const E2E_HOST_PORT = process.env.E2E_HOST_PORT || '8001';
const E2E_DB = process.env.E2E_DB || 'demodb';

test.describe('Feature: Database Query Plan Automation', () => {
  let dbTree;
  let ownedPlanId;
  let cleanupTarget;

  async function submitPlan(page, operation, submit, expectedCode) {
    let writeResponded = false;
    // Successful writes refresh the tree asynchronously. Observe that request
    // separately so a CMS refresh timeout is not misreported as a missing node.
    const refreshed = expectedCode || operation === 'remove' ? Promise.resolve(null) : page.waitForResponse(response =>
      writeResponded && response.request().method() === 'GET'
      && response.url().endsWith(`/auto-exec-query/${encodeURIComponent(E2E_DB)}`),
    { timeout: 65000 }).then(response => ({ response }), error => ({ error }));
    const [response] = await Promise.all([
      page.waitForResponse(response => {
        const request = response.request();
        if (request.method() !== 'POST' || !response.url().endsWith(`/auto-exec-query/${encodeURIComponent(E2E_DB)}/${operation}`)) return false;
        const body = request.postDataJSON();
        const matches = (body?.plan?.query_id || body?.query_id) === ownedPlanId;
        if (matches) writeResponded = true;
        return matches;
      }, { timeout: 65000 }).catch(() => {
        throw new Error(`Query-plan ${operation} API did not respond within 65s (check CMS execution/queue timings).`);
      }),
      submit(),
    ]);
    const body = await response.json();
    const data = body.data || body;
    if (expectedCode) {
      expect(response.ok(), `Expected ${expectedCode}, received HTTP ${response.status()}`).toBe(false);
      expect(data.code).toBe(expectedCode);
    } else {
      expect(response.ok(), `Query-plan ${operation} API returned HTTP ${response.status()} (${data.code || body.note || 'unknown error'})`).toBe(true);
      expect(data.success).toBe(true);
      if (operation === 'remove') cleanupTarget = null;
      const refresh = await refreshed;
      if (refresh?.error) throw new Error(`Query-plan ${operation} succeeded, but the tree refresh API did not respond within 65s.`);
      if (refresh) {
        expect(refresh.response.ok(), `Query-plan ${operation} succeeded, but tree refresh returned HTTP ${refresh.response.status()}`).toBe(true);
        const refreshedBody = await refresh.response.json();
        const plans = (refreshedBody.data || refreshedBody).planlist
          ?.find(plan => plan.dbname === E2E_DB)?.queryplan || [];
        const saved = plans.filter(plan => plan.query_id === ownedPlanId);
        expect(saved, 'The saved query plan must appear exactly once in CMS').toHaveLength(1);
        expect(saved[0].query_string.trim()).toBe(operation === 'update' ? 'SELECT 2 FROM db_root;' : 'SELECT 1 FROM db_root;');
      }
    }
  }

  test.beforeEach(async ({ appPage: page }) => {
    test.setTimeout(180000);
    ownedPlanId = `e2e_query_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    cleanupTarget = null;
    // Capture only this test's attempted create. Even if its response or a UI
    // assertion fails, teardown removes this exact ID, never other test data.
    page.on('request', request => {
      if (request.method() !== 'POST' || !request.url().endsWith(`/auto-exec-query/${encodeURIComponent(E2E_DB)}/append`)) return;
      if (request.postDataJSON()?.plan?.query_id !== ownedPlanId) return;
      cleanupTarget = {
        url: request.url().replace(/\/append$/, '/remove'),
        queryId: ownedPlanId,
      };
    });
    const auth = new AuthPage(page);
    await auth.login(process.env.E2E_USERNAME, process.env.E2E_PASSWORD);

    const hostTree = new HostTreePage(page);
    const host = hostTree.hostRowByConnection(E2E_HOST_ADDRESS, E2E_HOST_PORT);
    await expect(host).toBeVisible({ timeout: 10000 });
    const hostUid = await hostTree.getUidByConnection(E2E_HOST_ADDRESS, E2E_HOST_PORT);
    await hostTree.activateHost(hostUid);
    dbTree = new DatabaseTreePage(page);
    await dbTree.waitForAuthorized();
    await dbTree.ensureDatabaseStarted(E2E_DB);
    await dbTree.openDashboardTab(E2E_DB, hostUid);
  });

  test.afterEach(async ({ appPage: page }) => {
    if (!cleanupTarget) return;
    test.setTimeout(70000);
    await action('Clean up this test query plan even after assertion failure', async () => {
      // Same-origin fetch works for both web and Electron's app:// API proxy.
      // The server's plan mutex also orders this after an outstanding update.
      const result = await page.evaluate(async ({ url, queryId }) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CWM-Request': '1' },
          body: JSON.stringify({ query_id: queryId }),
          signal: AbortSignal.timeout(65000),
        });
        const body = await response.json();
        return { ok: response.ok, status: response.status, code: (body.data || body).code };
      }, cleanupTarget);
      expect(result.ok || result.code === 'QUERY_PLAN_NOT_FOUND',
        `Cleanup failed for ${ownedPlanId}: HTTP ${result.status}, ${result.code || 'unknown error'}`).toBe(true);
    });
  });

  test('Scenario: Creating a query plan adds it to tree, editing and removing deletes it', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Database Operations',
      feature: 'Job Automation',
      story: 'Create, Edit, and Delete Query Plan',
    });

    let planFolder;
    let planItem;
    const queryId = ownedPlanId;

    await Given('the user expands Query Plan automation folder and opens Add modal', async () => {
      let jobFolder;
      await action(`Expand "Job automation" node for "${E2E_DB}"`, async () => {
        jobFolder = await dbTree.expandSubNode(E2E_DB, 'Job automation');
      }, 'Failed to expand Job automation sub-node.');
      planFolder = jobFolder.getByTestId('tree-node-Query Plan');
      await action('Verify "Query Plan" folder node is visible', () => expect(planFolder).toBeVisible({ timeout: 10000 }), 'Query Plan folder node did not appear.');
      await action('Right-click Query Plan folder in tree', () => planFolder.locator('> summary').click({ button: 'right' }), 'Could not right-click Query Plan folder.');
      await action('Click Add Query Plan menu item', () => page.getByRole('button', { name: /Add Query Plan|질의 자동화 계획 추가/i }).click(), 'Could not click Add Query Plan context menu option.');
    });

    await When('the user fills SQL query details and saves', async () => {
      const addModal = page.getByTestId('add-query-plan-modal');
      await action('Verify Add Query Plan modal is visible', () => expect(addModal).toBeVisible(), 'Add Query Plan modal did not appear.');
      await action(`Fill query plan ID with: ${queryId}`, () => addModal.locator('input').first().fill(queryId), 'Could not fill query plan ID.');
      await action('Fill database password with: ••••••••', () => addModal.locator('input[type="password"]').fill('public'), 'Could not fill database password.');
      await action('Click SQL query editor', () => addModal.getByTestId('add-query-plan-sql').click(), 'Could not click SQL query editor.');
      await action('Type SQL query statement', () => page.keyboard.type('SELECT 1 FROM db_root;'), 'Failed to type SQL query statement.');
      await action('Save query plan and verify API success', () => submitPlan(page, 'append', () => page.getByTestId('add-query-plan-save-btn').click()));

      await action('Verify "Query Plan Added" success notification', () => expect(page.getByText(/Query Plan Added|질의 자동화 계획 추가 완료|추가 완료/i).first()).toBeVisible({ timeout: 15000 }), 'Query Plan Added success message did not appear.');
      await action('Click OK button on success confirmation', () => page.getByTestId('modal-status-confirm-btn').click(), 'Could not click OK button on confirmation.');
    });

    await Then('the query plan appears under the tree and can be edited', async () => {
      await action('Ensure Query Plan folder is expanded', async () => {
        const isOpen = await planFolder.evaluate((el) => el.open).catch(() => false);
        if (!isOpen) await planFolder.locator('> summary').click();
      }, 'Failed to expand Query Plan folder.');
      planItem = dbTree.planItem(E2E_DB, queryId);
      await action(`Verify query plan "${queryId}" is visible in tree`, () => expect(planItem).toBeVisible({ timeout: 10000 }), `Query plan "${queryId}" was not found in tree.`);

      await action(`Right-click query plan "${queryId}"`, () => planItem.click({ button: 'right' }), `Could not right-click query plan "${queryId}".`);
      await action('Click Edit Query Plan menu item', () => page.getByRole('button', { name: /Edit Query Plan|질의 자동화 계획 편집/i }).click(), 'Could not click Edit Query Plan context menu option.');
      const editModal = page.getByTestId('edit-query-plan-modal');
      await action('Verify Edit Query Plan modal is visible', () => expect(editModal).toBeVisible(), 'Edit Query Plan modal did not appear.');
      await action('Fill database password with: ••••••••', () => editModal.locator('input[type="password"]').fill('public'), 'Could not fill database password in Edit modal.');
      await action('Change the SQL statement before saving the edit', async () => {
        await editModal.getByTestId('edit-query-plan-sql').click();
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.insertText('SELECT 2 FROM db_root;');
      });
      await action('Save edited query plan and verify API success', () => submitPlan(page, 'update', () => page.getByTestId('edit-query-plan-save-btn').click()));
      await action('Verify "Update Successful" notification', () => expect(page.getByRole('dialog').getByTestId('modal-status-confirm-btn')).toBeVisible(), 'Update confirmation did not appear after API success.');
      await expect(page.getByRole('dialog')).toContainText(/Update Successful|갱신 성공|Plan Updated/i);
      await action('Click OK button on update confirmation', () => page.getByTestId('modal-status-confirm-btn').click(), 'Could not click OK button on update confirmation.');
    });

    await And('the query plan can be removed completely', async () => {
      await action(`Right-click query plan "${queryId}" for removal`, () => planItem.click({ button: 'right' }), `Could not right-click query plan "${queryId}".`);
      await action('Click Remove menu item', () => page.getByRole('button', { name: /Remove|삭제/i }).click(), 'Could not click Remove context menu option.');
      const deleteModal = page.getByTestId('delete-query-plan-modal');
      await action('Verify Delete Query Plan confirmation modal is visible', () => expect(deleteModal).toBeVisible(), 'Delete Query Plan modal did not appear.');
      await action('Delete query plan and verify API success', () => submitPlan(page, 'remove', () => page.getByTestId('delete-query-plan-confirm-btn').click()));
      await action('Verify "Deletion Success" notification', () => expect(page.getByText(/Deletion Success|삭제 성공/i).first()).toBeVisible({ timeout: 15000 }), 'Deletion Success message did not appear.');
      await action('Verify Delete Query Plan modal is dismissed', () => expect(deleteModal).not.toBeVisible({ timeout: 10000 }), 'Delete Query Plan modal remained visible.');
      await action(`Verify query plan "${queryId}" is removed from tree`, () => expect(planItem).not.toBeVisible({ timeout: 65000 }), `Query plan "${queryId}" was still visible in the tree after deletion.`);
    });
  });

  test('Scenario: Adding a duplicate query_id is rejected by CMS with error', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Database Operations',
      feature: 'Job Automation',
      story: 'Duplicate Query Plan ID Validation',
    });

    let planFolder;
    await action(`Expand "Job automation" node for "${E2E_DB}"`, async () => {
      const jobFolder = await dbTree.expandSubNode(E2E_DB, 'Job automation');
      planFolder = jobFolder.getByTestId('tree-node-Query Plan');
    }, 'Failed to expand Job automation sub-node.');
    await action('Verify "Query Plan" folder node is visible', () => expect(planFolder).toBeVisible({ timeout: 10000 }), 'Query Plan folder node did not appear.');
    const queryId = ownedPlanId;

    const fillAndSubmit = async (addModal, expectedCode) => {
      await action(`Fill query plan ID with: ${queryId}`, () => addModal.locator('input').first().fill(queryId), 'Could not fill query plan ID.');
      await action('Fill database password with: ••••••••', () => addModal.locator('input[type="password"]').fill('public'), 'Could not fill database password.');
      await action('Click SQL query editor', () => addModal.getByTestId('add-query-plan-sql').click(), 'Could not click SQL query editor.');
      await action('Type SQL query statement', () => page.keyboard.type('SELECT 1 FROM db_root;'), 'Failed to type SQL query statement.');
      await action('Submit query plan and verify API result', () => submitPlan(page, 'append', () => page.getByTestId('add-query-plan-save-btn').click(), expectedCode));
    };

    await Given('a query plan is already registered', async () => {
      await action('Right-click Query Plan folder in tree', () => planFolder.locator('> summary').click({ button: 'right' }), 'Could not right-click Query Plan folder.');
      await action('Click Add Query Plan menu item', () => page.getByRole('button', { name: /Add Query Plan|질의 자동화 계획 추가/i }).click(), 'Could not click Add Query Plan option.');
      const addModal = page.getByTestId('add-query-plan-modal');
      await action('Verify Add Query Plan modal is visible', () => expect(addModal).toBeVisible(), 'Add Query Plan modal did not appear.');
      await fillAndSubmit(addModal);
      await action('Verify "Query Plan Added" success notification', () => expect(page.getByText(/Query Plan Added|질의 자동화 계획 추가 완료|추가 완료/i).first()).toBeVisible({ timeout: 15000 }), 'Query Plan Added message did not appear.');
      await action('Click OK button on success confirmation', () => page.getByTestId('modal-status-confirm-btn').click(), 'Could not click OK button.');
    });

    await When('the user submits another plan with identical query_id', async () => {
      await action('Right-click Query Plan folder in tree', () => planFolder.locator('> summary').click({ button: 'right' }), 'Could not right-click Query Plan folder.');
      await action('Click Add Query Plan menu item', () => page.getByRole('button', { name: /Add Query Plan|질의 자동화 계획 추가/i }).click(), 'Could not click Add Query Plan option.');
      const addModal = page.getByTestId('add-query-plan-modal');
      await action('Verify Add Query Plan modal is visible', () => expect(addModal).toBeVisible(), 'Add Query Plan modal did not appear.');
      await fillAndSubmit(addModal, 'DUPLICATE_QUERY_ID');

      await action('Verify Operation Interrupted error is displayed for duplicate ID', () => expect(page.getByRole('dialog').getByRole('heading', { name: /Operation Interrupted|작업 중단됨|Operation Failed|작업 실패|Add Query Plan Failed|오류|Error/i }).first()).toBeVisible({ timeout: 15000 }), 'Operation Interrupted error message was not displayed.');
      await action('Click Close button on error dialog', () => page.getByTestId('modal-status-cancel-btn').click(), 'Could not click Close button on error dialog.');
      await action('Click Cancel/Close on Add Query Plan modal', () => page.getByTestId('add-query-plan-modal-close').click(), 'Could not close Add Query Plan modal.');
      await action('Verify Add Query Plan modal is dismissed', () => expect(addModal).not.toBeVisible(), 'Add Query Plan modal remained open.');
    });

    await Then('the original plan remains intact in the list', async () => {
      await action('Ensure Query Plan folder is expanded', async () => {
        const isOpen = await planFolder.evaluate((el) => el.open).catch(() => false);
        if (!isOpen) await planFolder.locator('> summary').click();
      }, 'Failed to expand Query Plan folder.');
      const planItem = dbTree.planItem(E2E_DB, queryId);
      await action(`Verify original query plan "${queryId}" is visible in tree`, () => expect(planItem).toBeVisible({ timeout: 10000 }), `Original query plan "${queryId}" was not found in tree.`);

      // Clean up
      await action(`Right-click query plan "${queryId}" for cleanup`, () => planItem.click({ button: 'right' }), `Could not right-click query plan "${queryId}".`);
      await action('Click Remove menu item for cleanup', () => page.getByRole('button', { name: /Remove|삭제/i }).click(), 'Could not click Remove option.');
      await action('Delete query plan and verify API success', () => submitPlan(page, 'remove', () => page.getByTestId('delete-query-plan-confirm-btn').click()));
      await action('Verify "Deletion Success" notification', () => expect(page.getByText(/Deletion Success|삭제 성공/i).first()).toBeVisible({ timeout: 15000 }), 'Deletion Success message did not appear.');
      await action(`Verify query plan "${queryId}" is removed from tree`, () => expect(planItem).not.toBeVisible({ timeout: 65000 }), `Query plan "${queryId}" was still visible after cleanup.`);
    });
  });
});
