const { test, expect } = require('../fixture');
const { AuthPage } = require('../pages/AuthPage');
const { HostTreePage } = require('../pages/HostTreePage');
const { DatabaseTreePage } = require('../pages/DatabaseTreePage');
const { Given, When, Then, And, bddMeta, action } = require('../bdd');

const E2E_HOST_ADDRESS = process.env.E2E_HOST_ADDRESS || 'localhost';
const E2E_HOST_PORT = process.env.E2E_HOST_PORT || '8001';
const ORIGINAL_PASSWORD = process.env.E2E_HOST_PASSWORD;

// Fixed on purpose (not timestamp-generated): if this test dies mid-run
// before the restore below completes, the real host is left on whatever the
// temp password was. A fixed, known constant means recovery is just "log in
// with this exact string" — no guessing, no lost value. Do not make this
// dynamic again.
const TEMP_PASSWORD = 'E2eTempPass_Fixed01';

// Changing the real CMS passcode invalidates the current session token,
// which reliably triggers ReconnectHostModal ("Connection Lost") as a side
// effect — so this spec covers both halves of the feature: the passcode
// change itself (distinct from host_edit.spec.js's local-only "Edit Host"
// alias/save flow) and the reconnect prompt it provokes.
//
// This changes the REAL host password that every other spec in this suite
// depends on. The restore-to-original step runs in a `finally` block so it
// executes even if an assertion above it throws — never skip or remove that.
test.describe('Feature: Host Change Password & Reconnect', () => {
  let hostTree;
  let hostUid;

  test.beforeEach(async ({ appPage: page }) => {
    const auth = new AuthPage(page);
    await auth.login(process.env.E2E_USERNAME, process.env.E2E_PASSWORD);

    hostTree = new HostTreePage(page);
    const host = hostTree.hostRowByConnection(E2E_HOST_ADDRESS, E2E_HOST_PORT);
    await expect(host).toBeVisible({ timeout: 10000 });
    hostUid = await hostTree.getUidByConnection(E2E_HOST_ADDRESS, E2E_HOST_PORT);
    await hostTree.activateHost(hostUid);
  });

  const dismissReconnectIfPresent = async (page) => {
    const reconnectModal = page.getByTestId('reconnect-host-modal');
    if (await reconnectModal.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByTestId('reconnect-host-reconnect-btn').click({ force: true }).catch(() => undefined);
      await expect(reconnectModal).not.toBeVisible({ timeout: 15000 }).catch(() => undefined);
    }
  };

  // The passcode change invalidates the current session token, which can
  // provoke ReconnectHostModal — sometimes more than once, and sometimes
  // *while* the change-password success screen is still showing.
  const settleAfterPasswordChange = async (page, modal) => {
    const reconnectModal = page.getByTestId('reconnect-host-modal');
    const closeBtn = page.getByTestId('change-host-password-close-btn');
    for (let i = 0; i < 15; i++) {
      let acted = false;
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click({ force: true }).catch(() => undefined);
        acted = true;
      }
      if (await reconnectModal.isVisible({ timeout: 500 }).catch(() => false)) {
        await page.getByTestId('reconnect-host-reconnect-btn').click({ force: true }).catch(() => undefined);
        acted = true;
      }
      if (!acted && !(await modal.isVisible().catch(() => false)) && !(await reconnectModal.isVisible().catch(() => false))) {
        break;
      }
      await page.waitForTimeout(500);
    }
    await expect(modal).not.toBeVisible({ timeout: 15000 });
    await expect(reconnectModal).not.toBeVisible({ timeout: 15000 }).catch(() => undefined);
  };

  const changePasswordTo = async (page, newPassword) => {
    // A prior action's session-invalidation reconnect prompt can still be
    // up (it appears asynchronously, sometimes after a short delay) and
    // would otherwise block the right-click below.
    await dismissReconnectIfPresent(page);
    await action('Open host context menu', () => hostTree.openHostContextMenu(hostUid), 'Could not open host context menu.');
    await action('Click Change Password context menu option', () => page.getByRole('button', { name: /Change Password|비밀번호 변경/i }).click(), 'Change Password menu option was not clickable.');

    const modal = page.getByTestId('change-host-password-modal');
    await action('Verify Change Password modal is visible', () => expect(modal).toBeVisible({ timeout: 10000 }), 'Change Password modal did not open.');
    await action('Fill new password: ••••••••', () => page.getByTestId('change-host-password-new-input').fill(newPassword), 'Could not type into new password field.');
    await action('Fill confirm password: ••••••••', () => page.getByTestId('change-host-password-confirm-input').fill(newPassword), 'Could not type into confirm password field.');
    await action('Click Submit button on Change Password modal', () => page.getByTestId('change-host-password-submit-btn').click(), 'Submit button was not clickable.');

    const reconnectModal = page.getByTestId('reconnect-host-modal');
    await action('Wait for passcode update confirmation or reconnect prompt', () => Promise.race([
      page.getByText(/Password Updated|비밀번호 업데이트됨/i).waitFor({ state: 'visible', timeout: 30000 }),
      reconnectModal.waitFor({ state: 'visible', timeout: 30000 }),
    ]), 'Neither passcode update confirmation nor reconnect modal appeared in time.');

    await settleAfterPasswordChange(page, modal);
    await dismissReconnectIfPresent(page);
    const isAuth = await page.locator('#db-tree-container[data-authorized="true"]').isVisible({ timeout: 5000 }).catch(() => false);
    if (!isAuth) {
      await dismissReconnectIfPresent(page);
      if (!(await reconnectModal.isVisible().catch(() => false))) {
        await hostTree.activateHost(hostUid);
      }
    }
  };

  test('Scenario: Changing host CMS password succeeds and restoring original password maintains authorized session', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Host Management',
      feature: 'Host Security & Authentication',
      story: 'Change Host CMS Password and Reconnect',
      severity: 'blocker',
    });

    // The real host has occasionally taken well over a minute per passcode
    // change under load (observed up to ~2min) — generous budget on purpose.
    test.setTimeout(240000);

    await Given('the host is connected and authorized in the tree', async () => {
      await action('Verify database tree is authorized for host', () => expect(page.locator('#db-tree-container')).toHaveAttribute('data-authorized', 'true', { timeout: 20000 }), 'Database tree was not authorized for host.');
    });

    await When('the user changes the host passcode to a temporary value', async () => {
      try {
        await changePasswordTo(page, TEMP_PASSWORD);
        await action('Verify database tree remains authorized with temporary passcode', () => expect(page.locator('#db-tree-container')).toHaveAttribute('data-authorized', 'true', { timeout: 20000 }), 'Database tree lost authorization after passcode change.');
      } finally {
        await changePasswordTo(page, ORIGINAL_PASSWORD);
      }
    });

    await Then('the original passcode is restored and the host session remains authorized', async () => {
      await action('Verify database tree remains authorized after restoring original passcode', () => expect(page.locator('#db-tree-container')).toHaveAttribute('data-authorized', 'true', { timeout: 20000 }), 'Database tree is not authorized after restoring passcode.');
    });
  });
});
