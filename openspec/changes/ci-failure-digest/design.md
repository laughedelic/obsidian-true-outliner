# Design

## Context

CI's e2e jobs run through `.github/actions/e2e/action.yml`, called by `ci.yml` and by
`newest-installer.yml`. The launcher's `onComplete` writes `.obsidian-cache/e2e-summary.json`
(`writeFailureSummary`, `e2e-tests/wdio.shared.mts`) with `failures` and `knownFailing`; two
scripts already render a step summary from files beside it. What a session can read of a job, and
what the harness holds of a failure, is measured in
[`docs/research/ci-failure-digest`](../../../docs/research/ci-failure-digest.md); the decisions
below rest on it.

## Goals / Non-Goals

**Goals:** a failing e2e job leaves one short text a session reads in one call, naming the commit it
describes; a person reads the same text in the step summary.

**Non-Goals:** the boundaries of the proposal's Non-Goals, and no change to what a case asserts or
to how a run's status is decided.

## Decisions

### 1. Three outputs, one text

The last step of a failing job prints the digest to the job's log and appends it to the step
summary; in `ci.yml`'s jobs it also publishes it as a check run, `digest: <platform> (<group>)`.

- **The log tail** needs no permission, so it is what a session reads on a Dependabot or fork PR,
  whose token is read-only. A check run's id is its job's id, so `get_job_logs` with that id and a
  `tail_lines` reads it in one call; the post-job lines after the last step were 39 in the job the
  reviewer measured.
- **The check run** is what #341 names as the target. `get_check_run` returns only `output`, and
  of an Actions job's own check run that is empty, so the text has to be in a check run made
  through the Checks API (the note, "What `get_check_run` returns"). It returns the digest without
  the cleanup lines and without a guess at how many tail lines to ask for. It costs a row per
  failing job and a token with `checks: write`. If the maintainer prefers the log alone, the
  check-run half of tasks 4 and 5 drops and the rest stands.
- **The job's own check run, patched** (`output` set by a step through `job.check_run_id`) would
  need no extra row. Whether the runner overwrites it when the job completes, and whether the
  `job` context reaches a composite action, are unmeasured. Task 1.1 measures both on a scratch
  branch before any other code; if it holds, the separate check run is replaced by it, through
  `openspec-update-change`, before tasks 4 and 5.

Alternatives set aside:

- **Annotations** (`::error`). REST returns them, `get_check_run` does not, and they hold a line of
  text each, with no room for a drawing.
- **A PR comment.** It echoes back as an event to every session watching the PR, posts under a
  login `steward` reads as information, and stays after the failure is fixed.
- **One aggregate job** after both matrices. It waits for the slowest job in the run, where a
  per-job digest exists when its own job ends.

### 2. Written by the action's last step, only for a suite that ran

A step after every other, `if: failure()` and `continue-on-error: true`, runs
`node scripts/publish-failure-digest.ts`. The suite step has an id, and the digest takes its
outcome. The summary file is read only when that outcome is `failure`: the suite step removes a
stale `e2e-summary.json` before it runs, so a file found after a `failure` is this run's, and one
found after `skipped` may be the cache's (an earlier step failed, and the cache restored a passing
run's file). `failure` with no file reads "the suite wrote no summary"; `skipped` reads "no suite
ran: an earlier step failed".

The check run is made only when the action's `check-run` input is `true`. `ci.yml` sets it and
grants `e2e-desktop` and `e2e-mobile` `permissions: contents: read, checks: write`;
`newest-installer.yml` does not, since its job names repeat CI's and a dispatch on a PR branch
would put a second `digest: …` on the same head. The script exits 0 whatever happens after
rendering: a refused request is a warning, and the log and the step summary still have the digest.

### 3. The check run is on the pull request's head

For `pull_request`, `GITHUB_SHA` is the merge commit, so the step takes
`github.event.pull_request.head.sha || github.sha`. The summary names that SHA, the run id and
the attempt, because `get_check_runs` rows carry none of them and the first thing `ci-triage`
compares is the event's SHA against the PR's head. The check run's `details_url` is the run
attempt's page, `<server>/<repository>/actions/runs/<run>/attempts/<attempt>`, which needs no
lookup and no `actions: read`.

