/** Resolve exactly the open PR commit selected by a maintainer. */
module.exports = async function resolveTier2Pr({ github, context, core, prNumber, expectedSha }) {
  if (!/^[1-9]\d*$/.test(prNumber || '') || !Number.isSafeInteger(Number(prNumber))) {
    throw new Error('PR number must be a positive integer.');
  }
  if (!/^[0-9a-f]{40}$/i.test(expectedSha || '')) {
    throw new Error('Enter the full 40-character commit SHA you reviewed.');
  }

  const { data: pr } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: Number(prNumber),
  });
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  if (pr.base.repo.full_name.toLowerCase() !== repository.toLowerCase()) {
    throw new Error('The PR must target this repository.');
  }
  if (pr.state !== 'open' || pr.draft) {
    throw new Error('Select an open PR that is ready for review.');
  }
  if (!pr.head.repo) {
    throw new Error('The PR source repository is no longer available.');
  }
  if (pr.head.sha.toLowerCase() !== expectedSha.toLowerCase()) {
    throw new Error('The PR has changed. Review its latest commit and enter that SHA.');
  }

  core.setOutput('repository', pr.head.repo.full_name);
  core.setOutput('sha', pr.head.sha);
  core.setOutput('number', String(pr.number));
  await core.summary
    .addHeading('Selected PR commit')
    .addLink(`PR #${pr.number}`, pr.html_url)
    .addRaw(`\n\nCommit: ${pr.head.sha}\n`)
    .write();
};
