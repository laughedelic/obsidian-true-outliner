# Tasks

## 1. The spike

- [ ] 1.1 On a scratch branch with a one-job workflow of its own (push-triggered, never
  `ci.yml`), measure and record in `docs/research/ci-failure-digest.md`: whether `job.check_run_id`
  reaches a composite action; whether a step's `PATCH` of the job's own check run `output` is still
  there after the job completes, read with `get_check_run`; whether `GITHUB_TOKEN` with
  `checks: write` may create a check run; and which of a synthetic `text` of about 65,000 characters
  of drawing glyphs and one just past the limit the API refuses, counted in characters and in
  bytes. Verify the note carries each reading with its run link. If the patched output holds, the
  maintainer decides between it and the separate check run, and tasks 4 and 5 are revised through
  `openspec-update-change` first.

## 2. The harness records the drawing at failure

- [ ] 2.1 Add a record module beside `e2e-tests/known-failing.ts` that appends one JSON line per
  failure to the worker's own file and collects them in file-name order; `drawOnFailure` writes to
  it, `resetE2eReports` clears it. Verify with `npm run typecheck:e2e` and `ls .obsidian-cache/`
  after a narrow run of a spec with a failing case.
- [ ] 2.2 `writeFailureSummary` joins records to failures into `failures[].drawing`, through a pure
  function in `scripts/failure-digest.ts` that normalises both specs through the same function as
  `specDisplayPath`, keyed on spec, `test.parent` and title. Verify with unit tests (two specs
  sharing a title keep their own drawings; an absolute path, a `file://` URL and a repo-relative
  path meet), and end to end: a narrow run of a non-drawn spec with a failing test, then
  `jq '.failures[].drawing' .obsidian-cache/e2e-summary.json` showing a drawing. Negative
  controls: key the join on the title alone, or skip the normalisation, and a test fails.

## 3. The digest renderer

- [ ] 3.1 `scripts/failure-digest.ts` renders the check run's `title`, `summary` and `text`, and the
  Markdown for the log and the step summary, from a failure summary and the run's facts (head SHA,
  run, attempt, platform, group, suite outcome). Verify with unit tests for a drawn case, a hook
  failure, a failure with no recorded drawing, `failure` with no summary file, and `skipped` with
  a stale summary file present, which must read no failure from it. Negative controls: take the
  first error line from the last line and the drawn-case test fails; ignore the outcome and the
  stale-file test fails.
- [ ] 3.2 A row whose first error line is a matcher's signature adds the `Expected:` and
  `Received:` lines; a drawn case's recorded drawing is dropped, tested with a message built by
  `phaseMessage`. Verify with an `expect` message copied from a real failure and with that test.
  Negative control: render the first line alone and the `expect` test fails; keep the drawing and
  the drawn-case test fails.
- [ ] 3.3 Bounds in bytes: 10 rows, `summary` under 4,000, `text` under 60,000, one failure's error
  under 2,000, each cut marked. Verify with a 25-failure fixture, a failure whose drawing alone
  exceeds the cap, and a first failure of multi-byte glyphs whose first 8,192 bytes still hold its
  error. Negative controls: remove the row cap, and count characters in place of bytes, and each
  test fails.
- [ ] 3.4 A name or error holding pipes, backticks or HTML cannot break a table or a fence. Verify
  with a fixture holding each. Negative control: render with no escaping and the pipe test fails.

## 4. The publisher

- [ ] 4.1 `scripts/publish-failure-digest.ts` reads the summary file only after a `failure`
  outcome, prints the digest to stdout, appends it to `$GITHUB_STEP_SUMMARY` when set, and, with
  `--check-run`, creates the check run through `gh api` with `GH_TOKEN`, as
  `scripts/report-scheduled-run.ts` does, with `--dry-run` printing the request. Verify with a dry
  run over a fixture and a unit test of the request body through an injected runner: the head SHA
  from `pull_request.head.sha`, `neutral`, `details_url`. Negative control: post on `GITHUB_SHA`
  and the head-SHA test fails.
- [ ] 4.2 A refused or failed request prints a warning and exits 0, and the log and step summary
  still carry the digest. Verify with tests that make the runner throw. Negative control: let the
  throw escape and the test fails.

## 5. Wiring

- [ ] 5.1 `.github/actions/e2e/action.yml`: an id on the suite step, a `check-run` input (default
  `false`), and a last step with `if: failure()` and `continue-on-error: true` taking the head SHA,
  run id and attempt, platform, group and the suite step's outcome. `ci.yml` sets `check-run: true`
  and grants `contents: read` and `checks: write` to `e2e-desktop` and `e2e-mobile`;
  `newest-installer.yml` is unchanged. Verify with `npm run lint`, a YAML parse of the three files,
  and by reading the step's `if` against a job that fails at install.

## 6. The skill, its pointers, and the proof

- [ ] 6.1 `.agents/skills/ci-triage/SKILL.md`, under 80 lines, with symlinks in `.claude/skills/`
  and `.github/skills/`. Verify with `ls -l` on both links and by following each link in the file.
- [ ] 6.2 `steward` and CLAUDE.md name the skill where they say what to do about red CI, and
  CLAUDE.md's e2e section says where the digest is. Verify with `grep -n ci-triage` over the
  three files, and that no other part of CLAUDE.md changed.
- [ ] 6.3 The proof. On a scratch branch off this one, add two failing cases, a drawn case with a
  wrong `expected` and a spec outside the drawn cases, and open a draft PR against `main`. Read the
  desktop and mobile digests through `pull_request_read` (`get_check_runs`) and `get_check_run`
  with `textLimit` 8192, and the log tail through `get_job_logs`; record the sizes in the note.
  Close the scratch PR unmerged. A Dependabot PR's digest is read after landing and noted there.
- [ ] 6.4 The list of shapes in the skill is checked against #341's evidence and #355, and what
  #342 has found by then is added. Verify each entry names what it looked like, what it was, and
  the check that tells them apart.

## 7. Landing

- [ ] 7.1 `npm run lint`, `npm run typecheck`, `npm run typecheck:e2e`, `npm run typecheck:scripts`
  and `npm test`.
- [ ] 7.2 Sync the delta spec into `openspec/specs/e2e-verification/` and archive the change on this
  branch; `scripts/check-landed.ts` passes, with no version bump for a `chore` that touches neither
  `src/` nor `styles/`.
- [ ] 7.3 `openspec validate --all --strict` passes.
