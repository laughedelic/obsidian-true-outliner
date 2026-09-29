# Tasks

## 1. The marker in the format

- [ ] 1.1 In `scripts/notation.ts`, add `known-failing` to the preamble names, read as `#` and
      digits into `ParsedCase.knownFailing`, and add `actual: (ReadDocument & { header, lines }) | undefined`
      beside `results`, so a marked file's `actual` column is read as a drawn state and is not among
      `references`; an unmarked file keeps `actual` as a reference. Verify with
      `tests/notation.test.ts`: the "known-failing case file parses" scenario, `known-failing: 228`,
      `known-failing: #228 desktop` and the name given twice each refused with their line, and an
      unmarked file's `actual` still in `references`; negative control: accepting a bare `228`
      fails the refusal test.
- [ ] 1.2 Refuse a marked file with no `actual` column or two, unless parsed with `record`, and a
      marked file with no result column even with `record`. Verify with `tests/notation.test.ts`:
      the three refusals and the accepted recording; negative control: dropping the missing-`actual`
      refusal fails its test.
- [ ] 1.3 Extend `problems()` in `tests/case-files.test.ts`: a marked file's `actual` must read back
      as itself once drawn, and must not draw the same as every `expected` column. Verify with
      `tests/case-files.test.ts`: a marked file whose `actual` equals its `expected` is refused,
      naming it, and a glyph in `actual` that breaks the read-back is refused; negative control:
      comparing `actual` with only the first `expected` lets a two-phase file through and fails the
      two-phase test.

## 2. The verdict and its messages

- [ ] 2.1 In `e2e-tests/case-report.ts`, add `judgeKnownFailing(parsed, states)`: `passes` when every
      phase matches `expected`, `holds` at the first differing phase when that state matches
      `actual` (through `compareState`, so a column with no caret compares none), and `changed`
      otherwise, each with the phase and the differences. Verify with `tests/case-report.test.ts`:
      the three outcomes; a two-phase case whose first phase matches and whose second differs the way
      `actual` draws; an `actual` with no caret that pins text only; negative control: judging the
      last phase instead of the first differing one fails the two-phase test.
- [ ] 2.2 Add the messages: `known-failing #N: case … passes` and the marker to remove; `… differs
      from its recorded result` with `before`, `expected`, `actual (recorded)` and `actual (now)`; and
      the still-failing line `known-failing #N: case … still differs in …` with the drawing of
      `before`, `expected` and `actual`. Verify with `tests/case-report.test.ts`, each message stated
      in full; negative control: dropping the issue number from the first line fails all three.
- [ ] 2.3 Make `recordedCase` keep the marker and the `expected` columns of a marked file and write
      the state at the first differing phase as `actual`, or report that no phase differs. Verify with
      `tests/case-report.test.ts`: the recorded text of a marked file, and of one where nothing differs;
      negative control: writing `after` columns for a marked file fails the first.

## 3. The runner

- [ ] 3.1 In `e2e-tests/specs/98-drawn-cases.e2e.ts`, judge a marked case with `judgeKnownFailing` in
      place of the per-phase throw: `passes` and `changed` throw their messages, `holds` logs the
      drawing and writes the record of 4.1. `before`, key errors and parse errors stay as they are, and
      `--record` on a marked file uses 2.3. Verify with `npm run test:e2e:narrow -- drawn-cases` and
      `--mobile` against the files of 5.1 and a scratch file for each outcome; negative controls, on
      both platforms: changing one character of a shipped `actual` fails that case as `differs from its
      recorded result`; deleting a shipped file's marker fails it as an ordinary case; marking a case
      that passes (#278's second case from the research prototypes) fails it as `passes`.
- [ ] 3.2 Run `npm run case -- <marked file> --record` on each platform and read what is written.
      Verify: for each file of 5.1 the recording's `actual` equals the one committed, on both
      platforms; negative control: a file with no `actual` and one with an `expected` the app already
      gives print the recorded column and the "nothing differs" note respectively.

## 4. The report

- [ ] 4.1 Add `scripts/known-failing.ts`: the record's type, `collapseRecords(text)` (one entry per
      complete JSON line, a partial line skipped) and `renderStepSummary(entries, repository)` (a table
      of case, issue link, platform and differences, each drawing in a `<details>`, and nothing for no
      entries). Verify with `tests/known-failing.test.ts`: two entries collected across two workers'
      files, a cut-short line skipped, the rendering stated in full, and nothing rendered for an empty
      list; negative control: rendering the issue as text and not a link fails the rendering test.
- [ ] 4.2 In `e2e-tests/wdio.shared.mts`, add the record directory
      (`.obsidian-cache/known-failing/`), clear it in `resetE2eReports`, and collect it in
      `writeFailureSummary` as `knownFailing` beside `failures` with one stdout line per entry;
      `failed` and `failures` stay as they are. The spec writes one line per `holds` verdict.
      Verify with `npm run typecheck:e2e`, and a narrow run of the shipped cases on each platform whose
      `.obsidian-cache/e2e-summary.json` holds them under `knownFailing` and none under `failures`
      (`jq '.knownFailing, .failures'`); negative control: with one shipped marker removed, the same run
      lists two entries and one failure.
- [ ] 4.3 Add `scripts/known-failing-summary.ts`, reading the summary file and printing 4.1's
      rendering, and one step in `.github/actions/e2e/action.yml` that appends it to
      `$GITHUB_STEP_SUMMARY` after the run whatever its status. Verify with
      `npm run typecheck:scripts`, the script run on a summary written by 4.2, and the checkpoint push
      of this branch: the `drawn-cases` jobs of both platforms show the three cases in their step
      summaries and no other job shows a table; negative control: the script run on the summary of
      a run with no still-failing case, and with no summary file, prints nothing and exits 0.

## 5. Shipped case files and documentation

- [ ] 5.1 Write the three case files: #228's first case under `e2e-tests/cases/structural-operations/`,
      #275 under `structural-history-integration/` and #215 under `structural-operations/`, each with
      the issue in `known-failing` and `case`, `expected` from the issue, and `actual` recorded on
      both platforms by 3.2. Verify: all pass on both platforms, and `tests/case-files.test.ts`
      accepts them; negative control: 3.1's three mutations.
- [ ] 5.2 Extend the "Case files" section of `.agents/skills/presenting-examples/SKILL.md` with the
      marker, the `actual` column and the drawn outcomes, and `AGENTS.md`'s e2e section with where a
      bug's case file is committed (the fix's change, from its proposal onward) and that the fix removes
      the marker. Verify: the commands in the section run on a drawn block from the tracker, put through
      `layout.ts --read`, given `known-failing`, recorded and run; negative control: the same file
      without its `actual` is refused with its line.
- [ ] 5.3 Add `Covered by` lines to the delta spec for `tests/notation.test.ts`,
      `tests/case-report.test.ts`, `tests/case-files.test.ts`, `tests/known-failing.test.ts` and
      `e2e-tests/specs/98-drawn-cases.e2e.ts`. Verify: every named file exists (`ls`).

## 6. Validation

- [ ] 6.1 `npm run lint`, `npm run typecheck`, `npm run typecheck:e2e`, `npm run typecheck:scripts`
      and `npm test` pass.
- [ ] 6.2 `npm run test:e2e:narrow -- drawn-cases` and with `--mobile` pass, and CI's `drawn-cases`
      jobs on both platforms are green with the three cases listed in their step summaries.
- [ ] 6.3 `openspec validate known-failing-case-files --strict`.
