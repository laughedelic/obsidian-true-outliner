---
type: "research"
description: "What Codecov Test Analytics holds for this repository after #231 and how a session reads it without credentials (REST and GraphQL on a public repo); how often CI flaked between 2026-07-13 and 2026-10-03 (29 of 1,556 runs, 28 same-commit fail-then-pass test cases, 17 distinct tests, 78% of reruns passing); why Codecov's own flaky label is not the signal to read (it marked 3 of the 28); and the recommendation to read Codecov on demand by pairing runs on one commit, with no record of our own"
---

# Flaky tests: what Codecov Test Analytics tells us

Measured 2026-10-03, for #342. Codecov data was read from `api.codecov.io` without credentials
from a cloud session; CI history was read from the GitHub Actions REST API (`gh api`). The
question was whether Codecov, uploading since #231, already answers "which tests flake, and how
often", and how a session reads that.

## What Codecov holds

- About 2.3 million test runs: 2,242,977 pass, 95,182 skip, 421 failure, 20 `flaky_fail`, no
  `error`. By flag, the 421 failures split 244 `e2e-mobile`, 157 `e2e-desktop`, 20 `unittests`.
- A run's `timestamp` is when Codecov received the upload, not when the test ran. Everything
  starts on 2026-09-25: the #231 backfill (e2e runs rebuilt from 60 days of logs) went in within
  half an hour that evening, so 317 of the 421 failures carry that date. Unit tests were not
  backfilled and have eight days of history. Live uploads cover 09-25 to now.
- Every upload is one run attempt of one job, keyed by commit, so a rerun of a job is a second
  upload for the same commit, flag and test. That is what makes a same-commit comparison possible.
- Codecov's own view (GraphQL, 30 days) reports six flaky tests and a flake rate of
  9.0e-6 per test run. One test is flagged within seven days, none within one.
  Those six are: `heading level markers` ×2 (8 and 7 flagged failures), `the footer's
  controls::re-counts one axis…` (2), `a misplaced block id::opens the correction menu…` (1),
  `transaction classification` performance (1), `keyboard grammar::off-mode…` (1).
- The PR comment Codecov posts carries a coverage report plus a one-line test verdict ("All tests
  successful. No failed tests found." on #351). Codecov's documentation says a failing head
  lists its failed tests there.

## Reading it from a session

No credentials. The repository is public, and both interfaces answer anonymously through the
session's proxy (`api.codecov.io` is reachable in this environment; a cloud environment with a
restricted network policy needs that host allowed). The upload token in CI is for writing only.

- **REST**, one row per test run, newest first, 1,000 rows a page at most:
  `https://api.codecov.io/api/v2/github/laughedelic/repos/obsidian-true-outliner/test-analytics/`
  with `outcome=failure|flaky_fail|pass|skip`, `branch`, `commit_sha`, `page`, `page_size`. A row
  has `computed_name`, `flags`, `upload_id`, `failure_message`, `filename`, `timestamp`. The
  older `/test-results/` path answers with a deprecation notice pointing here. The schema is at
  `/api/v2/schema/`.
- **GraphQL**, per-test aggregates: `POST https://api.codecov.io/graphql/github`, with
  `owner(username:"laughedelic") { repository(name:"obsidian-true-outliner") { ... on Repository
  { testAnalytics { testResults(first, filters:{interval, parameter, term}, ordering) {…} } } } }`.
  `parameter` takes `FLAKY_TESTS` or `FAILED_TESTS`, `term` matches a test title, `interval` is
  `INTERVAL_1_DAY`, `_7_DAY` or `_30_DAY`. Nodes carry `totalPassCount`, `totalFailCount`,
  `totalFlakyFailCount`, `commitsFailed`, `failureRate`. `testAnalytics` also has
  `flakeAggregates` and `testResultsAggregates`. Introspection answers 500, so field names come
  from the dashboard's queries, and they may move.
- **CLI**: not needed. Codecov's CLI and action upload; nothing here reads back.
- **Without Codecov**: `GET /repos/{owner}/{repo}/actions/runs/{id}/attempts/{n}/jobs` gives
  which jobs failed on which attempt. It names the group job, not the test.

## What flakes

A flake here is a test that failed on a commit and passed on the same commit in a later upload of
the same flag. Failures that never passed on their commit are not counted: they are real
failures, or nobody reran them.

Pairing the REST rows by commit (every commit with a failure, 315,000 rows) gives 28 such cases
across 17 tests. Tests with more than one:

