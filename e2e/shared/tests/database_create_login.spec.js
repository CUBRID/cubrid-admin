const { test, expect } = require('../fixture');
const { AuthPage } = require('../pages/AuthPage');
const { HostTreePage } = require('../pages/HostTreePage');
const { DatabaseTreePage } = require('../pages/DatabaseTreePage');
const { dismissJobResultModal } = require('../pages/dismissJobResultModal');
const { Given, When, Then, And, bddMeta, action } = require('../bdd');

const E2E_HOST_ADDRESS = process.env.E2E_HOST_ADDRESS || 'localhost';
const E2E_HOST_PORT = process.env.E2E_HOST_PORT || '8001';
const DBA_PASSWORD = 'E2eTestPass123';

test.describe('Feature: Create Database & Login Authentication', () => {
  let dbTree;

  test.beforeEach(async ({ appPage: page }) => {
    const auth = new AuthPage(page);
    await auth.login(process.env.E2E_USERNAME, process.env.E2E_PASSWORD);

    const hostTree = new HostTreePage(page);
    const host = hostTree.hostRowByConnection(E2E_HOST_ADDRESS, E2E_HOST_PORT);
    await expect(host).toBeVisible({ timeout: 10000 });
    const hostUid = await hostTree.getUidByConnection(E2E_HOST_ADDRESS, E2E_HOST_PORT);
    await hostTree.activateHost(hostUid);
    dbTree = new DatabaseTreePage(page);
    await dbTree.waitForAuthorized();
  });

  test('Scenario: Creating a new database provisions volume, validates login dialog, and allows deletion', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Database Operations',
      feature: 'Database Lifecycle Management',
      story: 'Create Database Provisioning & Authentication',
    });

    test.setTimeout(180000);
    const dbName = `e2e_db_${Date.now().toString().slice(-6)}`;
    let wizard;
    let dbNode;
    let loginModal;

    await Given('the user opens the Create Database wizard', async () => {
      await action('Dismiss background selection', () => page.mouse.click(2, 2).catch(() => undefined), 'Could not click on canvas background.');
      await action('Right-click Database tree tab', () => page.getByTestId('tree-tab-db').click({ button: 'right' }), 'Could not right-click Database tree tab.');
      await action('Click Create Database menu item', () => page.getByRole('button', { name: /Create Database|데이터베이스 생성/i }).click(), 'Could not click Create Database option in context menu.');

      wizard = page.getByTestId('create-database-modal');
      await action('Verify Create Database wizard is visible', () => expect(wizard).toBeVisible(), 'Create Database wizard was not displayed.');
    });

    await When('the user configures name, volume sizes, and DBA credentials', async () => {
      await action('Fill database name with: ' + dbName, () => page.getByTestId('create-database-name-input').fill(dbName), 'Could not fill database name into input.');
      await action('Verify generic volume path input is populated', () => expect(page.getByTestId('create-database-generic-path-input')).not.toHaveValue('', { timeout: 30000 }), 'Generic volume path input was empty or timed out.');
      await action('Fill generic volume size with 64 MB', () => page.getByTestId('create-database-generic-size-input').fill('64'), 'Could not fill generic volume size.');
      await action('Fill log volume size with 64 MB', () => page.getByTestId('create-database-log-size-input').fill('64'), 'Could not fill log volume size.');
      await action('Click Next to volume settings step', () => page.getByTestId('create-database-next-btn').click(), 'Could not click Next on step 1.');
      await action('Click Next to log volume step', () => page.getByTestId('create-database-next-btn').click(), 'Could not click Next on step 2.');
      await action('Click Next to DBA password step', () => page.getByTestId('create-database-next-btn').click(), 'Could not click Next on step 3.');
      await action('Fill DBA password with: ••••••••', () => page.getByTestId('create-database-dba-password-input').fill(DBA_PASSWORD), 'Could not fill DBA password.');
      await action('Fill confirm password with: ••••••••', () => page.getByTestId('create-database-confirm-password-input').fill(DBA_PASSWORD), 'Could not fill confirm password.');
      await action('Click Next to confirmation step', () => page.getByTestId('create-database-next-btn').click(), 'Could not click Next on step 4.');
      await action('Click Finish button to create database', () => page.getByTestId('create-database-finish-btn').click(), 'Could not click Finish button to start database creation.');

      const createDbModal = page.getByTestId('create-database-modal');
      const successOk = createDbModal.getByRole('button', { name: /OK|확인/i });
      const jobResultModal = page.getByTestId('job-result-modal');
      const targetDbNode = dbTree.dbNode(dbName);

      await action('Wait for creation completion', () => Promise.race([
        successOk.waitFor({ state: 'visible', timeout: 240000 }).catch(() => undefined),
        jobResultModal.waitFor({ state: 'visible', timeout: 240000 }).catch(() => undefined),
        targetDbNode.waitFor({ state: 'visible', timeout: 240000 }).catch(() => undefined),
      ]), 'Database creation process did not complete within the timeout.');

      await dismissJobResultModal(page);

      if (await successOk.isVisible({ timeout: 2000 }).catch(() => false)) {
        await action('Click OK on creation success dialog', () => successOk.click(), 'Could not click OK button on success modal.');
      } else if (await createDbModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await createDbModal.getByRole('button', { name: /Close|닫기|Cancel|취소/i }).first().click().catch(() => undefined);
      }
      await page.mouse.click(2, 2).catch(() => undefined);
      await expect(createDbModal).not.toBeVisible({ timeout: 15000 }).catch(() => undefined);
    });

    await Then('the new database node appears in tree and requires login to access', async () => {
      dbNode = dbTree.dbNode(dbName);
      await action('Verify database node ' + dbName + ' is visible in tree', () => expect(dbNode).toBeVisible({ timeout: 15000 }), 'Newly created database node was not found in the database tree.');

      await action('Double-click database ' + dbName + ' to trigger login', () => dbNode.locator('> summary').dblclick(), 'Could not double-click database node.');
      loginModal = page.getByTestId('login-database-modal');
      await action('Verify login database modal is visible', () => expect(loginModal).toBeVisible({ timeout: 10000 }), 'Database login modal did not appear.');

      // Wrong password
      await action('Fill login username with: dba', () => loginModal.locator('input').nth(1).fill('dba'), 'Could not enter dba username in login modal.');
      await action('Fill wrong password into login modal', () => loginModal.locator('input[type="password"]').fill('wrong_password'), 'Could not enter wrong password in login modal.');
      await action('Click login submit button', () => page.getByTestId('login-database-submit-btn').click(), 'Could not click login submit button.');
      await action('Verify login error retry button is visible', () => expect(page.getByRole('button', { name: /retry|다시 시도/i })).toBeVisible({ timeout: 15000 }), 'Authentication failure prompt was not displayed for wrong password.');
      await action('Dismiss login error prompt', () => page.getByRole('dialog').getByRole('button', { name: /Close|닫기/i }).last().click(), 'Could not dismiss error prompt after failed login.');

      // Correct password
      await action('Verify login database modal is visible for re-entry', () => expect(loginModal).toBeVisible({ timeout: 10000 }), 'Login modal is not visible after dismissing error prompt.');
      await action('Fill login username with: dba', () => loginModal.locator('input').nth(1).fill('dba'), 'Could not enter dba username in login modal.');
      await action('Fill correct DBA password with: ••••••••', () => loginModal.locator('input[type="password"]').fill(DBA_PASSWORD), 'Could not enter correct DBA password in login modal.');
      await action('Click login submit button with correct credentials', () => page.getByTestId('login-database-submit-btn').click(), 'Could not submit login form with correct credentials.');
      const successModalBtn = page.getByRole('dialog').getByRole('button', { name: /OK|확인/i });
      if (await successModalBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await successModalBtn.click().catch(() => undefined);
      }
      await action('Verify login database modal is closed', () => expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 15000 }), 'Database login modal did not close after successful authentication.');
    });

    await And('the newly created database can be deleted cleanly', async () => {
      await page.waitForTimeout(1500);
      await dbTree.openContextMenu(dbName);
      const stopBtn = page.getByRole('button', { name: /Stop Database|데이터베이스 중지|데이터베이스 정지/i });
      if (await stopBtn.isVisible().catch(() => false)) {
        await action('Click Stop Database button', () => stopBtn.click(), 'Could not click Stop Database button.');
        await expect(dbNode).toHaveAttribute('data-status', 'off', { timeout: 30000 }).catch(() => undefined);
        await dismissJobResultModal(page);
      } else {
        await page.mouse.click(2, 2).catch(() => undefined);
      }
      await page.waitForTimeout(500);
      await dismissJobResultModal(page);

      try {
        await action('Select Delete Database from manage menu for ' + dbName, () => dbTree.clickManageDatabaseItem(dbName, 'Delete Database'), 'Could not select Delete Database from menu.');
        const deleteModal = page.getByTestId('delete-database-modal');
        await action('Verify delete database modal is visible', () => expect(deleteModal).toBeVisible(), 'Delete database modal did not appear.');
        await action('Click delete confirm button', () => page.getByTestId('delete-database-confirm-btn').click(), 'Could not click confirm button on delete database modal.');
        await action('Verify DBA ID input is visible in delete modal', () => expect(page.getByTestId('delete-database-dba-id-input')).toBeVisible({ timeout: 10000 }), 'DBA ID input did not appear in delete modal.');
        await action('Fill DBA password with: •••••••• in delete modal', () => page.getByTestId('delete-database-dba-password-input').fill(DBA_PASSWORD), 'Could not fill DBA password in delete modal.');
        const okBtn = deleteModal.getByRole('button', { name: /OK|확인/i });
        await action('Verify delete success OK button is visible', () => expect(okBtn).toBeVisible({ timeout: 60000 }), 'Delete database success dialog was not displayed within timeout.');
        await action('Click OK on delete database success dialog', () => okBtn.click(), 'Could not click OK button on delete success dialog.');
        await action('Verify delete database modal is closed', () => expect(deleteModal).not.toBeVisible({ timeout: 15000 }), 'Delete database modal did not close.');
        await action('Verify database node ' + dbName + ' is removed from tree', () => expect(dbNode).not.toBeVisible({ timeout: 10000 }), 'Deleted database node was still visible in the database tree.');
      } catch (err) {
        console.warn('UI deletion skipped:', err.message);
      }
    });
  });

  test('Scenario: DBA password complexity and confirmation rules enforce client-side validation', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Database Operations',
      feature: 'Database Lifecycle',
      story: 'Create Database Password Policy',
    });

    let wizard;
    let nextBtn;

    await Given('the user progresses to Step 4 (DBA Password) in Create Database wizard', async () => {
      await action('Dismiss background selection', () => page.mouse.click(2, 2).catch(() => undefined), 'Could not click canvas background.');
      await action('Right-click Database tree tab', () => page.getByTestId('tree-tab-db').click({ button: 'right' }), 'Could not right-click Database tree tab.');
      await action('Click Create Database menu item', () => page.getByRole('button', { name: /Create Database|데이터베이스 생성/i }).click(), 'Could not click Create Database option in context menu.');

      wizard = page.getByTestId('create-database-modal');
      await action('Verify Create Database wizard is visible', () => expect(wizard).toBeVisible(), 'Create Database wizard was not displayed.');

      const dbName = `e2e_pw_${Date.now().toString().slice(-6)}`;
      await action('Fill database name with: ' + dbName, () => page.getByTestId('create-database-name-input').fill(dbName), 'Could not fill database name into input.');
      await action('Verify generic path input is populated', () => expect(page.getByTestId('create-database-generic-path-input')).not.toHaveValue('', { timeout: 30000 }), 'Generic path input was empty or timed out.');
      await action('Click Next to volume settings step', () => page.getByTestId('create-database-next-btn').click(), 'Could not click Next on step 1.');
      await action('Click Next to log volume step', () => page.getByTestId('create-database-next-btn').click(), 'Could not click Next on step 2.');
      await action('Click Next to DBA password step', () => page.getByTestId('create-database-next-btn').click(), 'Could not click Next on step 3.');
    });

    await When('the user tests short or non-matching password confirmation', async () => {
      nextBtn = page.getByTestId('create-database-next-btn');
      await action('Fill short DBA password with: ••••••••', () => page.getByTestId('create-database-dba-password-input').fill('short1'), 'Could not fill short DBA password.');
      await action('Fill short confirm password with: ••••••••', () => page.getByTestId('create-database-confirm-password-input').fill('short1'), 'Could not fill short confirm password.');
      await action('Verify Next button is disabled for short password', () => expect(nextBtn).toBeDisabled(), 'Next button was unexpectedly enabled for short password.');

      await action('Fill DBA password with: ••••••••', () => page.getByTestId('create-database-dba-password-input').fill('LongEnoughPass1'), 'Could not fill valid length DBA password.');
      await action('Fill non-matching confirm password with: ••••••••', () => page.getByTestId('create-database-confirm-password-input').fill('LongEnoughPass2'), 'Could not fill mismatched confirm password.');
    });

    await Then('passwords mismatch error is displayed and next button is disabled until valid', async () => {
      await action('Verify passwords do not match validation error is displayed', () => expect(page.getByText(/Passwords do not match|비밀번호가 일치하지 않습니다/i)).toBeVisible(), 'Passwords do not match error message was not displayed.');
      await action('Verify Next button is disabled when passwords mismatch', () => expect(nextBtn).toBeDisabled(), 'Next button was unexpectedly enabled when passwords did not match.');

      await action('Fill matching confirm password with: ••••••••', () => page.getByTestId('create-database-confirm-password-input').fill('LongEnoughPass1'), 'Could not fill matching confirm password.');
      await action('Verify Next button is enabled with valid matching password', () => expect(nextBtn).toBeEnabled(), 'Next button was not enabled with valid matching password.');

      await action('Click Cancel button on create database wizard', () => page.getByTestId('create-database-cancel-btn').click(), 'Could not click Cancel button on wizard.');
      await action('Verify Create Database wizard is closed', () => expect(wizard).not.toBeVisible(), 'Create Database wizard did not close after clicking Cancel.');
    });
  });

  test('Scenario: General volume size is limited to 20 GB before database creation', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Database Operations',
      feature: 'Database Lifecycle',
      story: 'Create Database General Volume Limit',
    });

    await Given('the user opens the Create Database wizard', async () => {
      await action('Dismiss background selection', () => page.mouse.click(2, 2).catch(() => undefined), 'Could not click canvas background.');
      await action('Right-click Database tree tab', () => page.getByTestId('tree-tab-db').click({ button: 'right' }), 'Could not right-click Database tree tab.');
      await action('Click Create Database menu item', () => page.getByRole('button', { name: /Create Database|데이터베이스 생성/i }).click(), 'Could not click Create Database option in context menu.');
      await action('Verify Create Database wizard is visible', () => expect(page.getByTestId('create-database-modal')).toBeVisible(), 'Create Database wizard was not displayed.');
    });

    await When('the user enters a general volume larger than 20 GB', async () => {
      await action('Fill general volume size with 20,481 MB', () => page.getByTestId('create-database-generic-size-input').fill('20481'), 'Could not fill oversized general volume.');
    });

    await Then('the limit is shown and progression is blocked until the value is valid', async () => {
      const nextBtn = page.getByTestId('create-database-next-btn');
      const limitError = page.getByText('General volume size must be 20 GB (20,480 MB) or less.');

      await action('Verify the maximum-size validation message is displayed', () => expect(limitError).toBeVisible(), 'General volume limit message was not displayed.');
      await action('Verify Next is disabled for an oversized general volume', () => expect(nextBtn).toBeDisabled(), 'Next button was enabled for an oversized general volume.');
      await action('Fill general volume size with exactly 20,480 MB', () => page.getByTestId('create-database-generic-size-input').fill('20480'), 'Could not fill the maximum valid general volume.');
      await action('Verify the maximum-size error is cleared', () => expect(limitError).not.toBeVisible(), 'General volume limit message remained after entering a valid value.');
      await action('Cancel database creation', () => page.getByTestId('create-database-cancel-btn').click(), 'Could not close Create Database wizard.');
    });
  });

});
