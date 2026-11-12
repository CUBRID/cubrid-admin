/**
 * Load apps/api-server/.env (then repo root .env) for Node tooling (HTTPS stack/proxy).
 */
const fs = require('fs');
const path = require('path');
const { config: loadEnv } = require('dotenv');

function loadWorkspaceEnv() {
  const baseDir = process.pkg ? path.dirname(process.execPath) : process.cwd();
  const candidates = [
    path.join(baseDir, 'apps/api-server/.env'),
    path.join(baseDir, '.env'),
    '/etc/cubrid-webmanager.env',
  ];

  const envFilePath = candidates.find((p) => fs.existsSync(p));
  if (!envFilePath) {
    return null;
  }

  loadEnv({ path: envFilePath, override: false });
  return envFilePath;
}

module.exports = { loadWorkspaceEnv };
