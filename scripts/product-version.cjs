#!/usr/bin/env node
/**
 * Product version: major.minor.patch.commit_num, as in the CUBRID engine's
 * build.sh. Set in the root package.json:
 *
 *   "version"        major.minor.patch (stays semver for npm/electron)
 *   "commitNumAfter" start date for commit_num
 *   "commitNum"      optional fixed commit_num, for a build without git
 *                    history (like the 4th part of the engine's VERSION file)
 *
 * commit_num is the number of commits on HEAD made after "commitNumAfter"
 * (git rev-list --after <date> --count HEAD), written with 4 digits: 0.1.0.0001.
 *
 * Counting needs the full history. Without git, outside a git checkout, or in
 * a shallow clone (CI checkout with the default fetch-depth 1) the build fails
 * unless "commitNum" is set: it never prints a wrong number.
 *
 * CLI:
 *   node scripts/product-version.cjs                 print the version
 *   node scripts/product-version.cjs --rev <commit>  version at another commit
 *   node scripts/product-version.cjs --write <file>  also write { version } as JSON
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function readConfig() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const base = pkg.version ?? '';
  if (!/^\d+\.\d+\.\d+$/.test(base)) {
    throw new Error(`Root package.json "version" must be major.minor.patch, got "${base}".`);
  }
  if (pkg.commitNum !== undefined && !/^\d+$/.test(String(pkg.commitNum))) {
    throw new Error(`Root package.json "commitNum" must be a number, got "${pkg.commitNum}".`);
  }
  if (Number.isNaN(Date.parse(pkg.commitNumAfter ?? ''))) {
    throw new Error(`Root package.json "commitNumAfter" must be a date, got "${pkg.commitNumAfter}".`);
  }
  return { base, fixed: pkg.commitNum, after: pkg.commitNumAfter };
}

function countCommits(after, rev) {
  let shallow;
  try {
    shallow = git(['rev-parse', '--is-shallow-repository']);
  } catch {
    throw new Error('Cannot work out commit_num: git is not installed or this is not a git checkout.');
  }
  if (shallow !== 'false') {
    throw new Error('Cannot work out commit_num: this is a shallow git clone. Fetch the full history (e.g. checkout fetch-depth: 0).');
  }
  const count = Number(git(['rev-list', `--after=${after}`, '--count', rev]));
  if (!Number.isInteger(count)) {
    throw new Error('Cannot work out commit_num: git rev-list gave no count.');
  }
  return count;
}

/** { base: '0.1.0', commitNum: '0001', version: '0.1.0.0001' }. Throws when commit_num cannot be worked out. */
function productVersion({ rev = 'HEAD' } = {}) {
  const { base, fixed, after } = readConfig();
  const count = fixed !== undefined ? Number(fixed) : countCommits(after, rev);
  const commitNum = String(count).padStart(4, '0');
  return { base, commitNum, version: `${base}.${commitNum}` };
}

module.exports = { productVersion };

if (require.main === module) {
  const args = process.argv.slice(2);
  const valueOf = (flag) => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };
  try {
    const { version } = productVersion({ rev: valueOf('--rev') ?? 'HEAD' });
    const out = valueOf('--write');
    if (out) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify({ version }) + '\n');
    }
    console.log(version);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
