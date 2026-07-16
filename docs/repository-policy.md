# Repository branch policy

Policy revision: 2026-07-16

The canonical and default branch is `master`. CI pull-request checks run for
every target branch, and push checks run on `master`. Workflows and documentation
must not refer to a nonexistent `main` branch.

Substantial work uses a descriptive branch and a pull request. Direct pushes,
force pushes, branch deletion, and merging with failing or stale checks are not
part of the normal workflow.

## Required GitHub rule for `master`

The repository owner must configure one branch ruleset or classic branch
protection rule with:

- pull requests required before merging;
- at least one approving review and dismissal of stale approvals;
- conversation resolution required;
- the `frontend` and `rust` status checks required and required to be current
  with `master`;
- force pushes and branch deletion blocked;
- administrators included unless an explicitly documented recovery requires a
  temporary exception.

Repository inspection on 2026-07-16 confirmed that `master` is the GitHub
default branch and had no protection rule. The local milestone cannot claim
this gate complete until the owner applies the rule and its settings are
re-read from GitHub. If the available GitHub plan cannot enforce one of these
controls, record the unavailable control and the manual review fallback here.

Changing the default branch requires a dedicated migration that updates CI,
release automation, documentation, open pull requests, and local contributor
instructions together. Renaming is not needed merely to follow a naming
convention.
