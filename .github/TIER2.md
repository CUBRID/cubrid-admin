# Run Tier 2 for a fork PR

A maintainer with write access to `CUBRID/cubrid-admin` can run the private
TCP suite against a reviewed fork commit without merging that commit first.

## One-time setup

- Merge `tier2-pr.yml` and its selector script into the upstream default branch.
  GitHub only displays a manual workflow button once that workflow is on the
  default branch.
- Save a token with read access to `CUBRID/cubrid-webmanager-e2e` as the upstream
  Actions secret `TCP_REPOSITORY_TOKEN`.

## Launch a test

1. Review the open PR's code. Copy its full, 40-character head commit SHA from
   the PR's latest commit.
2. In the upstream repository, open **Actions → Run Tier 2 for PR**.
3. Click **Run workflow** and leave the branch set to the upstream default branch.
4. Enter the PR number and reviewed commit SHA, then launch the workflow.
5. Open the run to see the selected commit, test outcome, and Playwright report.
   Reports are kept for 14 days.

The selector rejects closed/draft PRs and a SHA that no longer matches the PR
head. A new push requires reviewing the new commit and starting another run.
The workflow checks out the selected SHA, so later pushes cannot change the
code being tested in an existing run.

## Execution

The workflow definition and Docker Compose configuration come from the upstream
default-branch commit selected for the run. The private suite is downloaded
before PR build commands execute. Its token is supplied only to the credential
check and checkout steps, with Git credential persistence disabled. No private
suite source archive is uploaded as an artifact.

The reviewed PR is built on a fresh GitHub-hosted Ubuntu 24.04 runner. TCP runs
against a temporary CUBRID NCA container. Cleanup removes that container and its
volumes even when testing fails.

Automatic Docker Tier 2 remains available to same-repository PRs. Fork PRs use
this manual workflow because their `pull_request` runs cannot access the token.
The manual run is shown in Actions; it does not automatically publish a required
check on the PR's commit.
