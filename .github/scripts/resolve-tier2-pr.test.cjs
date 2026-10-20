const { test } = require('node:test');
const assert = require('node:assert/strict');
const resolve = require('./resolve-tier2-pr.cjs');
const sha = 'a'.repeat(40);

function fixture(overrides = {}) {
  const outputs = {};
  const pr = {
    number: 132, state: 'open', draft: false,
    base: { repo: { full_name: 'CUBRID/cubrid-admin' } },
    head: { sha, repo: { full_name: 'developer/fork' } },
    html_url: 'https://github.com/CUBRID/cubrid-admin/pull/132',
    ...overrides,
  };
  const summary = { addHeading() { return this; }, addLink() { return this; },
    addRaw() { return this; }, async write() { return undefined; } };
  return {
    outputs,
    args: {
      github: { rest: { pulls: { async get(input) {
        assert.equal(input.pull_number, 132);
        return { data: pr };
      } } } },
      context: { repo: { owner: 'CUBRID', repo: 'cubrid-admin' } },
      core: { setOutput: (key, value) => { outputs[key] = value; }, summary },
      prNumber: '132', expectedSha: sha,
    },
  };
}

test('resolves a reviewed fork commit without following a moving branch', async () => {
  const { args, outputs } = fixture();
  await resolve(args);
  assert.deepEqual(outputs, { repository: 'developer/fork', sha, number: '132' });
});

for (const [label, value] of [['shell expression', '$(id)'], ['zero', '0'], ['fraction', '1.5']]) {
  test(`rejects invalid PR number: ${label}`, async () => {
    const { args, outputs } = fixture();
    await assert.rejects(resolve({ ...args, prNumber: value }), /positive integer/);
    assert.deepEqual(outputs, {});
  });
}

test('rejects a short commit SHA', async () => {
  const { args } = fixture();
  await assert.rejects(resolve({ ...args, expectedSha: 'abcdef0' }), /40-character/);
});

for (const [label, change, message] of [
  ['new push after review', { head: { sha: 'b'.repeat(40), repo: { full_name: 'developer/fork' } } }, /PR has changed/],
  ['closed PR', { state: 'closed' }, /open PR/],
  ['draft PR', { draft: true }, /ready for review/],
  ['deleted fork', { head: { sha, repo: null } }, /no longer available/],
  ['different target repository', { base: { repo: { full_name: 'other/repo' } } }, /target this repository/],
]) {
  test(`rejects ${label} before publishing checkout outputs`, async () => {
    const { args, outputs } = fixture(change);
    await assert.rejects(resolve(args), message);
    assert.deepEqual(outputs, {});
  });
}
