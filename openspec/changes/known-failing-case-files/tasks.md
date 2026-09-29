# Tasks

## 1. The marker in the format

- [x] 1.1 In `scripts/notation.ts`, widen the preamble's name pattern (`/^([a-z]+): ?(.*)$/`, which
      a hyphen does not match) to take `known-failing`, add it to the names, read it as `#` and
      digits into `ParsedCase.knownFailing`, and add `actual: (ReadDocument & { header, lines }) | undefined`
      beside `results`, so a marked file's `actual` column is read as a drawn state and is not among
      `references`; an unmarked file keeps `actual` as a reference. Verify with
      `tests/notation.test.ts`: the "known-failing case file parses" scenario, `known-failing: 228`,
      `known-failing: #228 desktop` and the name given twice each refused with their line, and an
      unmarked file's `actual` still in `references`; negative controls: accepting a bare `228`
      fails the refusal test, and reverting the pattern to `[a-z]+` fails the parse of a good marker.
- [x] 1.2 Refuse a marked file with no `actual` column or two, unless parsed with `record`, and a
      marked file with no result column even with `record`. Verify with `tests/notation.test.ts`:
      the three refusals and the accepted recording; negative control: dropping the missing-`actual`
      refusal fails its test.
- [x] 1.3 Extend `problems()` in `tests/case-files.test.ts`: a marked file's `actual` must read back
      as itself once drawn, and must not match every `expected` column under `compareState`. Verify
      with `tests/case-files.test.ts`: a marked file whose `actual` equals its `expected`, or differs
      only by a caret its `expected` does not draw, is refused, naming it; a two-phase file whose `actual` equals the first `expected` and
      differs from the second is accepted; negative control: comparing `actual` with only the first
      `expected` refuses that two-phase file and fails its test, and comparing whole drawings and not
      `compareState` accepts the caret-only file and fails its test.

## 2. The verdict and its messages

- [x] 2.1 In `e2e-tests/case-report.ts`, add `judgeKnownFailing(parsed, states)`: `passes` when every
      phase matches `expected`, `holds` at the first differing phase when that state matches
      `actual` (through `compareState`, so a column with no caret compares none), and `changed`
      otherwise, each with the phase and the differences. Verify with `tests/case-report.test.ts`:
      the three outcomes; a two-phase case whose first phase matches and whose second differs the way
      `actual` draws; a two-phase case whose first phase differs the way `actual` draws and whose
      second matches its `expected`; an `actual` with no caret that pins text only; negative control:
      judging the last phase instead of the first differing one gives `passes` for the second
      two-phase case and fails its test.
- [x] 2.2 Add the three messages with the first lines D2 states — `case … no longer differs
      (<platform>): remove known-failing: #N`, `case … differs from its recorded actual (<platform>):
      known-failing #N` with `before`, `expected`, `actual (recorded)` and `actual (now)`, and
      `known-failing #N: case … still differs in … (<platform>)` with the drawing of `before`,
      `expected` and `actual`. Verify with `tests/case-report.test.ts`, each message stated in full;
      negative control: dropping the issue number from the first line fails all three.
- [x] 2.3 Make `recordedCase` keep the marker and the `expected` columns of a marked file and write
      the state at the first differing phase as `actual`, drawing a caret, selection or `▒` only where
      that phase's `expected` draws one, or report that no phase differs. Verify with
      `tests/case-report.test.ts`: the recorded text of a marked file, of one whose `expected` draws no
      caret, and of one where nothing differs; negative controls: writing `after` columns for a marked
      file fails the first, and drawing the caret always fails the second.

## 3. The runner

- [x] 3.1 In `e2e-tests/specs/98-drawn-cases.e2e.ts`, judge a marked case with `judgeKnownFailing` in
      place of the per-phase throw: the loop is `runPhases` in `case-report.ts`, which presses no key
      after the first differing phase of a marked case and is tested with fake key and read
      functions, and the body of a case is `runCase`, which the spec's own in-app tests call with
      sources given inline. `passes` and `changed` throw their messages, `holds` logs the drawing and
      writes the record of 4.2. `before`, key errors and parse errors stay as they are, and `--record` on a marked file uses 2.3. Verify
      with `npm run test:e2e:narrow -- drawn-cases` and `--mobile` against scratch files under
      `TO_CASE_FILES`, one per outcome (the prototypes' `228-1.case` and `255-1.case` marked with
      their `actual`, a two-phase file with a later phase that would differ, and a file whose `before`
      draws a caret the editor cannot hold); negative controls, on both platforms: changing one
      character of an `actual` fails that case as `differs from its recorded actual`; deleting a
      marker fails the case as an ordinary case; marking a copy of `278-2.case` given an `actual`
      that differs from its `expected` fails it as `no longer differs`; the unreachable `before`
      fails at `before` with the marker present, and passes through to a `before` failure without it.
