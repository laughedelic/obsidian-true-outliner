# Design

## Context

A case file runs in `e2e-tests/specs/98-drawn-cases.e2e.ts`: it arranges `before`, presses each
phase and compares the state read with that phase's `expected` column (`compareState` in
`e2e-tests/case-report.ts`), and a difference throws an error whose message is the drawing. The
failure summary (`writeFailureSummary`, `e2e-tests/wdio.shared.mts`) is built from the JSON
reporter's dumps, which hold a message for a failed test and only a name, a duration and a state
for a passed one. See the proposal for why a case needs to wait on a fix.

`docs/research/drawn-case-files` ("Waiting on a fix") is the measurement under every decision
below: the 13 open issues' drawings as case files, run on both platforms, recorded, and compared
with what each drawing says the app does.

## Goals / Non-Goals

**Goals:**

- A repro can be committed with its report and costs the suite nothing while the bug stands.
- The change that fixes the bug is the one that removes the marker, without a person remembering.
- A run of the `drawn-cases` job shows which committed repros still fail.

**Non-Goals:**

- Anything in the proposal's Non-goals. In addition, no change to how an ordinary case is judged.

## Decisions

### D1. The marker is tied to a recorded result, not to "any difference"

`known-failing: #228` needs an `actual` column: the state the app gives while the bug stands. The
case holds while the app gives that, and not while it merely differs from `expected`.

In the measurement, some differing cases differ from the `actual` their issue draws, and one draws
a refusal where the app pastes inline. A marker that swallowed any difference would pass all of
them, each for a reason the issue does not state. The clearest is #115, whose drawing was made on
macOS: on Linux ⌘⌫ is Ctrl+Backspace, deleting one character, and the case differs in a way that
says nothing about the bug.

**Case 1: #115's ⌘⌫ at the end of a paragraph, run on Linux.**

before
```
# Title

Some text.┃
# Next
```

expected ⌘⌫
```
# Title

┃
# Next
```

actual ⌘⌫, as the issue draws it
```
# Title┃

# Next
```

actual ⌘⌫, what the app gave
```
# Title

Some text┃
# Next
```

Recording is how the column is written, so the caret in it is measured (`--record`, D5). `actual`
states what `expected` states: text always, and the caret, selection or block selection only where
the `expected` of the phase it stands for draws one. A file whose `expected` draws no caret pins text
only, as the measured files from issues that did not measure their carets do, and its recorded
`actual` draws none, so a caret the app places differently later does not fail the case.

Alternatives: **the bare marker of #307**, rejected above. **`actual` optional, pinned when
present**: rejected, since a marker without one is the bare marker and the four cases would be
written without it. **A hash or a description of the difference instead of a drawing**: rejected,
since the drawing is what a reader of the file and of the report reads.

### D2. Three outcomes, and an unexpected pass fails the case

Per platform, on the states the phases read:

1. every phase matches `expected` → **fail**, first line
   `case 228-1 no longer differs (desktop): remove known-failing: #228`;
2. the first phase that differs from `expected` matches `actual` → **pass**, reported (D4) under
   `known-failing #228: case 228-1 still differs in text (desktop)`;
3. it matches neither → **fail**, first line
   `case 228-1 differs from its recorded actual (desktop): known-failing #228`, drawing `before`,
   that phase's `expected`, `actual (recorded)` and `actual (now)`.

The failures of 1 and 3 carry their own first line; the rule of "A failing case prints a drawing"
that a first line names what differs applies to every other failure, and the delta says so.

A pass fails the case, and so the `drawn-cases` job, and does not only report. A report-only pass
leaves the marker where the fix's change need not touch it, and the case then guards nothing: the
whole point of the marker is that it goes in the change that fixes the bug. The measurement has
the other reason: #278's second case draws `refused` and passes today, and a report-only rule would
let it sit as a known bug the case cannot see, where a failing pass says so at its first run
(`docs/research/drawn-case-files`, "Waiting on a fix").

The phase judged is the first that differs, so `actual` is one column whatever the phase count, and
its header carries no meaning (`actual ⌘Z` is as good as `actual`). A marked case stops pressing
keys at that phase: the phases after it start from a state the case already knows is wrong, and
the failure drawings already stop there. A `before` that is not held, an error while pressing keys,
and a file that does not parse fail as they do without the marker, since the marker is about a
result. The whole verdict is a pure function of the parsed case and the states, beside
`compareState`, so the unit suite covers each outcome without Obsidian.

The unit check of a marked file uses the same comparison. It refuses a file whose `actual`, compared
with `compareState` against each `expected`, matches every one: the run could never see a
difference, so the file would fail as a pass at its first run. A caret in `actual` that no
`expected` draws is not a difference to that comparison, and is refused with the rest.

Alternative: **a pass only reports, and a lint rule fails a marker whose issue is closed**.
Rejected: it depends on the tracker, which a unit test cannot read, and a bug closed without a
fix would leave a marker that is right.

### D3. The marker names no platform

