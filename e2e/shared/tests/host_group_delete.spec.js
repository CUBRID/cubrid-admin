const { test, expect } = require('../fixture');
const { AuthPage } = require('../pages/AuthPage');
const { Given, When, Then, And, bddMeta, action } = require('../bdd');

test.describe('Feature: Host Group Deletion', () => {
  test.beforeEach(async ({ appPage: page }) => {
    const auth = new AuthPage(page);
    await auth.login(process.env.E2E_USERNAME, process.env.E2E_PASSWORD);
  });

  async function createGroup(page, groupName) {
    await action('Click new group toolbar button', () => page.getByTestId('new-group-toolbar-btn').click(), 'Could not click new group toolbar button.');
    const modal = page.getByTestId('group-name-modal');
    await action('Fill group name with: ' + groupName, () => modal.locator('input[name="groupName"]').fill(groupName), 'Could not type group name into input.');
    await action('Click group name submit button', () => page.getByTestId('group-name-submit-btn').click(), 'Could not click group name submit button.');
    await action('Verify group name modal is closed', () => expect(modal).not.toBeVisible({ timeout: 10000 }), 'Group name modal did not close after creating group.');
  }

  test('Scenario: Deleting an empty group removes it permanently from the list', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Host Management',
      feature: 'Host Groups',
      story: 'Delete Empty Group',
    });

    const groupName = `E2E_GroupDel_${Date.now().toString().slice(-6)}`;
    let group;

    await Given('an empty host group exists in the list', async () => {
      await createGroup(page, groupName);
      group = page.locator('#host-section').locator('details').filter({ hasText: groupName }).first();
      await action('Verify group ' + groupName + ' is visible in host tree', () => expect(group).toBeVisible({ timeout: 10000 }), 'Created group was not visible in the host tree.');
    });

    await When('the user right-clicks the group and confirms Delete Group', async () => {
      await action('Right-click group ' + groupName + ' summary', () => group.locator('> summary').click({ button: 'right' }), 'Could not right-click on group summary.');
      await action('Click Delete Group context menu option', () => page.getByRole('button', { name: /Delete Group/i }).click(), 'Could not click Delete Group option in context menu.');

      const modal = page.getByTestId('delete-group-modal');
      await action('Verify delete group modal is visible', () => expect(modal).toBeVisible(), 'Delete group confirmation modal was not displayed.');
      await action('Click confirm delete group button', () => page.getByTestId('delete-group-confirm-btn').click(), 'Could not click confirm button in delete group modal.');
      await action('Verify delete group modal is closed', () => expect(modal).not.toBeVisible({ timeout: 10000 }), 'Delete group modal did not close after confirming.');
    });

    await Then('the deleted group is no longer visible in the host tree', async () => {
      await action('Verify deleted group ' + groupName + ' is not visible', () => expect(page.locator('#host-section').getByText(groupName)).not.toBeVisible({ timeout: 5000 }), 'Deleted group was still visible in the host tree.');
    });
  });

  test('Scenario: Cancelling group deletion preserves the group in the tree', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Host Management',
      feature: 'Host Groups',
      story: 'Cancel Group Deletion',
    });

    const groupName = `E2E_GroupKeep_${Date.now().toString().slice(-6)}`;
    let group;

    await Given('a host group is present in the list', async () => {
      await createGroup(page, groupName);
      group = page.locator('#host-section').locator('details').filter({ hasText: groupName }).first();
      await action('Verify group ' + groupName + ' is visible in host tree', () => expect(group).toBeVisible({ timeout: 10000 }), 'Created group was not visible in the host tree.');
    });

    await When('the user opens the delete confirmation modal but clicks Cancel', async () => {
      await action('Right-click group ' + groupName + ' summary', () => group.locator('> summary').click({ button: 'right' }), 'Could not right-click on group summary.');
      await action('Click Delete Group context menu option', () => page.getByRole('button', { name: /Delete Group/i }).click(), 'Could not click Delete Group option in context menu.');

      const modal = page.getByTestId('delete-group-modal');
      await action('Verify delete group modal is visible', () => expect(modal).toBeVisible(), 'Delete group confirmation modal was not displayed.');
      await action('Click cancel delete group button', () => page.getByTestId('delete-group-cancel-btn').click(), 'Could not click cancel button in delete group modal.');
      await action('Verify delete group modal is closed', () => expect(modal).not.toBeVisible(), 'Delete group modal did not close after clicking cancel.');
    });

    await Then('the group remains visible in the host section', async () => {
      await action('Verify group ' + groupName + ' remains visible in host tree', () => expect(page.locator('#host-section').getByText(groupName)).toBeVisible(), 'Group was not visible after cancelling deletion.');
    });
  });

  test('Scenario: Deleting a group with assigned hosts warns about permanent host deletion', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Host Management',
      feature: 'Host Groups',
      story: 'Delete Group With Hosts Cascade',
    });

    const groupName = `E2E_GroupWithHost_${Date.now().toString().slice(-6)}`;
    const alias = `E2E_HostInGroup_${Date.now().toString().slice(-6)}`;
    const address = `10.9.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    let groupAfterMove;

    await Given('a group exists with an assigned host', async () => {
      await createGroup(page, groupName);

      await action('Click Add Host toolbar button', () => page.getByTestId('add-host-toolbar-btn').click(), 'Could not click Add Host toolbar button.');
      const addModal = page.getByTestId('add-host-modal');
      await action('Verify Add Host modal is visible', () => expect(addModal).toBeVisible(), 'Add Host modal was not displayed.');
      await action('Fill host alias with: ' + alias, () => addModal.locator('[name="alias"]').fill(alias), 'Could not fill host alias.');
      await action('Fill host address with: ' + address, () => addModal.locator('[name="address"]').fill(address), 'Could not fill host address.');
      await action('Fill host port with: 8001', () => addModal.locator('[name="port"]').fill('8001'), 'Could not fill host port.');
      await action('Fill host id with: admin', () => addModal.locator('[name="id"]').fill('admin'), 'Could not fill host username.');
      await action('Fill host password with: ••••••••', () => addModal.locator('[name="password"]').fill('placeholder_pw'), 'Could not fill host password.');
      await action('Click Add Host save button', () => page.getByTestId('add-host-save-btn').click(), 'Could not click Add Host save button.');
      await action('Verify Add Host modal is closed', () => expect(addModal).not.toBeVisible({ timeout: 10000 }), 'Add Host modal did not close after saving.');

      const group = page.locator('#host-section').locator('details').filter({ hasText: groupName }).first();
      await action('Verify group ' + groupName + ' is visible', () => expect(group).toBeVisible({ timeout: 10000 }), 'Host group was not visible in tree.');
      const groupTestId = await group.getAttribute('data-testid');
      const groupId = groupTestId.replace('tree-node-', '');

      const hostRow = page.locator('#host-section').locator(`[title="${address}:8001"]`);
      await action('Verify host ' + address + ':8001 is visible in list', () => expect(hostRow).toBeVisible({ timeout: 10000 }), 'Host row was not found in host section.');
      const hostTestId = await hostRow.getAttribute('data-testid');
      const hostUid = hostTestId.replace('host-item-', '');

      const moveResult = await action('Move host into group via API', () => page.evaluate(async ({ hostUid, groupId }) => {
        const res = await fetch(`/api/host/${hostUid}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CWM-Request': '1' },
          body: JSON.stringify({ targetGroupId: groupId }),
        });
        return { status: res.status, body: await res.text() };
      }, { hostUid, groupId }), 'Failed to move host into target group via API.');
      await action('Verify move host API status is success', () => expect(moveResult.status).toBeLessThan(300), 'API move host request failed.');

      await action('Reload page to refresh host tree', () => page.reload(), 'Could not reload page.');
      await page.waitForLoadState('networkidle').catch(() => undefined);
      groupAfterMove = page.locator('#host-section').locator('details').filter({ hasText: groupName }).first();
      await action('Verify group ' + groupName + ' is visible after moving host', () => expect(groupAfterMove).toBeVisible({ timeout: 10000 }), 'Group was not found after moving host.');
      const isOpen = await groupAfterMove.evaluate((el) => el.open).catch(() => false);
      if (!isOpen) await action('Expand group ' + groupName, () => groupAfterMove.locator('> summary').click(), 'Could not expand group details.');
      await action('Verify host ' + alias + ' is visible inside group', () => expect(groupAfterMove.getByText(alias)).toBeVisible({ timeout: 10000 }), 'Assigned host was not visible inside group.');
    });

    await When('the user opens Delete Group and verifies the cascade deletion warning', async () => {
      await action('Right-click group ' + groupName + ' summary', () => groupAfterMove.locator('> summary').click({ button: 'right' }), 'Could not right-click on group summary.');
      await action('Click Delete Group context menu option', () => page.getByRole('button', { name: /Delete Group/i }).click(), 'Could not click Delete Group option in context menu.');

      const modal = page.getByTestId('delete-group-modal');
      await action('Verify delete group modal is visible', () => expect(modal).toBeVisible(), 'Delete group confirmation modal was not displayed.');
      await action('Verify cascade host deletion warning is visible', () => expect(modal.getByText('This will also permanently delete 1 host registered in this group')).toBeVisible(), 'Cascade host deletion warning message was not visible.');
      await action('Verify host ' + alias + ' is listed in cascade delete modal', () => expect(modal.getByText(alias)).toBeVisible(), 'Host alias was not listed in cascade delete modal.');

      await action('Click confirm delete group button', () => page.getByTestId('delete-group-confirm-btn').click(), 'Could not click confirm button in delete group modal.');
      await action('Verify delete group modal is closed', () => expect(modal).not.toBeVisible({ timeout: 10000 }), 'Delete group modal did not close after confirming.');
    });

    await Then('both the group and its assigned hosts are removed permanently', async () => {
      await action('Verify group ' + groupName + ' is not visible', () => expect(page.locator('#host-section').getByText(groupName)).not.toBeVisible({ timeout: 5000 }), 'Group was still visible after deletion.');
      await action('Verify host ' + alias + ' is not visible', () => expect(page.locator('#host-section').getByText(alias)).not.toBeVisible({ timeout: 5000 }), 'Host was still visible after cascade group deletion.');
    });
  });
});