| spec | test | platform | flips | runs of the test |
| --- | --- | --- | --- | --- |
| `77-footer-controls` | re-counts one axis against the other's selection | mobile | 4 | 1,835 |
| `65-content-space-caret` | C8 checkbox list item | desktop | 3 | 2,297 |
| `77-footer-controls` | shortens the header on the same narrow footer | mobile | 2 | 1,765 |
| `57-misplaced-block-ids` | drags its paragraph from a glyph press that moves | desktop | 2 | 218 |
| `60-transaction-classification` | classification performance budget | mobile | 2 | 2,297 |
| `62-outline-edit-enforcement` | verdict performance budget | both | 2 | 2,221 |
| `75-footer-behaviour` | leaves the note's bytes and undo stack untouched | mobile | 2 | 2,003 |

"Runs" counts both platforms where a test exists on both, so a mobile-only rate is about twice
what the column suggests. The other ten tests flipped once each, among them
`52-heading-level-markers` (two tests), `91-fold-commands`, `93-fold-chrome`,
`76-footer-cost`, `70-footer-enforcement` and a second case of `57-misplaced-block-ids`, the
newest, on 10-03. Footer specs (`70`, `75`, `76`, `77`) account for 10 of the 28.

From the Actions side, over 1,556 CI runs since 2026-07-13:

- 37 runs were rerun. 29 passed on the rerun and 8 failed again: **78% of reruns passed**.
- That is 29 runs, 1.9% of all runs (2.3% since 08-31, when volume rose to 250–300 runs a week:
  27 of 1,182), and about one in eight of the runs whose first attempt failed (29 of the 241
  that did: 212 ended failed, 29 more passed on a rerun).
- A flipped run usually failed one job and, where Codecov has the rows, one test (two runs had
  two failing).
- Of the issue's known flakes: `77-footer-controls` on mobile and `65-content-space-caret` C8 are
  in the table above. The `60` nested table cell editor failed once on 09-27 on a mobile run
  and has no rerun on that commit, so nothing separates it from a real failure. Of the gap-click
  cases in #304, nothing has failed since #319 on 09-29.

The Actions history and Codecov's rows agree: 26 of the 29 flipped runs have a failing and a
passing row for one test on that commit in Codecov. The three that do not are the scheduled
`e2e-test (latest)` run of 07-31 (it uploads nothing), the unit-test flip of 09-13 (before
unit uploads began), and a desktop `clipboard` run of 09-21 whose failing attempt left no failing
row, only 1,940 passing ones.

## Codecov's flaky label is not the signal

Codecov marked 20 rows `flaky_fail`. Of the 28 same-commit pairs it marked 3, all from the
backfill; none of the eight pairs from live runs after 09-25 carry the label, and the last
`flaky_fail` row is dated 09-28. Of the 20 labelled rows, 6 are failures on `main` and 14 are on
branches, and 15 are the two `heading level markers` tests failing in the backfill's uploads
(20:59 to 21:03 on 09-25) across seven branches. Codecov's documentation page for the feature was not found, so what the label
requires is not established here. Its flake count (six tests) is an undercount against the
17 above, and `FLAKY_TESTS` should not be the query a session relies on.

## Recommendation

**Read Codecov on demand; keep no record of our own, and add no label or process.**

- The data needs no credentials and is already there; the raw rows are enough. Flips run at
  three to eight a week, so the 60 days #231 gives as Codecov's retention hold roughly 45
  events, and losing older history costs little.
- The rule stays: rerun an unrelated failure once. 29 of 37 reruns passed; 8 failed again.
- To ask "has this test flaked before", a session lists failures (`outcome=failure`), fetches
  each failing commit's rows (`commit_sha=<sha>&page_size=1000`) and looks for the same
  `computed_name` and flag with both a failing and a passing row. The pairing is a short
  script; the analysis here ran it over the 183 commits that had a failure. We leave it out of
  the repository until the CI-triage work under #334 shows it is wanted as a script.
- Recording our own would add a store and a writer to maintain for data Codecov already keeps;
  the one gap is history older than 60 days, and nothing here shows that gap matters.

Candidates for an issue, pending the maintainer's go-ahead: `77-footer-controls` on mobile (6
flips) and `57-misplaced-block-ids` (3 flips, the newest on 10-03, and the highest rate at 2
flips in 218 desktop runs) have the most evidence.
