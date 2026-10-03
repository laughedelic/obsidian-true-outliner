# Tasks

## 1. The harness records the drawing at failure

- [ ] 1.1 Add a record module beside `e2e-tests/known-failing.ts` that appends one JSON line per
  failure to the worker's own file and collects them in file-name order; `drawOnFailure` writes to
  it, `resetE2eReports` clears it. Verify with `npm run typecheck:e2e` and a narrow run of a
  spec whose case fails on purpose, then `ls .obsidian-cache/` showing the record.
- [ ] 1.2 `writeFailureSummary` joins records to failures by spec file and test title into
  `failures[].drawing`, through a pure function in `scripts/failure-digest.ts`. Verify with
  `tests/failure-digest.test.ts`: two specs sharing a test title keep their own drawings.
  Negative control: key the join on the title alone and that test fails.

## 2. The digest renderer

- [ ] 2.1 `scripts/failure-digest.ts` renders the check run's `title`, `summary` and `text` and the
  step-summary Markdown from a failure summary and the run's facts (head SHA, run, attempt,
  job URL, platform, group, suite outcome). Verify with unit tests for a drawn case, a
  hook failure, a failure with no recorded drawing, and a run with no summary file. Negative
  control: render the first error line from the last line of the message and the drawn-case test
  fails.
- [ ] 2.2 Bounds: 10 rows, `summary` under 4,000 characters, `text` under 60,000, each cut marked.
  Verify with a 25-failure fixture and a failure whose drawing alone exceeds the cap. Negative
  control: remove the row cap and the 25-failure test fails.
- [ ] 2.3 A name or error holding pipes, backticks or HTML cannot break a table or a fence.
  Verify with a fixture holding each, rendered through the same escapes `known-failing.ts` uses.

## 3. The publisher

- [ ] 3.1 `scripts/publish-failure-digest.ts` reads the summary file, appends the Markdown to
  `$GITHUB_STEP_SUMMARY` when set, and creates the check run through `gh api` with `GH_TOKEN`,
  as `scripts/report-scheduled-run.ts` does, with `--dry-run` printing the request. Verify with a
  dry run over a fixture, and a unit test of the request body through an injected runner.
- [ ] 3.2 A refused or failed request prints a warning and exits 0, and a missing summary file
  renders the "no summary" digest. Verify with tests that make the runner throw. Negative
  control: let the throw escape and the test fails.

## 4. Wiring

- [ ] 4.1 `.github/actions/e2e/action.yml`: ids on the build and suite steps, then a digest step
  after the suite with `if: failure()` and `continue-on-error: true`, taking
  `github.event.pull_request.head.sha || github.sha`, the run id and attempt, the platform, the
  group and the suite step's outcome. `ci.yml` grants `contents: read` and `checks: write` to
  `e2e-desktop` and `e2e-mobile`. Verify with `npm run lint` and a YAML parse of both files, and
  by reading the step's `if` against a job that fails at install.

## 5. The skill, its pointers, and the proof

- [ ] 5.1 `.agents/skills/ci-triage/SKILL.md`, under 80 lines, with symlinks in `.claude/skills/`
  and `.github/skills/`. Verify with `ls -l` on both links and by following each link in the file.
- [ ] 5.2 `steward` and CLAUDE.md name the skill where they say what to do about red CI, and
  CLAUDE.md's e2e section says where the digest is. Verify with `grep -n ci-triage` over the
  three files, and that no other part of CLAUDE.md changed.
- [ ] 5.3 The proof. On a scratch branch off this one, add a drawn case whose `expected` is wrong
  and open a draft PR against `main`. Read the digest of the desktop and the mobile job through
  `pull_request_read` (`get_check_runs`) and `get_check_run` with `textLimit` 8192, and record the
  sizes, the limits and the token's right in `docs/research/ci-failure-digest.md`. Close the scratch
  PR unmerged. A Dependabot PR's digest is read after landing and noted there.
- [ ] 5.4 The list of shapes in the skill is checked against #341's evidence and #355, and what
  #342 has found by then is added. Verify each entry names what it looked like, what it was, and
  the check that tells them apart.

## 6. Landing

- [ ] 6.1 `npm run lint`, `npm run typecheck`, `npm run typecheck:e2e`, `npm run typecheck:scripts`,
  `npm test`, and `openspec validate ci-failure-digest --strict`.
- [ ] 6.2 Sync the delta spec into `openspec/specs/e2e-verification/` and archive the change on
  this branch; `scripts/check-landed.ts` passes, with no version bump for a `chore` that touches
  neither `src/` nor `styles/`.
