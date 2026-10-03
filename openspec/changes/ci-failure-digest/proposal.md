# Proposal

## Why

When an e2e job fails, a session has to decide whether the failure is its own, and it has re-derived
how in at least six sessions (#341). The evidence sits in raw job logs: up to about 123 KB for one
job, 4.8 MB for a run's archive
([`docs/research/ci-failure-digest`](../../../docs/research/ci-failure-digest.md)). The wrong first
theories in #341 each came from reading a log fragment rather than the failing case.

The issue proposes a digest in the job summary, read through `get_check_run`. Measured, that pair
does not connect: a job summary is not check-run output, and `get_check_run` returns no
annotations, so a digest has to be a check run of its own to be read that way.

## What Changes

- **A failure digest**, published by each failing e2e job as a check run named
  `digest: <platform> (<group>)` on the PR's head commit, and appended to the job's step summary.
  It lists each failure's spec, test and first error line, and carries the drawing: a drawn case's
  `before` / `expected` / `actual`, and the editor's drawing at the failure for any other case.
- **The harness records the drawing at failure**, which today it only prints, so the digest can
  carry it for every case and not only the drawn ones.
- **A `ci-triage` skill** under `.agents/skills/`, linked from `.claude/skills/` and
  `.github/skills/`: the head SHA first, then the digest, then the base branch and sibling PRs, at
  most one rerun, and the shapes of failure that look like flakes and are not.
- **Pointers**: `steward` and CLAUDE.md name the skill where they say what to do about red CI.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `e2e-verification`: a failing CI e2e job publishes a bounded digest of what failed, readable
  through the check run, without changing the job's result.

## Non-Goals

- Digests for `lint`, `typecheck`, `unit-test` or `directory-scan`: their logs are short, and the
  MCP job-log tool reads them.
- Deciding that a failure is a flake, or rerunning automatically. The skill holds the procedure;
  the session decides.
- Flaky-test detection, which is #342. Its findings extend the skill's list of shapes.
- Annotations, PR comments and an aggregate job, each weighed in `design.md`.
- Changing which checks are required, or `e2e-*-passed`.

## Impact

- `.github/actions/e2e/action.yml`, `.github/workflows/ci.yml` (job permissions).
- `scripts/failure-digest.ts`, `scripts/publish-failure-digest.ts`, `tests/failure-digest.test.ts`.
- `e2e-tests/wdio.shared.mts` and one new record module beside `e2e-tests/known-failing.ts`.
- `.agents/skills/ci-triage/` and two symlinks; `.agents/skills/steward/SKILL.md`; CLAUDE.md.
- A `chore` touching neither `src/` nor `styles/`: no version bump.
