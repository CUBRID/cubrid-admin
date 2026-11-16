// The packed app's metadata (electron-builder.config.cjs extraMetadata):
// Electron names the app and its userData folder after productName, and
// Windows takes CompanyName / FileDescription from author / description.
const config = require('../../electron-builder.config.cjs');

describe('packed app metadata', () => {
  it('names the app, and so its userData folder, "CUBRID Admin"', () => {
    expect(config.extraMetadata.productName).toBe('CUBRID Admin');
    expect(config.productName).toBe('CUBRID Admin');
  });

  it('fills the Windows company and description', () => {
    expect(config.extraMetadata.author).toEqual({ name: 'CUBRID Corporation' });
    expect(config.extraMetadata.description).toBe('CUBRID Admin');
  });

  it('names a maintainer for the Linux rpm', () => {
    expect(config.linux.maintainer).toBe('CUBRID Corporation');
  });

  it('keeps file names without spaces for Linux packages', () => {
    expect(config.extraMetadata.name).toBe('cubrid-admin-desktop');
    expect(config.linux.artifactName).not.toMatch(/\s/);
  });
});