### 4. The conclusion is `neutral`

A `failure` check run would add a second red row for every failing job and would read as red CI to
`steward`'s "act on red CI on the current head". The failing job is already red; the digest
explains it. The `Protect main` ruleset requires `lint`, `unit-test`, `e2e-desktop-passed` and
`e2e-mobile-passed` by name, so nothing required changes.

### 5. The harness records the drawing it prints

A drawn case's error message holds its `before`, `expected` and `actual`, so `failures[].error`
already carries it. Any other case's drawing is printed by `drawOnFailure` and goes nowhere else.
It is appended to a per-worker record, the way `recordKnownFailing` does
(`e2e-tests/known-failing.ts`), cleared by `resetE2eReports`, and joined to its failure in
`writeFailureSummary` as `failures[].drawing`.

The two sides hold the spec in different forms: the hook's `test.file` is an absolute path, the
JSON reporter's `specs` are `file://` URLs, and `FailureEntry.spec` is repo-relative. The join
normalises both through `specDisplayPath` and keys on spec, `test.parent` (the reporter's
`suite.name`) and the test title; a title alone repeats across specs 50, 51 and 52. A join that
matches nothing would pass a fixture-only test, so task 2.2 runs `writeFailureSummary` over a real
failing run and reads `failures[].drawing` back.

A drawn case already shows its columns in `error`, so its recorded drawing is dropped when the
first line of `error` is a drawn-case verdict (`verdict()` in `e2e-tests/case-report.ts`); a test
builds the message with `phaseMessage` so a change to the verdict's shape fails it.

### 6. Size, in bytes

`summary` holds the identifying facts and a table of at most 10 rows under 4,000 bytes; `text` holds
each failure's error message and drawing, the first failure first, under 60,000 bytes. The drawing
glyphs (`┆ ┃ ▒ « »`) are three bytes in UTF-8, `get_check_run` reads `text` in windows of at most
8,192 bytes, and the checks API's limit may count characters or bytes, so every cap is in bytes and
a single failure's error is capped at 2,000 bytes, which keeps the first window on the first
failure's drawing. A row's first error line is the message's first line; when that line is a
matcher's signature (`expect(received)…`), the row adds the `Expected:` and `Received:` lines. The
spike measures the real limit; the caps move to it if it is lower than 65,535.

The digest, as a session reads `text` (a drawn case in which `⇥` did nothing):

```
 before    expected ⇥    actual ⇥
┆- a      ┆- a          ┆- a
┆- b┃     ┆→ - b┃       ┆- b┃
```

### 7. The skill is a procedure, and the digest is its second step

`ci-triage` is short and holds no copy of the digest's format: head SHA against the PR's head
(`steward` already ignores a superseded commit; the skill says how to read it), the digest (the
check run, else the log tail), the base branch and sibling PRs for the same test, at most one
rerun, then `steward`'s standing-down comment. Its list of shapes comes from #341's measured
cases and #355, and grows from #342; each entry names what it looked like, what it was, and the
check that tells them apart.

## Risks / Trade-offs

- **A bad run adds up to one check row per failing job.** → The rows are `neutral`, only a failing
  job has one, and the spike may remove them.
- **A rerun that passes leaves the earlier attempt's check run on the commit.** → Each digest
  states its attempt, and the skill reads it against the job's latest. The log has no such problem.
- **The join matches nothing**, so a failure has no drawing. → Task 2.2 reads it back from a real
  run; the digest otherwise shows the error alone and says no drawing was recorded.
- **`checks: write` on the e2e jobs widens their token.** → They run repository code already, with
  `contents: read`; `checks: write` cannot change code or settings.
- **A read-only token** publishes no check run. → The log and the step summary carry the digest.
- **The `known-failing` and monitors steps render a stale file after an early failure**, an
  exposure that exists today. → Not changed here; the digest avoids it by reading the file only
  after a `failure` outcome, and the exposure is a follow-up for the maintainer's go-ahead.
- **The limits, the `job` context and the patched-output question are unmeasured.** → Task 1.1.
