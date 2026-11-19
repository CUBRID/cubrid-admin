const { test, expect } = require('../fixture');
const { AuthPage } = require('../pages/AuthPage');
const { HostTreePage } = require('../pages/HostTreePage');
const { loadedEditorText, editorText } = require('../pages/codeEditor');
const { DatabaseTreePage } = require('../pages/DatabaseTreePage');
const { Given, When, Then, And, bddMeta, action } = require('../bdd');

const E2E_HOST_ADDRESS = process.env.E2E_HOST_ADDRESS || 'localhost';
const E2E_HOST_PORT = process.env.E2E_HOST_PORT || '8001';

test.describe('Feature: Broker Configuration Editor', () => {
  let hostUid;

  test.beforeEach(async ({ appPage: page }) => {
    test.setTimeout(90000);
    const auth = new AuthPage(page);
    await auth.login(process.env.E2E_USERNAME, process.env.E2E_PASSWORD);

    const hostTree = new HostTreePage(page);
    const host = hostTree.hostRowByConnection(E2E_HOST_ADDRESS, E2E_HOST_PORT);
    await expect(host).toBeVisible({ timeout: 10000 });
    hostUid = await hostTree.getUidByConnection(E2E_HOST_ADDRESS, E2E_HOST_PORT);
    await hostTree.activateHost(hostUid);
    await expect(page.getByTestId(`tab-host:${hostUid}`)).toBeVisible({ timeout: 15000 });
  });

  test('Scenario: Editing Broker Config loads content, marks dirty state on edit, and undoes changes', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Broker & Service Management',
      feature: 'Broker Configuration',
      story: 'Edit and Revert Broker Config',
    });

    let textarea;
    let originalContent;
    let saveBtn;
    let undoBtn;

    await Given('the user opens Edit Broker Config from the Broker tab context menu', async () => {
      await action('Dismiss any active popup or context menu', () => page.mouse.click(2, 2).catch(() => undefined));
      await action('Right-click Broker tree tab', () => page.getByTestId('tree-tab-broker').click({ button: 'right' }), 'Could not right-click Broker tree tab.');
      await action('Click Edit Broker Config menu item', () => page.getByRole('button', { name: /Edit Broker Config|Broker 환경설정 편집/i }).click(), 'Could not click Edit Broker Config from context menu.');

      const tab = page.getByTestId(`tab-broker_config:${hostUid}`);
      await action('Verify Broker Config tab is open', () => expect(tab).toBeVisible({ timeout: 10000 }), 'Broker Config tab did not appear.');

      const editor = page.getByTestId('broker-config-editor');
      await action('Verify Broker Config editor container is visible', () => expect(editor).toBeVisible(), 'Broker Config editor container is not visible.');
      await action('Wait for Broker Config to finish loading', () => expect(page.getByTestId('broker-config-refresh-btn')).toBeEnabled({ timeout: 25000 }), 'Broker Config did not finish loading.');
      textarea = page.getByTestId('broker-config-textarea');
      await action('Verify Broker Config textarea is visible', () => expect(textarea).toBeVisible({ timeout: 15000 }), 'Broker Config textarea is not visible.');
      await action('Verify Broker Config textarea is populated with content', () => loadedEditorText(textarea, 25000).then((text) => { originalContent = text; }), 'Broker Config textarea remained empty.');
    });

    await When('the user edits the configuration textarea content', async () => {
      saveBtn = page.getByTestId('broker-config-save-btn');
      undoBtn = page.getByTestId('broker-config-undo-btn');
      await action('Verify Save button is initially disabled', () => expect(saveBtn).toBeDisabled(), 'Save button was unexpectedly enabled before making edits.');
      await action('Verify Undo button is initially disabled', () => expect(undoBtn).toBeDisabled(), 'Undo button was unexpectedly enabled before making edits.');

      await action('Focus and type comment into configuration textarea', async () => {
        await textarea.click();
        await page.keyboard.type('# e2e test comment\n');
      }, 'Failed typing test comment into configuration textarea.');
    });

    await Then('Save and Undo buttons become enabled and Undo reverts to original content', async () => {
      await action('Verify Save button is enabled after edit', () => expect(saveBtn).toBeEnabled({ timeout: 10000 }), 'Save button remained disabled after modifying config.');
      await action('Verify Undo button is enabled after edit', () => expect(undoBtn).toBeEnabled({ timeout: 10000 }), 'Undo button remained disabled after modifying config.');

      await action('Click Undo button to revert changes', () => undoBtn.click(), 'Could not click Undo button.');
      await action('Verify configuration reverted to original content', () => expect.poll(() => editorText(textarea), { timeout: 10000 }).toBe(originalContent), 'Editor content did not match original content after undo.');
      await action('Verify Save button is disabled after undo', () => expect(saveBtn).toBeDisabled({ timeout: 10000 }), 'Save button remained enabled after undo.');
      await action('Verify Undo button is disabled after undo', () => expect(undoBtn).toBeDisabled({ timeout: 10000 }), 'Undo button remained enabled after undo.');
    });
  });
});
