---
name: code-review
description: How a pull request in this repository is reviewed — the checks for a plan and for code, and the form a finding takes. Use when reviewing any pull request here.
---

# Code review

Reviews here follow the checks of the `independent-review` skill. Apply them in this review
directly: start no other agent, create no worktree, and post no second review.

- **A plan**, a PR whose diff is under `openspec/changes/` and `docs/research/` only: work through
  [`.agents/skills/independent-review/proposal.md`](../../../.agents/skills/independent-review/proposal.md).
- **Code**, a PR that changes `src/`, `styles/`, `tests/`, `e2e-tests/` or `scripts/`: work
  through [`.agents/skills/independent-review/implementation.md`](../../../.agents/skills/independent-review/implementation.md).
- **Anything else** (agent files, configuration, CI): the checks of either file that apply to
  what the PR changes.
- **The head and the base** are the PR's branch and its base in the checkout this review has. A
  check that needs a second tree or the running app (a revert-and-run, a sweep, a case file) is
  reported as PLAUSIBLE, with what would confirm it.
- **Every review**: the order and the form of a finding in
  [`.agents/skills/independent-review/SKILL.md`](../../../.agents/skills/independent-review/SKILL.md),
  "The reviewer": the expected result and the cause before the PR's own account of them, and each
  finding labelled CONFIRMED or PLAUSIBLE, ranked in `triage`'s rungs, with its case, where it
  lives, and how the PR's base behaves on the same case. Its workspace, posting and author sections are
  for agent sessions and do not apply here.
