const { expect } = require('@playwright/test');
const { waitForRoute } = require('../helpers/route');

class WorkspaceSetupPage {
  constructor(window) {
    this.window = window;
    this.title = window.getByTestId('workspace-setup-title');
    this.workspaceInput = window.getByTestId('workspace-root-input');
    this.pickBtn = window.getByTestId('workspace-pick-btn');
    this.continueBtn = window.getByTestId('workspace-continue-btn');
    this.saveBtn = window.getByTestId('workspace-save-btn');
  }

  async waitForPage() {
    await waitForRoute(this.window, 'desktop/workspace');
    await expect(this.title).toBeVisible({ timeout: 15000 });
  }

  async clickContinue() {
    await expect(this.continueBtn).toBeEnabled();
    await this.continueBtn.click();
  }

  async clickSave() {
    await expect(this.saveBtn).toBeEnabled();
    await this.saveBtn.click();
  }
}

module.exports = { WorkspaceSetupPage };