Every measured case ended the same on desktop and under mobile emulation, and the recorded states
are byte for byte the same (`docs/research/drawn-case-files`, "Waiting on a fix"). So the marker
holds on every platform its case runs on.
A bug seen on one platform is a case with `platform:`, which skips the other, and a case that
passes on one platform and differs on the other is red on the first at its first run, saying so.
`known-failing: #228 desktop` stays open as an extension, since the value is parsed as `#` and
digits and refuses anything after, and adding a word later changes no file written now.

### D4. The report goes to three places, and only the summary needs a channel

- **The run's output.** The case prints the drawing it prints for a failure, under a first line that
  names the issue (`known-failing #228: case … still differs in text (desktop)`), through the
  worker's `console.log`, which reaches the launcher's output (the failure hook already does).
- **The failure summary.** A passing case leaves the JSON reporter with a name, a duration and
  `passed`, so the drawing cannot come through it. A worker appends one JSON line per still-failing
  case to `.obsidian-cache/known-failing/<worker>.jsonl`, named by `WDIO_WORKER_ID` as the monitors'
  records are (`e2e-tests/monitors.ts`). `writeFailureSummary` collects the lines, skips a partial one, and adds
  `knownFailing` to `.obsidian-cache/e2e-summary.json`, beside `failures`, with one line per entry
  after the failures on stdout. `resetE2eReports` clears the directory, as it does the reports.
  `failed` and `failures` do not change: a still-failing case passed.
- **The job's step summary.** `scripts/known-failing-summary.ts` reads the summary file and prints a
  table of case, issue (linked through `GITHUB_REPOSITORY`), platform and what differs, with each
  drawing in a `<details>`. `.github/actions/e2e/action.yml` appends it to `$GITHUB_STEP_SUMMARY`
  after the run, whatever its status, beside the row it already writes. It prints nothing when
  there is no entry or no file.

The drawn cases are one group, so one job per platform runs every case file, and that job's summary
lists them. No group, matrix entry or workflow changes.

Alternatives: **a mocha skip after the drawing** (pending tests appear in the JSON with no message,
and Codecov's history would count them as skipped); **a separate report file**, as the monitors' `e2e-monitors.json`
is (the entries are a few lines and belong with the failures they are read beside, in the one file
`AGENTS.md` names); **printing only**, which a passing job's log hides.

### D5. Recording writes `actual`

`npm run case -- x.case --record` on a marked file keeps the marker, the keys and the `expected`
columns and writes the state at the first phase that differs from them as `actual`, under
`.obsidian-cache/cases/` as today. It draws a caret, selection or `▒` in `actual` only where that
phase's `expected` draws one. When no phase differs it says so and writes no `actual`, since
the marker would be an unexpected pass. A marked file is drafted with `before`, keys and the
`expected` the fix would give, run with `--record` on each platform to see that the results
agree, and the recorded `actual` is copied in. That is the workflow #307 asks for, and the drawing
in the issue becomes the file's `expected`.

The issue's own headers need a step. The tracker's `after ⇧⇥` is what happened, and a case file
reads `after` as what should; the file's `actual` is the tracker's `after`. `layout.ts --read`
gives the columns as drawn, and renaming a header is by hand
(`docs/research/prototypes/known-failing-cases/assemble.mjs` does it for the 13).

### D6. What ships

Two case files, each on an open issue that no open pull request closes (#270 closes #244, #264
closes #198, #273 closes #250, so those are left): #228's first case under `structural-operations`,
which draws carets on both sides, and #255's first case under `structural-operations`, which draws
none in its result. Each is recorded on both platforms, and each fix's pull request removes its
marker. #275 is left out because its bug needs two key presses within 500 ms of each other, and a
slow CI run would give the fixed result and turn the job red on a bug that still stands; #215 is
left out because its issue calls its `expected` a candidate, and the grandchild rule it depends on
is still open. They are also what makes the report visible: the first CI run of this change's
branch lists them in both `drawn-cases` step summaries.

## Risks / Trade-offs

- **A recorded `actual` pins caret and text, so a change nearby that moves them fails the case** →
  the failure is the drawing of the four columns, which says what moved; that is the bug changing
  shape, which someone should see. A file with an `expected` that draws no caret pins text only.
- **A timing bound could make a case flaky, and an unexpected pass then fails a job** → the two
  timing-sensitive cases (#275, #146) were repeated on each platform and gave one drawing each,
  every time (same note), on one machine. A slower runner is a different measurement, so a case whose
  bug depends on a time bound is not committed as known-failing until it has run repeatedly in CI.
- **CI runs the latest Obsidian, and the scheduled workflows run other builds, so a recorded caret or
  text can differ there** → the case then fails as `differs from its recorded actual`, drawing the
  four columns, which is what a change of Obsidian's behaviour under a bug should do; the scheduled
  runs report their failures already.
- **A stale `e2e-summary.json` restored with `.obsidian-cache` would list cases a job that died
  early never ran** → the action removes the summary before the run.
- **A marker outlives its issue, closed without a fix** → the report lists it in every run, with
  its issue linked; nothing fails, and nothing in the repository knows the issue's state.
- **The recorded `actual` is the app's answer on the machine that recorded it** → the two platforms
  are recorded and compared before the file is committed, and CI runs both.
- **The report is best effort: a worker killed mid-write leaves half a line** → the launcher skips
  a line that does not parse, and the summary still lists the rest.
