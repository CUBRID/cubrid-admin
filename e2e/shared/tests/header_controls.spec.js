const { test, expect } = require('../fixture');
const { AuthPage } = require('../pages/AuthPage');
const { Given, When, Then, And, bddMeta, action } = require('../bdd');

test.describe('Feature: Header Controls & System Actions', () => {
  test.beforeEach(async ({ appPage: page }) => {
    const auth = new AuthPage(page);
    await auth.login(process.env.E2E_USERNAME, process.env.E2E_PASSWORD);
  });

  test('Scenario: Help menu opens the real About dialog and closes it', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Application Controls',
      feature: 'Header Menu',
      story: 'About CUBRID Dialog',
    });

    let dialog;

    await Given('the user hovers over the Help menu trigger', async () => {
      await action('Hover over Help menu in header', () => page.getByRole('button', { name: /Help/i }).hover(), 'Could not hover over Help menu button.');
    });

    await When('the user clicks About CUBRID Admin menu item', async () => {
      const aboutItem = page.getByRole('button', { name: /About CUBRID Admin/i });
      await action('Verify About menu item is visible', () => expect(aboutItem).toBeVisible({ timeout: 5000 }), 'About CUBRID Admin menu item did not appear.');
      await action('Click About CUBRID Admin menu item', () => aboutItem.click({ force: true }), 'Could not click About CUBRID Admin menu item.');
      dialog = page.getByRole('dialog');
      await action('Verify About dialog is visible', () => expect(dialog).toBeVisible(), 'About dialog did not appear.');
    });

    await Then('the About dialog renders application version information', async () => {
      await action('Verify dialog contains application name', () => expect(dialog.getByText(/Next CUBRID Admin/i).first()).toBeVisible(), 'Application name was not found in About dialog.');
      await action('Verify version 12.4.0-STABLE is displayed', () => expect(dialog.getByText('12.4.0-STABLE')).toBeVisible(), 'Version string was not displayed in About dialog.');
    });

    await And('clicking Close dismisses the modal dialog', async () => {
      await action('Click Close button on About dialog', () => dialog.getByRole('button', { name: 'Close', exact: true }).click(), 'Could not click Close button on About dialog.');
      await action('Verify About dialog is closed', () => expect(dialog).not.toBeVisible(), 'About dialog remained open after clicking Close.');
    });
  });

  test('Scenario: Language toggle changes the rendered menu locale and can restore English', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Application Controls',
      feature: 'Localization',
      story: 'Language Switcher (EN / KR)',
    });

    const english = page.getByRole('button', { name: 'EN', exact: true });
    const korean = page.getByRole('button', { name: 'KR', exact: true });

    await Given('the interface is initially displayed in English', async () => {
      await action('Verify EN button is initially active', () => expect(english).toHaveAttribute('aria-pressed', 'true'), 'English (EN) button was not active initially.');
    });

    await When('the user clicks the KR button', async () => {
      await action('Click KR language switcher button', () => korean.click(), 'Could not click KR language switcher button.');
      await action('Verify KR button is active', () => expect(korean).toHaveAttribute('aria-pressed', 'true'), 'Korean (KR) button did not become active.');
    });

    await Then('navigation menus switch to Korean translation', async () => {
      await action('Verify Korean menu text is displayed', () => expect(page.getByRole('button', { name: /파일/ })).toBeVisible(), 'Korean menu text "파일" did not appear.');
    });

    await And('clicking EN restores the English locale', async () => {
      await action('Click EN language switcher button to restore English', () => english.click(), 'Could not click EN language switcher button.');
      await action('Verify EN button is active', () => expect(english).toHaveAttribute('aria-pressed', 'true'), 'English (EN) button did not become active.');
      await action('Verify English menu text is displayed', () => expect(page.getByRole('button', { name: /File/ })).toBeVisible(), 'English menu text "File" did not appear.');
    });
  });

  test('Scenario: Logged in username opens the account profile dialog', async ({ appPage: page }) => {
    await bddMeta({
      epic: 'Application Controls',
      feature: 'User Profile',
      story: 'View Account Profile',
    });

    const username = process.env.E2E_USERNAME;
    let dialog;

    await Given('the logged-in username button is visible in header', async () => {
      const profileButton = page.getByRole('button', { name: new RegExp(username, 'i') });
      await action(`Verify account profile button is visible for "${username}"`, () => expect(profileButton).toBeVisible(), `Account profile button for "${username}" was not visible.`);
      await action('Click account profile button', () => profileButton.click(), 'Could not click account profile button.');
    });

    await When('the user clicks the account profile trigger', async () => {
      dialog = page.getByRole('dialog');
      await action('Verify Account Profile dialog is visible', () => expect(dialog).toBeVisible(), 'Account Profile dialog did not appear.');
    });

    await Then('the Account Profile dialog displays the active username', async () => {
      await action(`Verify username "${username}" is displayed in dialog`, () => expect(dialog.getByText(username, { exact: true }).first()).toBeVisible(), `Username "${username}" was not found in Account Profile dialog.`);
      await action('Verify Account Profile heading is visible', () => expect(dialog.getByRole('heading', { name: /Account Profile|계정 프로필/i })).toBeVisible(), 'Account Profile heading was not found.');
    });
  });
});