- [x] 3.2 Run `npm run case -- <marked file> --record` on each platform and read what is written.
      Verify: the recording of each scratch file of 3.1 has the `actual` its case passes with, on
      both platforms, and none for a caret its `expected` does not draw; negative control: a file
      whose `expected` the app already gives prints the "nothing differs" note and no `actual`.

## 4. The report

- [x] 4.1 Add `scripts/known-failing.ts`: the record's type, `collapseRecords(text)` (one entry per
      complete JSON line, a partial line skipped) and `renderStepSummary(entries, repository)` (a table
      of case, issue link, platform and differences, each drawing in a `<details>`, and nothing for no
      entries). Verify with `tests/known-failing.test.ts`: two entries collected across two workers'
      files, a cut-short line skipped, the rendering stated in full, and nothing rendered for an empty
      list; negative control: rendering the issue as text and not a link fails the rendering test.
- [x] 4.2 In `e2e-tests/wdio.shared.mts`, add the record directory
      (`.obsidian-cache/known-failing/`, files named by `WDIO_WORKER_ID` as
      `e2e-tests/monitors.ts` names its own), clear it in `resetE2eReports`, and collect it in
      `writeFailureSummary` as `knownFailing` beside `failures` with one stdout line per entry;
      `failed` and `failures` stay as they are. The spec writes one line per `holds` verdict.
      Verify with `npm run typecheck:e2e`, and a narrow run of the shipped cases on each platform whose
      `.obsidian-cache/e2e-summary.json` holds them under `knownFailing` and none under `failures`
      (`jq '.knownFailing, .failures'`); negative control: with one shipped marker removed, the same run
      lists one entry and one failure.
- [x] 4.3 Add `scripts/known-failing-summary.ts`, reading the summary file and printing 4.1's
      rendering, and two changes in `.github/actions/e2e/action.yml`: the summary file is removed
      before the run, so a restored one is never read, and one step appends the rendering to
      `$GITHUB_STEP_SUMMARY` after the run whatever its status. Verify with
      `npm run typecheck:scripts`, the script run on a summary written by 4.2, and the checkpoint push
      of this branch: the `drawn-cases` jobs of both platforms show the two cases in their step
      summaries and no other job shows a table; negative control: the script run on the summary of
      a run with no still-failing case, and with no summary file, prints nothing and exits 0.

## 5. Shipped case files and documentation

- [x] 5.1 Write the two case files: #228's first case and #255's first case under
      `e2e-tests/cases/structural-operations/`, each with the issue in `known-failing` and `case`,
      `expected` from the issue, and `actual` recorded on both platforms by 3.2's command. Verify: both
      pass on both platforms and `tests/case-files.test.ts` accepts them; negative control: 3.1's
      mutations, run on these files.
- [x] 5.2 Extend the "Case files" section of `.agents/skills/presenting-examples/SKILL.md` with the
      marker, the `actual` column and the drawn outcomes, and `AGENTS.md`'s e2e section with where a
      bug's case file is committed (the PR that plans the fix, from its proposal onward, or a `chore`
      PR of its own when nobody is fixing the bug yet) and that the fix's change removes the marker. Verify: the commands in the section run on a drawn block from the tracker, put through
      `layout.ts --read`, given `known-failing`, recorded and run; negative control: the same file
      without its `actual` is refused, naming the missing column.

## 6. Validation

- [x] 6.1 `npm run lint`, `npm run typecheck`, `npm run typecheck:e2e`, `npm run typecheck:scripts`
      and `npm test` pass, and every file the delta spec's `Covered by` lines name exists (`ls`).
- [x] 6.2 `npm run test:e2e:narrow -- drawn-cases` and with `--mobile` pass, and CI's `drawn-cases`
      jobs on both platforms are green with the two cases listed in their step summaries.
- [x] 6.3 `openspec validate known-failing-case-files --strict`.
