const fs = require('fs');
const path = require('path');

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const workspaceRoot = path.resolve(__dirname, '../../..');
const rootPackagePath = path.join(workspaceRoot, 'package.json');
const distPackagePath = path.join(workspaceRoot, 'dist/apps/api-server/package.json');

const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
const distPackage = JSON.parse(fs.readFileSync(distPackagePath, 'utf8'));

if (!rootPackage.pkg) {
  throw new Error('pkg config not found in workspace package.json');
}

const target = readArg('--target');
const setBin = process.argv.includes('--set-bin');

distPackage.name = 'cubrid-admin';
distPackage.pkg = target ? { ...rootPackage.pkg, targets: [target] } : rootPackage.pkg;
if (setBin || target) {
  distPackage.bin = { 'cubrid-admin': 'main.js' };
}

fs.writeFileSync(distPackagePath, JSON.stringify(distPackage, null, 2));
