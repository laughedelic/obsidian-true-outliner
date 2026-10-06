## ADDED Requirements

### Requirement: A failing e2e job publishes a failure digest

When the e2e suite step of a CI job fails, in either workflow that runs the suite, the job SHALL
write a digest of what failed to its log and its step summary, built from the run's failure
summary: for each failure the spec, the test, and the first line of its error, and the editor's
drawing where one exists, a drawn case's `before`, `expected` and `actual` among them. The digest
SHALL name the head commit, run, attempt, platform and group it describes. A job whose suite
passes SHALL write none.

#### Scenario: A drawn case fails

- **WHEN** a drawn case fails in a CI e2e job
- **THEN** the digest has a row with the case file's spec, the test title and the first line of the
  error, and carries the case's `before`, `expected` and `actual` drawing

#### Scenario: A spec that is not a drawn case fails

- **WHEN** a case that is not a drawn one fails after the editor opened
- **THEN** the digest carries the editor's drawing at the failure, which the worker recorded

#### Scenario: A drawn case's drawing appears once

- **WHEN** a failure's error holds a `before` column, as a drawn case's does
- **THEN** the digest carries that error's columns and not the editor's drawing at the failure
  beside it

#### Scenario: A failure whose error draws nothing keeps the recorded drawing

- **WHEN** a drawn case fails with an error that holds no `before` column, such as a case file
  that does not parse
- **THEN** the digest carries the editor's drawing at the failure

#### Scenario: A hook fails

- **WHEN** a `before` or `beforeEach` hook fails, or an `afterEach` hook fails after a test
- **THEN** the digest's row for the hook says no drawing was recorded, and does not carry the
  drawing of the test the hook follows

#### Scenario: An assertion's first line names no value

- **WHEN** a case fails on an `expect` whose first error line is the matcher's signature
- **THEN** the digest's row also carries the error's `Expected:` and `Received:` lines

#### Scenario: The job dies before the suite writes a summary

- **WHEN** the suite step fails before it writes a failure summary
- **THEN** the digest says no summary was written and what the suite step's outcome was, and does
  not report a test failure it did not read

#### Scenario: The suite failed and the summary names no failure

- **WHEN** the suite step fails and the summary it wrote lists no failure, as when a worker
  crashed before it wrote a dump
- **THEN** the digest says the suite failed and the summary read no failure, with the summary's
  counts of passed, failed and skipped tests

#### Scenario: The suite passed and a later step failed

- **WHEN** the suite step succeeds, a later step fails, and a summary file is on disk
- **THEN** the digest step writes nothing

#### Scenario: A stale summary from the cache

- **WHEN** an earlier step fails, the suite step is skipped, and a summary from an earlier run is
  on disk
- **THEN** the digest reports that no suite ran and reads no failure from that file

#### Scenario: A passing job

- **WHEN** a CI e2e job's suite passes
- **THEN** no digest is published for it

### Requirement: The digest is read through a check run

In `ci.yml`'s e2e jobs the digest SHALL also be published as a check run named
`digest: <platform> (<group>)` on the pull request's head commit, or on the pushed commit outside
a pull request, with the table and identifying facts in the check run's `summary` and the
drawings in `text`. Its conclusion SHALL be `neutral`, so it adds no red check and no required
check changes. The scheduled workflow SHALL publish no check run.

#### Scenario: A session reads the digest

- **WHEN** a session lists the check runs of a pull request whose e2e job failed and reads
  `digest: desktop (folding)` with `get_check_run`
- **THEN** the result's `output.summary` holds the table and the head commit's SHA, and
  `output.text` holds the drawings

#### Scenario: The scheduled workflow publishes no check run

- **WHEN** the newest-installer workflow runs a failing e2e job
- **THEN** its digest reaches the log and the step summary and no check run is created

#### Scenario: A pull request run attaches to the PR's head

- **WHEN** the failing job ran for a `pull_request` event
- **THEN** the check run is on the pull request's head commit and not on the merge commit the run
  checked out

### Requirement: The digest is bounded and never fails the job

The digest SHALL be built from whole blocks and cut only at line boundaries: a table row of at
most 10 failures with each cell capped, kept under 4,000 bytes with the byte cap winning over the
10, and failure blocks in order under 60,000 bytes, each failure's error capped at 4,000 bytes and
its recorded drawing at 3,000. Every cap SHALL count bytes and every cut SHALL be marked, with the
number of failures or lines left out. The log copy SHALL end with the table and the facts. A digest
that cannot be published as a check run, for want of a token that may write checks or for a
failed request, SHALL NOT change the job's result and SHALL still reach the log and the step
summary.

#### Scenario: Many failures

- **WHEN** 25 tests fail in one job
- **THEN** the summary has at most 10 rows, a line saying how many more failed, and stays under
  4,000 bytes, and the full job log remains the fallback

#### Scenario: A long cell

- **WHEN** a failure's `Received:` line is a whole document
- **THEN** its row holds the line cut at a character boundary and marked, and the table stays
  under 4,000 bytes

#### Scenario: Glyphs count as bytes

- **WHEN** the first failure's error and drawing are at their caps and made of multi-byte glyphs
- **THEN** that failure's heading, error and drawing together fit in the first 8,192 bytes of
  `text`

#### Scenario: The log ends with the table

- **WHEN** a failing job's log is read from its tail
- **THEN** the last lines are the table and the identifying facts, with a line giving how many
  lines of failure blocks precede them

#### Scenario: A token that cannot write checks

- **WHEN** the job's token is read-only, as on a Dependabot or fork pull request
- **THEN** the log and the step summary carry the digest, a warning names the refusal, and the
  job's conclusion is the suite's
