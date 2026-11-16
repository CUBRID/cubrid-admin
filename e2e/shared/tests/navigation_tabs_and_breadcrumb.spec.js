const { test, expect } = require('../fixture');
const { AuthPage } = require('../pages/AuthPage');
const { HostTreePage } = require('../pages/HostTreePage');
const { DatabaseTreePage } = require('../pages/DatabaseTreePage');
const { Given, When, Then, And, bddMeta, action } = require('../bdd');

const E2E_HOST_ADDRESS = process.env.E2E_HOST_ADDRESS || 'localhost';
const E2E_HOST_PORT = process.env.E2E_HOST_PORT || '8001';
const E2E_DB = process.env.E2E_DB || 'demodb';

test.describe('Feature: Global Navigation, Tabs & Breadcrumbs', () => {
  let dbTree;
  let hostUid;

  test.beforeEach(async ({ appPage: page }) => {
    const auth = new AuthPage(page);
    await auth.login(process.env.E2E_USERNAME, process.env.E2E_PASSWORD);

    const hostTree = new HostTreePage(page);
    const host = hostTree.hostRowByConnection(E2E_HOST_ADDRESS, E2E_HOST_PORT);
    await expect(host).toBeVisible({ timeout: 10000 });
    hostUid = await hostTree.getUidByConnection(E2E_HOST_ADDRESS, E2E_HOST_PORT);
    await hostTree.activateHost(hostUid);
    dbTree = new DatabaseTreePage(page);
  });

  test('Scenario: Switching between multiple open tabs renders the corresponding content for each tab', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Navigation & Workspace',
      feature: 'Multi-Tab Management',
      story: 'Switch Between Open Tabs',
      severity: 'critical',
    });

    let hostTab;
    let dbTab;

    await Given('the server host dashboard tab is open', async () => {
      hostTab = page.getByTestId(`tab-host:${hostUid}`);
      await action('Verify server host tab is visible', () => expect(hostTab).toBeVisible({ timeout: 10000 }), 'Server host tab was not visible.');
      await action('Verify server dashboard content is displayed', () => expect(page.getByTestId('server-dashboard')).toBeVisible(), 'Server dashboard was not visible.');
    });

    await When('the user opens a database dashboard tab', async () => {
      await action(`Open database dashboard tab for "${E2E_DB}"`, () => dbTree.openDashboardTab(E2E_DB, hostUid), `Could not open database dashboard tab for "${E2E_DB}".`);
      dbTab = page.getByTestId(`tab-db:${hostUid}:${E2E_DB}`);
      await action('Verify database dashboard tab is visible', () => expect(dbTab).toBeVisible({ timeout: 10000 }), 'Database dashboard tab did not appear.');
    });

    await Then('the database dashboard content is displayed', async () => {
      await action('Verify database dashboard content is visible', () => expect(page.getByTestId('database-dashboard')).toBeVisible(), 'Database dashboard content was not visible.');
    });

    await When('the user switches back to the server host tab', async () => {
      await action('Click server host tab', () => hostTab.click(), 'Could not click server host tab.');
    });

    await Then('the server dashboard content is restored', async () => {
      await action('Verify server dashboard content is restored', () => expect(page.getByTestId('server-dashboard')).toBeVisible(), 'Server dashboard was not restored.');
    });

    await When('the user switches back to the database dashboard tab', async () => {
      await action('Click database dashboard tab', () => dbTab.click(), 'Could not click database dashboard tab.');
    });

    await Then('the database dashboard view is displayed again', async () => {
      await action('Verify database dashboard view is displayed', () => expect(page.getByTestId('database-dashboard')).toBeVisible(), 'Database dashboard was not displayed.');
    });
  });

  test('Scenario: Closing a tab removes it and automatically activates the remaining tab', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Navigation & Workspace',
      feature: 'Multi-Tab Management',
      story: 'Close Tab and Fallback Activation',
      severity: 'normal',
    });

    let hostTab;
    let dbTab;

    await Given('both server dashboard and database dashboard tabs are open', async () => {
      hostTab = page.getByTestId(`tab-host:${hostUid}`);
      await action('Verify server host tab is visible', () => expect(hostTab).toBeVisible({ timeout: 10000 }), 'Server host tab was not visible.');

      await action(`Open database dashboard tab for "${E2E_DB}"`, () => dbTree.openDashboardTab(E2E_DB, hostUid), `Could not open database dashboard tab for "${E2E_DB}".`);
      dbTab = page.getByTestId(`tab-db:${hostUid}:${E2E_DB}`);
      await action('Verify database dashboard tab is visible', () => expect(dbTab).toBeVisible({ timeout: 10000 }), 'Database dashboard tab did not appear.');
    });

    await When('the user clicks close on the database tab', async () => {
      await action(`Click close button on database tab "${E2E_DB}"`, () => page.getByTestId(`tab-db:${hostUid}:${E2E_DB}-close`).click(), 'Could not click close button on database tab.');
    });

    await Then('the closed tab is removed and the server host tab becomes active', async () => {
      await action('Verify database dashboard tab is removed', () => expect(dbTab).not.toBeVisible(), 'Database tab remained visible after close.');
      await action('Verify server host tab is visible', () => expect(hostTab).toBeVisible(), 'Server host tab was not visible after closing database tab.');
      await action('Verify server dashboard content is active', () => expect(page.getByTestId('server-dashboard')).toBeVisible(), 'Server dashboard was not displayed after closing database tab.');
    });
  });

  test('Scenario: Closing a dirty tab prompts unsaved changes dialog with cancel and confirm discard options', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Navigation & Workspace',
      feature: 'Multi-Tab Management',
      story: 'Dirty Tab Unsaved Changes Guard',
      severity: 'critical',
    });

    let configTab;
    let confirmDialog;

    await Given('a configuration editor tab is opened with modified unsaved content', async () => {
      await action('Dismiss any active popup or context menu', () => page.mouse.click(2, 2).catch(() => undefined));
      await action('Right-click Broker tree tab', () => page.getByTestId('tree-tab-broker').click({ button: 'right' }), 'Could not right-click Broker tree tab.');
      await action('Click Edit Broker Config menu item', () => page.getByRole('button', { name: 'Edit Broker Config' }).click(), 'Could not click Edit Broker Config.');

      configTab = page.getByTestId(`tab-broker_config:${hostUid}`);
      await action('Verify Broker Config tab is visible', () => expect(configTab).toBeVisible({ timeout: 10000 }), 'Broker Config tab did not appear.');
      const textarea = page.getByTestId('broker-config-textarea');
      await action('Verify Broker Config textarea has content', () => expect(textarea).not.toHaveText('', { timeout: 15000 }), 'Broker Config textarea remained empty.');
      await action('Focus and navigate to end of textarea', async () => {
        await textarea.click();
        await textarea.press('End');
      }, 'Could not focus or move cursor in configuration textarea.');
      await action('Type dirty edit into textarea', () => page.keyboard.type('\n# e2e dirty-tab test'), 'Failed typing test comment into textarea.');
      await action('Verify Save button is enabled', () => expect(page.getByTestId('broker-config-save-btn')).toBeEnabled(), 'Save button remained disabled after modification.');
    });

    await When('the user attempts to close the modified tab', async () => {
      await action('Click close button on modified Broker Config tab', () => page.getByTestId(`tab-broker_config:${hostUid}-close`).click(), 'Could not click close button on dirty tab.');
    });

    await Then('an unsaved changes warning dialog is displayed', async () => {
      confirmDialog = page.getByTestId('close-dirty-tab-modal');
      await action('Verify unsaved changes modal is visible', () => expect(confirmDialog).toBeVisible({ timeout: 5000 }), 'Unsaved changes confirmation modal did not appear.');
      await action('Verify modal title displays Unsaved Changes', () => expect(confirmDialog.getByText(/^Unsaved Changes$|^저장하지 않은 변경 사항$/i)).toBeVisible(), 'Unsaved Changes title was not found.');
      await action('Verify modal body warning text is displayed', () => expect(confirmDialog.getByText(/unsaved changes|저장하지 않은 변경 사항/i).first()).toBeVisible(), 'Unsaved changes body warning text was not found.');
    });

    await When('the user cancels the discard action', async () => {
      await action('Click Cancel button in unsaved changes modal', () => page.getByTestId('close-dirty-tab-cancel-btn').click(), 'Could not click Cancel button.');
    });

    await Then('the modal closes and the modified tab remains open', async () => {
      await action('Verify unsaved changes modal closes', () => expect(confirmDialog).not.toBeVisible(), 'Unsaved changes modal remained visible.');
      await action('Verify Broker Config tab remains open', () => expect(configTab).toBeVisible(), 'Broker Config tab was unexpectedly closed.');
    });

    await When('the user attempts to close the tab again and confirms discard', async () => {
      await action('Click close button on modified tab again', () => page.getByTestId(`tab-broker_config:${hostUid}-close`).click(), 'Could not click close button on tab.');
      await action('Verify unsaved changes modal appears again', () => expect(confirmDialog).toBeVisible({ timeout: 5000 }), 'Unsaved changes confirmation modal did not reappear.');
      await action('Click Discard button to confirm closing dirty tab', () => page.getByTestId('close-dirty-tab-confirm-btn').click(), 'Could not click Discard confirm button.');
    });

    await Then('the tab is closed and discarded cleanly', async () => {
      await action('Verify Broker Config tab is closed', () => expect(configTab).not.toBeVisible(), 'Broker Config tab remained visible after confirming discard.');
    });
  });
});
