# Design

## Context

CI's e2e jobs run through `.github/actions/e2e/action.yml`. The launcher's `onComplete` writes
`.obsidian-cache/e2e-summary.json` (`writeFailureSummary`, `e2e-tests/wdio.shared.mts`) with
`failures` and `knownFailing`; two scripts already render a step summary from files beside it.
What a session can read of a job, and what the harness holds of a failure, is measured in
[`docs/research/ci-failure-digest`](../../../docs/research/ci-failure-digest.md); the decisions
below rest on it.

## Goals / Non-Goals

**Goals:** a failing e2e job leaves one short text a session reads in one call, naming the commit
it describes; the text is the same one a person reads in the step summary.

**Non-Goals:** the boundaries of the proposal's Non-Goals, and no change to what a case asserts or
to how a run's status is decided.

## Decisions

### 1. The digest is a check run of its own

A step summary is not check-run output, and `get_check_run` returns `output` and no annotations,
so the only text it can return is `output.summary` and `output.text` of a check run created
through the Checks API. The e2e action creates one per failing job, named
`digest: <platform> (<group>)` after the job's own `<platform> (<group>)`, so a session that sees
`desktop (folding)` red reads `digest: desktop (folding)`.

Alternatives:

- **The step summary alone**, as #341 proposes. It stays, for people, but no session tool reads it.
- **Annotations** (`::error`). REST returns them, `get_check_run` does not, and they carry a line
  of text each, with no room for a drawing.
- **A PR comment.** It echoes back as an event to every session watching the PR, posts under a
  login that `steward` reads as information, and stays on the PR after the failure is fixed.
- **One aggregate job** after both matrices. It waits for the slowest job in the run, where a
  per-job digest exists as soon as its own job ends, and it would need every job's summary as an
  artifact.

### 2. It is published from the action, on failure, and cannot fail the job

A step after the suite step, `if: failure()`, `continue-on-error: true`, runs
`node scripts/publish-failure-digest.ts`. The suite step gets an id so the digest can state its
outcome: `failure` with a summary file is a test failure, `failure` with none is a suite that
died, and `skipped` is a step before it that failed (install, build). The script exits 0 whatever
happens after rendering; a refused request is a warning and the step summary still has the digest.
`ci.yml` gives `e2e-desktop` and `e2e-mobile` `permissions: contents: read, checks: write`;
a composite action cannot set permissions itself.

### 3. The check run is on the pull request's head

For `pull_request`, `GITHUB_SHA` is the merge commit, so the step takes
`github.event.pull_request.head.sha || github.sha`. The summary names that SHA, the run id, the
attempt and the job URL, because `get_check_runs` rows carry none of them and the first thing
`ci-triage` compares is the event's SHA against the PR's head.

### 4. The conclusion is `neutral`

A `failure` check run would add a second red row for every failing job and would read as red CI to
`steward`'s "act on red CI on the current head". The failing job is already red; the digest
explains it. Branch protection keys on `e2e-*-passed` (`ci.yml`), so nothing required changes.

### 5. The harness records the drawing it prints

A drawn case's error message holds its `before`, `expected` and `actual`, so `failures[].error`
already carries it. Any other case's drawing is printed by `drawOnFailure` and goes nowhere else.
It is appended to a per-worker record, the way `recordKnownFailing` does
(`e2e-tests/known-failing.ts`), cleared by `resetE2eReports`, and joined to its failure in
`writeFailureSummary` as `failures[].drawing`. The join key is the spec file and the test title:
a title alone repeats across specs (task 1.2 states the case that fails it).

### 6. Size

`summary` holds the identifying facts and a table of at most 10 rows, each `spec › test: first
error line`, under 4,000 characters; `text` holds each failure's error message (capped at 4,000
characters) and drawing, the first failure first, under 60,000. `get_check_run` reads `text` in
windows of at most 8,192 bytes, so the order matters: the first window holds the first failure.
Whatever is cut is marked with a line saying how much. The Checks API's documented limit is 65,535
characters for each field; task 5.3 measures it.

The digest, as a session reads `text` (a drawn case in which `⇥` did nothing):

```
 before    expected ⇥    actual ⇥
┆- a      ┆- a          ┆- a
┆- b┃     ┆→ - b┃       ┆- b┃
```

### 7. The skill is a procedure, and the digest is its second step

`ci-triage` is short and holds no copy of the digest's format: head SHA against the PR's head
(`steward` already ignores a superseded commit; the skill says how to read it), the digest, the
base branch and sibling PRs for the same test, at most one rerun, then `steward`'s standing-down
comment. Its list of shapes comes from #341's measured cases and grows from #342; each entry names
what it looked like, what it was, and the check that tells them apart.

## Risks / Trade-offs

- **A bad run adds up to one check row per failing job.** → The rows are `neutral` and only a
  failing job has one.
- **A rerun that passes leaves the earlier attempt's digest on the commit.** → Each digest states
  its attempt, and the skill reads the attempt against the job's latest.
- **The record's join key matches nothing**, so a failure has no drawing. → The digest then shows
  the error alone and says no drawing was recorded; task 1.2 tests the join.
- **`checks: write` on the e2e jobs widens their token.** → They run repository code already, with
  `contents: read`; `checks: write` cannot change code or settings.
- **A read-only token** (Dependabot, forks) publishes nothing. → The step summary still has it.
- **The check-run limits and the token's right to create one are unmeasured.** → Task 5.3 proves
  both on a scratch PR before the change lands.
