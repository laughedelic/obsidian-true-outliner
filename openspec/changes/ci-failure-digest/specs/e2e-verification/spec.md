## ADDED Requirements

### Requirement: A failing e2e job publishes a failure digest

When the e2e suite step of a CI job fails, the job SHALL publish a digest of what failed, built
from the run's failure summary: for each failure the spec, the test, and the first line of its
error, and the editor's drawing where one was recorded, a drawn case's `before`, `expected` and
`actual` among them. The digest SHALL name the head commit, run, attempt, platform and group it
describes, and SHALL be appended to the job's step summary. A job whose suite passes SHALL publish
none.

#### Scenario: A drawn case fails

- **WHEN** a drawn case fails in a CI e2e job
- **THEN** the digest has a row with the case file's spec, the test title and the first line of the
  error, and carries the case's `before`, `expected` and `actual` drawing

#### Scenario: A spec that is not a drawn case fails

- **WHEN** a case that is not a drawn one fails after the editor opened
- **THEN** the digest carries the editor's drawing at the failure, which the worker recorded

#### Scenario: The job dies before the suite writes a summary

- **WHEN** the suite step fails or never runs and no failure summary exists
- **THEN** the digest says no summary was written and what the suite step's outcome was, and does
  not report a test failure it did not read

#### Scenario: A passing job

- **WHEN** a CI e2e job's suite passes
- **THEN** no digest is published for it

### Requirement: The digest is read through a check run

The digest SHALL be published as a check run named `digest: <platform> (<group>)` on the pull
request's head commit, or on the pushed commit outside a pull request, with the digest's table
and identifying facts in the check run's `summary` and its drawings in `text`. The check run's
conclusion SHALL be `neutral`, so it adds no red check to a pull request and no required check
changes.

#### Scenario: A session reads the digest

- **WHEN** a session lists the check runs of a pull request whose e2e job failed and reads
  `digest: desktop (folding)` with `get_check_run`
- **THEN** the result's `output.summary` holds the table and the head commit's SHA, and
  `output.text` holds the drawings

#### Scenario: A pull request run attaches to the PR's head

- **WHEN** the failing job ran for a `pull_request` event
- **THEN** the check run is on the pull request's head commit and not on the merge commit the run
  checked out

### Requirement: The digest is bounded and never fails the job

The digest SHALL list at most 10 failures in `summary` and say how many more there were, SHALL keep
`summary` under 4,000 characters and `text` under 60,000, and SHALL mark whatever it cut. A digest
that cannot be published, for want of a token that may write checks or for a failed request, SHALL
NOT change the job's result and SHALL still reach the step summary.

#### Scenario: Many failures

- **WHEN** 25 tests fail in one job
- **THEN** the summary has 10 rows and a line saying 15 more failed, and the full job log remains
  the fallback

#### Scenario: A token that cannot write checks

- **WHEN** the job's token is read-only, as on a Dependabot or fork pull request
- **THEN** the step summary carries the digest, a warning names the refusal, and the job's
  conclusion is the suite's
