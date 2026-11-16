const { test, expect } = require('../fixture');
const { AuthPage } = require('../pages/AuthPage');
const { HostTreePage } = require('../pages/HostTreePage');
const { loadedEditorText, editorText } = require('../pages/codeEditor');
const { Given, When, Then, And, bddMeta, action } = require('../bdd');

const E2E_HOST_ADDRESS = process.env.E2E_HOST_ADDRESS || 'localhost';
const E2E_HOST_PORT = process.env.E2E_HOST_PORT || '8001';

test.describe('Feature: CUBRID Configuration Editor', () => {
  let hostUid;
  let configRequest;

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

    await page.getByText(/Host Service Management|호스트 서비스 관리/i).first().hover();
    await page.getByText(/Edit Config Files|설정 파일 편집|환경설정 매개변수|Config Param/i).first().hover();
    await page.getByRole('button', { name: /Edit Cubrid Config|CUBRID 설정 편집|CUBRID 환경설정 편집/i }).click();
    await page.mouse.click(2, 2).catch(() => undefined);
  });

  test('Scenario: Opening config editor loads content, typing marks dirty, and undo restores original content', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Broker & Server',
      feature: 'Configuration Editors',
      story: 'Cubrid Config Undo',
    });

    let textarea;
    let originalContent;
    let saveBtn;
    let undoBtn;

    await Given('the cubrid.conf editor tab is loaded', async () => {
      const tab = page.getByTestId(`tab-edit_config:${hostUid}:cubridconf`);
      await action('Verify cubrid.conf editor tab is open', () => expect(tab).toBeVisible({ timeout: 15000 }), 'cubrid.conf editor tab did not appear.');

      const editor = page.getByTestId('cubrid-config-editor');
      await action('Verify cubrid-config-editor container is visible', () => expect(editor).toBeVisible(), 'cubrid-config-editor container is not visible.');
      await action('Wait for Cubrid Config to finish loading', () => expect(page.getByTestId('cubrid-config-refresh-btn')).toBeEnabled({ timeout: 35000 }), 'Cubrid Config did not finish loading.');
      textarea = page.getByTestId('cubrid-config-textarea');
      await action('Verify cubrid configuration textarea is visible', () => expect(textarea).toBeVisible({ timeout: 15000 }), 'cubrid configuration textarea is not visible.');
      await expect(textarea).toBeEditable();
      await action('Verify cubrid configuration textarea has content', () => loadedEditorText(textarea, 25000).then((text) => { originalContent = text; }), 'cubrid configuration textarea remained empty.');

      saveBtn = page.getByTestId('cubrid-config-save-btn');
      undoBtn = page.getByTestId('cubrid-config-undo-btn');
      await action('Verify Save button is initially disabled', () => expect(saveBtn).toBeDisabled(), 'Save button was unexpectedly enabled initially.');
      await action('Verify Undo button is initially disabled', () => expect(undoBtn).toBeDisabled(), 'Undo button was unexpectedly enabled initially.');
    });

    await When('the user edits the configuration textarea', async () => {
      await action('Focus and type comment into cubrid configuration textarea', async () => {
        await textarea.click();
        await page.keyboard.type('# e2e test comment\n');
      }, 'Failed typing test comment into cubrid configuration textarea.');
    });

    await Then('Save and Undo buttons become enabled', async () => {
      await action('Verify Save button is enabled after edit', () => expect(saveBtn).toBeEnabled({ timeout: 10000 }), 'Save button remained disabled after modifying config.');
      await action('Verify Undo button is enabled after edit', () => expect(undoBtn).toBeEnabled({ timeout: 10000 }), 'Undo button remained disabled after modifying config.');
    });

    await And('clicking Undo reverts the content to original state', async () => {
      await action('Click Undo button to revert changes', () => undoBtn.click(), 'Could not click Undo button.');
      await action('Verify configuration reverted to original content', () => expect.poll(() => editorText(textarea), { timeout: 10000 }).toBe(originalContent), 'Editor content did not match original content after undo.');
      await action('Verify Save button is disabled after undo', () => expect(saveBtn).toBeDisabled({ timeout: 10000 }), 'Save button remained enabled after undo.');
      await action('Verify Undo button is disabled after undo', () => expect(undoBtn).toBeDisabled({ timeout: 10000 }), 'Undo button remained enabled after undo.');
    });
  });
});
