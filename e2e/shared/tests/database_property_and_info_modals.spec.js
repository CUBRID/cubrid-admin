const { test, expect } = require('../fixture');
const { AuthPage } = require('../pages/AuthPage');
const { HostTreePage } = require('../pages/HostTreePage');
const { DatabaseTreePage } = require('../pages/DatabaseTreePage');
const { Given, When, Then, And, bddMeta, action } = require('../bdd');

const E2E_HOST_ADDRESS = process.env.E2E_HOST_ADDRESS || 'localhost';
const E2E_HOST_PORT = process.env.E2E_HOST_PORT || '8001';
const E2E_DB = process.env.E2E_DB || 'demodb';

test.describe('Feature: Database Properties & Diagnostic Info', () => {
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
    await dbTree.ensureDatabaseStarted(E2E_DB);
    await dbTree.openDashboardTab(E2E_DB, hostUid);
  });

  test('Scenario: Database Properties modal opens with configuration and can be discarded', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Database Operations',
      feature: 'Database Diagnostics',
      story: 'View Database Properties',
    });

    let modal;
    let loadedParams;

    await Given('the user opens Properties from database context menu', async () => {
      await action('Open context menu for database ' + E2E_DB, () => dbTree.openContextMenu(E2E_DB), 'Could not open database context menu.');
      await action('Click Properties menu item and verify configuration fetch', async () => {
        const responsePromise = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname.endsWith('/cms-config/all-sys-param')
            && url.searchParams.get('confname') === 'cubridconf'
            && response.request().method() === 'GET';
        });
        await page.getByRole('button', { name: /Properties|속성/i }).click();
        const response = await responsePromise;
        expect(response.ok()).toBe(true);
        const body = await response.json();
        const lines = (body.data ?? body)?.conflist?.[0]?.confdata;
        expect(Array.isArray(lines)).toBe(true);
        loadedParams = {};
        let section = '';
        for (const line of lines) {
          const text = line.trim();
          if (!text || text.startsWith('#')) continue;
          if (text.startsWith('[') && text.endsWith(']')) {
            section = text.slice(1, -1).toLowerCase();
          } else if (section === 'common' || section === `@${E2E_DB.toLowerCase()}`) {
            const [key, ...parts] = text.split('=');
            loadedParams[key.trim()] = parts.join('=').trim();
          }
        }
      }, 'Configuration fetch failed or did not return configuration lines.');
      modal = page.getByTestId('database-property-modal');
      await action('Verify Database Property modal is visible', () => expect(modal).toBeVisible({ timeout: 10000 }), 'Database Property modal did not appear.');
    });

    await When('the modal loads property details for the database', async () => {
      await action('Verify database name ' + E2E_DB + ' is visible in property modal', () => expect(modal.getByText(E2E_DB).first()).toBeVisible(), 'Database name was not visible in Property modal.');
      await action('Verify loaded properties are not reported as modified', async () => {
        await expect(modal.locator('table').first()).toBeVisible({ timeout: 10000 });
        const knownKey = ['max_clients', 'cubrid_port_id', 'lock_escalation', 'lock_timeout_in_secs']
          .find(key => loadedParams[key] !== undefined);
        expect(knownKey, 'Configuration must contain a known General setting').toBeTruthy();
        const row = modal.locator('table tbody tr').filter({ hasText: knownKey });
        await expect(row.locator('input')).toHaveValue(loadedParams[knownKey]);
        await expect(page.getByTestId('database-property-modified-count')).toHaveCount(0);
        await expect(page.getByTestId('database-property-apply-btn')).toBeDisabled();
      }, 'Unchanged database properties were incorrectly reported as modified.');
    });

    await Then('clicking Cancel closes the modal without applying changes', async () => {
      await action('Click Cancel button on Database Property modal', () => page.getByTestId('database-property-cancel-btn').click(), 'Could not click Cancel button on Database Property modal.');
      await action('Verify Database Property modal is closed', () => expect(modal).not.toBeVisible(), 'Database Property modal did not close after clicking cancel.');
    });
  });

  test('Scenario: Database Param Dump renders database parameter table', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Database Operations',
      feature: 'Database Diagnostics',
      story: 'Database Parameter Dump',
    });

    let modal;

    await Given('the user navigates to Database Info and selects Param Dump', async () => {
      await action('Open context menu for database ' + E2E_DB, () => dbTree.openContextMenu(E2E_DB), 'Could not open database context menu.');
      await action('Hover Database Info menu item', () => page.getByRole('button', { name: /Database Info|데이터베이스 정보/i }).hover(), 'Could not hover Database Info menu item.');
      await action('Click Param Dump menu item', () => page.getByRole('button', { name: /Param Dump|파라미터 덤프/i }).click(), 'Could not click Param Dump option.');
      modal = page.getByTestId('database-info-modal');
      await action('Verify Database Info modal is visible', () => expect(modal).toBeVisible({ timeout: 10000 }), 'Database Info modal did not appear.');
    });

    await When('the user executes the param dump query', async () => {
      await action('Click Run button to execute param dump', () => page.getByTestId('database-info-run-btn').click(), 'Could not click Run button in Database Info modal.');
    });

    await Then('the system parameters table renders with data rows', async () => {
      await action('Verify parameters table is visible', () => expect(modal.locator('table')).toBeVisible({ timeout: 30000 }), 'Parameters table was not visible.');
      await action('Verify parameter table data rows are rendered', () => expect(modal.locator('table tbody tr').first()).toBeVisible(), 'Parameter table did not contain any data rows.');
      await action('Click Close button on Database Info modal', () => page.getByTestId('database-info-close-btn').click(), 'Could not click Close button on Database Info modal.');
      await action('Verify Database Info modal is closed', () => expect(modal).not.toBeVisible(), 'Database Info modal did not close.');
    });
  });

  test('Scenario: Database Locking Information allows switching tabs and refreshing lock stats', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Database Operations',
      feature: 'Database Diagnostics',
      story: 'Locking Information Monitor',
    });

    let modal;

    await Given('the user opens Locking Information dialog', async () => {
      await action('Open context menu for database ' + E2E_DB, () => dbTree.openContextMenu(E2E_DB), 'Could not open database context menu.');
      await action('Hover Database Info menu item', () => page.getByRole('button', { name: /Database Info|데이터베이스 정보/i }).hover(), 'Could not hover Database Info menu item.');
      await action('Click Locking Information menu item', () => page.getByRole('button', { name: /Locking Information|잠금 정보/i }).click(), 'Could not click Locking Information option.');
      modal = page.getByTestId('lock-information-modal');
      await action('Verify Lock Information modal is visible', () => expect(modal).toBeVisible({ timeout: 10000 }), 'Lock Information modal did not appear.');
    });

    await When('the user switches between Sessions, Objects, and Parameters tabs', async () => {
      await action('Verify Sessions tab is visible', () => expect(modal.getByTestId('lock-information-tab-sessions')).toBeVisible(), 'Sessions tab was not visible.');
      await action('Click Objects tab in lock information modal', () => page.getByTestId('lock-information-tab-objects').click(), 'Could not click Objects tab.');
      await action('Click Parameters tab in lock information modal', () => page.getByTestId('lock-information-tab-params').click(), 'Could not click Parameters tab.');
    });

    await Then('clicking Refresh updates the lock statistics cleanly', async () => {
      await action('Click Refresh button in lock information modal', () => page.getByTestId('lock-information-refresh-btn').click(), 'Could not click Refresh button in lock information modal.');
      await action('Verify Refresh button is enabled after update', () => expect(page.getByTestId('lock-information-refresh-btn')).toBeEnabled({ timeout: 15000 }), 'Refresh button did not return to enabled state.');
      await action('Click Close button on lock information modal', () => page.getByTestId('lock-information-close-btn').click(), 'Could not click Close button on lock information modal.');
      await action('Verify Lock Information modal is closed', () => expect(modal).not.toBeVisible(), 'Lock Information modal did not close.');
    });
  });

  test('Scenario: Database Transaction Information renders active transactions view', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Database Operations',
      feature: 'Database Diagnostics',
      story: 'Transaction Information Monitor',
    });

    let modal;

    await Given('the user navigates to Database Info and selects Transaction Information', async () => {
      await action('Open context menu for database ' + E2E_DB, () => dbTree.openContextMenu(E2E_DB), 'Could not open database context menu.');
      await action('Hover Database Info menu item', () => page.getByRole('button', { name: /Database Info|데이터베이스 정보/i }).hover(), 'Could not hover Database Info menu item.');
      await action('Click Transaction Information menu item', () => page.getByRole('button', { name: /Transaction Information|트랜잭션 정보/i }).click(), 'Could not click Transaction Information option.');
      modal = page.getByTestId('transaction-info-modal');
      await action('Verify Transaction Information modal is visible', () => expect(modal).toBeVisible({ timeout: 15000 }), 'Transaction Information modal did not appear.');
    });

    await When('the active transactions panel loads', async () => {
      await action('Verify refresh button is visible in transaction info modal', () => expect(page.getByTestId('transaction-info-refresh-btn')).toBeVisible({ timeout: 10000 }), 'Refresh button was not visible in transaction information modal.');
    });

    await Then('the user can close the transaction information view', async () => {
      await action('Click Close button on transaction information modal', () => page.getByTestId('transaction-info-close-btn').click(), 'Could not click Close button on transaction information modal.');
      await action('Verify Transaction Information modal is closed', () => expect(modal).not.toBeVisible(), 'Transaction Information modal did not close.');
    });
  });

  test('Scenario: Database Plan Dump executes and switches to execution results view', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Database Operations',
      feature: 'Database Diagnostics',
      story: 'Database Plan Dump',
    });

    let modal;

    await Given('the user opens the Plan Dump dialog', async () => {
      await action('Open context menu for database ' + E2E_DB, () => dbTree.openContextMenu(E2E_DB), 'Could not open database context menu.');
      await action('Hover Database Info menu item', () => page.getByRole('button', { name: /Database Info|데이터베이스 정보/i }).hover(), 'Could not hover Database Info menu item.');
      await action('Click Plan Dump menu item', () => page.getByRole('button', { name: /Plan Dump|플랜 덤프/i }).click(), 'Could not click Plan Dump option.');
      modal = page.getByTestId('plan-dump-modal');
      await action('Verify Plan Dump modal is visible', () => expect(modal).toBeVisible({ timeout: 10000 }), 'Plan Dump modal did not appear.');
    });

    await When('the user clicks Run Plan Dump', async () => {
      await action('Click Run button to execute plan dump', () => page.getByTestId('plan-dump-run-btn').click(), 'Could not click Run button in Plan Dump modal.');
    });

    await Then('the view displays plan dump results with a Back navigation button', async () => {
      await action('Verify Back navigation button is visible in plan dump results', () => expect(page.getByTestId('plan-dump-back-btn')).toBeVisible({ timeout: 15000 }), 'Back button was not visible in plan dump results.');
      await action('Click Close button on Plan Dump modal', () => page.getByTestId('plan-dump-close-btn').click(), 'Could not click Close button on Plan Dump modal.');
      await action('Verify Plan Dump modal is closed', () => expect(modal).not.toBeVisible(), 'Plan Dump modal did not close.');
    });
  });
});
