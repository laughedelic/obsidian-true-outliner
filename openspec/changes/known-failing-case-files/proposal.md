# Proposal

## Why

A case file for an open bug fails until its fix lands, and a failing case fails the suite, so the
repro cannot be committed with the report
([#307](https://github.com/laughedelic/obsidian-true-outliner/issues/307)). It stays a drawing in
the issue that nothing runs, and a scratch file run with `npm run case`, until the fix turns it
into a regression case. The archived `drawn-case-files` change left this out on purpose ("a case
file for an open bug lands with its fix"); the runner it built already prints what the app does, so
the information exists and only the file has no way to carry it.

`docs/research/drawn-case-files` ("Waiting on a fix") reads the drawings of the 13 open issues the
report names as case files and runs them on desktop and under mobile emulation. Most run and
differ. Some differ in a way the drawing does not state: a key that means something else on
Linux, a drawing measured on an operation the app's own gesture does not reach. One passes today,
because what it draws is a refusal message and not a document. A marker that took any difference
for the bug would hold for the first kind with no bug behind it, and could never see the second.

## What Changes

- A case file gains a preamble name, `known-failing: #<issue>`, which says the case waits on that
  issue's fix. The file then also holds an `actual` column: the result the app gives while the bug
  stands, recorded by `--record` and drawn beside `expected`.
- A marked case runs like any case, and its verdict depends on what the app produced:
  - every phase matches `expected`: the case **fails**, saying the marker is to be removed with
    the fix, so the fix's change is the one that turns the case into a regression guard;
  - the first phase that differs from `expected` matches `actual`: the case **passes**, and the
    run reports it as still failing;
  - it differs from both: the case **fails**, drawing `expected`, the recorded `actual` and what
    the app gave now, since the bug changed or was never the one drawn.
  A `before` the editor does not hold, an error while pressing keys and a file that does not parse
  fail as before; the marker waits on a difference in a result and nothing else.
- Where the report goes: the drawing is printed in the run's output; each still-failing case is
  written to a record that the launcher collects into a `knownFailing` list in
  `.obsidian-cache/e2e-summary.json` and prints beside the failures; and the CI job's step summary
  renders that list, so a run shows which known-failing cases still fail without failing.
  `scripts/known-failing-summary.ts` renders it.
- `--record` on a marked file keeps its marker and `expected` columns and writes the state the app
  gave as `actual`.
- The unit suite refuses a marked file whose `actual` is missing, does not read back as itself,
  or draws the same as every `expected` (a marker waiting on nothing).
- Three real case files ship, each waiting on an open issue no pull request is fixing: #228's first
  case (carets drawn on both sides), #275 (two phases, undo inside 500 ms) and #215 (tab
  indentation, no caret in the result), recorded on both platforms.
- The `presenting-examples` skill documents the marker and the `actual` column, and `AGENTS.md`
  says where a bug's case file is committed and removed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `drawn-case-files`: the case-file format gains `known-failing` and the `actual` column's role;
  the runner gains the three verdicts and `--record` on a marked file; a marked case that still
  fails is reported in the run, the summary and the CI step summary; the unit check of case files
  covers the new column.

## Non-goals

- **Marking an ordinary e2e spec as known-failing.** Case files are the only place the format
  applies, as #307 says.
- **Naming a platform in the marker.** Every case run on desktop and under mobile emulation ended
  the same way on both, so `known-failing: #<issue>` holds on every platform the case runs on, and
  `platform:` still restricts a case. The value can take a platform later without changing the
  files written now (`docs/research/drawn-case-files`, "Waiting on a fix").
- **Results that are not documents.** A drawing whose result is a refusal message (#278's second
  case), a landing place (the drags of #278 and #279), a parse tree (#261) or a command run by name
  (#250) stays in its issue; the runner compares documents, carets and block selections.
- **A case with two candidate results** (#228's second case). A case file holds one `expected`, so
  that case is committed when the decision it waits on is made.
- **Checking that the named issue is open, or closed by the change that removes the marker.** The
  runner already fails the case in the change that fixes the bug; a `Landed` rule would repeat it.
- **Pinning more than the drawn result.** `actual` states what `expected` states: the text, and
  the caret, selection or block selection where it draws one.
- **Moving the drawings of the other open issues into case files.** They land as their own
  changes require, with the marker this change adds.

## Impact

- `scripts/`: `notation.ts` (`known-failing`, `actual` in `ParsedCase`), `known-failing.ts` and
  `known-failing-summary.ts` (added, pure and a command line), `run-case.ts` (no change beyond
  its usage line, `--record` is the runner's).
- `e2e-tests/`: `case-report.ts` (the verdict, the messages, recording), `specs/98-drawn-cases.e2e.ts`
  (applies the verdict, writes the record), `wdio.shared.mts` (the record directory, its reset,
  the `knownFailing` list of the summary), `cases/` (three files).
- `tests/`: `notation.test.ts`, `case-report.test.ts`, `case-files.test.ts`, and a new
  `known-failing.test.ts`.
- `.github/actions/e2e/action.yml`: one step that appends the list to the job's step summary.
- `.agents/skills/presenting-examples/SKILL.md` (the symlinked copies follow), `AGENTS.md`,
  `docs/research/drawn-case-files.md` and `docs/research/prototypes/known-failing-cases/`, which
  hold the measurements this change rests on.
- Follows [#303](https://github.com/laughedelic/obsidian-true-outliner/pull/303), which added a
  per-worker record, a launcher-side collection and a step-summary script for the ambient monitors,
  in the same files (`wdio.shared.mts`, `action.yml`). The known-failing report reuses that
  pattern and stays in `e2e-summary.json`.
- CI: no new group. The cases run in the existing `drawn-cases` job on both platforms, whose
  step summary gains the list.
