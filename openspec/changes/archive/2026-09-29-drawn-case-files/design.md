# Design

## Context

The notation lives in a skill script that only draws: `layout.mjs` read columns and printed a
block. The e2e harness reads the buffer and the caret through separate helpers and asserts on
values. `docs/research/drawn-case-files` measures what closes the gap: every drawing in the
tracker reads back (208 of 208 blocks), the editor's state is one page-side read, and a case is
about 80 ms in a running spec (30 ms to arrange, 33–45 to press a key, 8 to read). The wdio
runner already carries a case's error message to the reporter and the JSON summary whole, and
prints only its first line in the summary on stdout.

## Goals / Non-Goals

**Goals:**

- One definition of the notation, read and drawn by the same code, so a drawing the skill makes
  and a drawing the runner prints cannot drift.
- A drawn repro from an issue runs as written, and a mismatch is reported in the notation it was
  written in.
- Nothing new to launch: the runner is a spec in the existing groups, on both platforms.

**Non-Goals:**

- Anything the notation cannot draw today beyond the multi-line selection (see the proposal).

## Decisions

### D1. The notation is `scripts/notation.ts`, and the layout script is `scripts/layout.ts`

`notation.ts` exports what the consumers share: reading a column (`readDocument`), drawing a state
(`drawDocument`), laying columns out (`layout`), reading a drawn block (`undraw`), and parsing a
case file and its keys line. `layout.ts` is its command line. Both are TypeScript run by Node's own
type stripping and checked by `npm run typecheck:scripts`, as the repository's other tooling
scripts are, and the driver of #298 already sits there. The e2e harness, the unit suite and
`scripts/drive-state.ts` import the module with its types, so `drive-state.ts` no longer keeps a
copy of the layout. The skill directory keeps `SKILL.md`, which tells an agent to run
`node scripts/layout.ts`.

Alternative: keep the module as `.mjs` in the skill directory, with a `.d.mts` for the TypeScript
consumers. Rejected: it is the one script of ours outside `scripts/` and outside the type check, and
it left `drive-state.ts` unable to import it.

### D2. A column reads to text and a selection by fixed rules

- `┃` is the caret; `«…»` is a selection, with `┃` touching one end to name the head (after `»` for
  a forward selection, before `«` for a backward one) and the end as the default. A `┃` anywhere
  else beside a selection, a second `┃`, or an unclosed `«` is an error naming the line.
- `«` may close on a later line. The newlines between are part of the selection, so a selection
  across lines has one reading. The underline continues from the opening line to the closing one.
- `▒` opens a block-selected line and states no range. Read as `before`, it is a precondition
  the runner checks by arranging a range over those lines and reading the chrome back; read as
  `expected`, it is compared with the chrome the editor paints. A column with both `▒` and a caret
  is an error, as the skill says a block selection has none.
- `‸` names a paste point and is read as the caret in a `before` with no `┃`; in a result it is
  ignored.
- The end of the text follows the skill: `∅` after a line's text is no final newline, `∅` on a
  line of its own is a final newline and an empty last line, and no `∅` is a final newline, which is
  how every note in the vault ends. Drawing follows the same rules, and leaves `∅` off exactly when
  it would be read back as the default, so reading what was drawn returns the state.
- A column states no selection when it has none of the glyphs above. As `before`, the runner then
  holds the editor to its text only; as a result, it does not compare the caret and says so in a
  failure's drawing.

Alternative for the drawn end of the text: always draw `∅`. Rejected: the skill asks for it only
when the end is the point, and the measurement found it in 10 of 208 blocks.

### D3. A case file is the column input with a preamble

```
case: ⇥ indents under the sibling above
tabs: on
keys: ⇥ | ⇧⇥

=== before
- a
- b┃
=== after ⇥
- a
⏵   - b┃
=== after ⇧⇥
- a
- b┃
```

(Tabs are real tabs in the file; they are drawn here as `⏵` only for reading.) Preamble lines are
`name: value` and end at the first `===`. The names are `case`, `outline` (`on`, the default, or
`off`), `tabs` (`off`, the default, or `on`, the "Indent using tabs" setting), `platform`
(`desktop`, `mobile`; both by default) and `keys`; any other name, or a value outside the list, is
an error with its line number. Columns: `clipboard` optional; `before` required; result columns are
those whose header starts `expected` or `after`, one per phase in order, so a `keys` line with
three phases has three; `actual` is ignored, which lets a failure report run again unchanged;
every other header is a reference the runner ignores, so a column with a history name pasted from
an issue does no harm and a misspelled `expected` fails as a missing column.

No `keys` line means no phase: the runner arranges `before` and compares it with the one result
column, which is how a drawn caret is measured without pressing anything.

A `keys` phase is steps separated by spaces. A step is a chord — `⌘ ⌃ ⌥ ⇧` in front of `⇥ ⏎ ⌫ ⌦ ↑ ↓ ← →
⎋` or one character — a spelled key (`Home`, `End`, `PageUp`, `PageDown`, `Esc`) or a spelled
chord (`mod-shift-enter`), or quoted text typed as characters, with `×N` for a repeat. ⌘ is the
platform's Mod key, Ctrl on Linux and Windows. ⌘V writes the `clipboard` column to the clipboard
and presses the paste chord, which is what `pasteText` does today; a ⌘V with no `clipboard`
column is an error. The vocabulary is the tracker's: 132 of 208 sentences use these symbols and
none writes a repeat other than by repeating the symbol, which reads as itself.

Alternative for several steps: a keys line in each column's header, as 69 tracker blocks do.
Rejected: those headers are labels first, and none of the blocks says whether a header lists the
keys since the previous column or since the start.

Alternative for the preamble: YAML front matter. Rejected: the layout script already refuses text before
the first header, and five names and a keys line do not need a parser.

### D4. Case files live under `e2e-tests/cases/<capability>/`

The directory is the name of a capability under `openspec/specs/`, checked by the unit suite, so a
spec's `Covered by` line can name a case file the way it names a spec title and the two are
connected by path. A repro is a case file in the session's scratch directory until the fix that
closes it lands, then moves under its capability. Existing specs do not move; a change that
touches a spec whose cases are state and keys may convert them, which the survey says is
`30-keyboard-grammar`, `65-content-space-caret` and `31-tab-indented-vault` first.

Alternative: beside the OpenSpec specs, `openspec/specs/<capability>/cases/`. Rejected: that tree
holds prose the OpenSpec CLI reads, and the runner's files change on the e2e cadence.

### D5. The runner is one generated spec

`e2e-tests/specs/98-drawn-cases.e2e.ts` registers one mocha case per file found under
`e2e-tests/cases/`, or per path in `TO_CASE_FILES` when that is set. It is a spec, so it runs in
the group machinery, on both configs, under `npm run test:e2e:narrow -- drawn-cases <name>` and in
the failure summary, and no launcher of its own is written. `scripts/run-case.ts` is what an agent
runs: it sets `TO_CASE_FILES` from its arguments and calls the narrow runner, so a case file in a
scratch directory runs as `npm run case -- /tmp/x.case [--mobile] [--record]`.

Its group is its own, marked exclusive beside `clipboard`: ⌘V writes the machine's clipboard, and
`spec-groups.ts` records what parallel workers did to specs that share it.

Per case: a fresh note holding `before`'s text (a case in a shared note is one way a widget from
an earlier case reaches a later one, `docs/research/drawn-case-files`), the two settings, then one
`executeObsidian` call that sets focus and selection and reads the state back. If the state read is
not the drawn `before` (text, then selection or chrome), the case fails there, drawing what it
holds beside what was drawn, since the drawing being unreachable is a finding about the drawing.
A caret that a task-item widget moves after mount (`docs/research/open-questions` Q25) is
re-arranged by polling the read-back for up to the harness budget before it counts as not held.
Each phase then presses its keys and reads. The settings are restored after the case.

`platform` skips a case on the other config through mocha's `this.skip()`, and logs why.
`--record` never fails on a difference; a `before` the editor does not hold still fails, since
there is no start to record from.

### D6. The failure is a verdict and a drawing

The first line names the case, what differs (`text`, `caret`, `selection`, `block selection`) and the platform,
because `writeFailureSummary` prints only that line on stdout. Under it the keys line and setup,
then one drawing: `before`, and for the first phase that differs, `expected` and `actual`. Later
phases are not drawn, since they depend on it. A phase whose `expected` draws no caret or selection prints
that none was compared, and its `actual` column carries the caret anyway. `--record` prints, and
writes to `.obsidian-cache/cases/<slug>.<platform>.case`, the case file with its result columns
filled from the app, which is a bug's first reply and a fix's `expected`.

### D7. The read is a function of `app` and returns data

`readEditorState` in `e2e-tests/drawing.ts` is one function of `{ app, obsidian }` with no
closure: `{ text, ranges, main, blockLines, focused }`. Drawing a state and comparing it with a
column are pure and sit in `state-drawing.ts` and `case-report.ts`, which the unit suite imports;
`drawing.ts` is what needs a browser. It is passed to `browser.executeObsidian` here
and can be serialised with `toString()` for the DevTools-protocol evaluation of #287 and #290.
`blockLines` comes from the lines carrying `to-decor-node-selected`, so `▒` says what is painted;
lines off screen have no element, and a drawing with a selection cover that reaches past the
viewport says so. `drawStates` lays states out as columns, in the test process, and `drawEditor()`
is the two together. A state with more ranges than one draws the main range and adds a line saying
how many there were; one whose editor does not have focus and shows no `▒` draws its caret and
says so.

An `afterTest` hook in `wdio.shared.mts`, chained after the screenshot in both configs, prints
`drawEditor()` for a failing case and swallows its own errors, as the screenshot does.

Alternative: derive `▒` in the test process from the ranges with the plugin's own cover logic.
Rejected: a helper that shares the plugin's logic reports what the plugin believes, and the
measurement in `docs/research/rendered-ui-observability` is about what is painted.

### D8. A drawing is stacked blocks; side by side is for terminals

The first glyph set drew states side by side, with `┆` as each column's edge, `⏵` and three
spaces as a tab, and an underline for a selection. On GitHub and on a phone those glyphs are not
one cell wide, and columns to their right stop lining up (`docs/research/drawn-case-files`,
"Glyphs and fonts"). The layout script now draws each column as its own fenced block under its
header, in the case file's own form with only the whitespace made visible: a tab is `→ `, a space
touching a tab or ending a line is `·`, a selection stays `«…»`. Nothing in it depends on a glyph's
width. `--columns` keeps the side-by-side form for terminals, where failure output and the
driver's `state` print it; it draws a tab the same way and keeps `┆` and the underline.
`--read` reads either form, and reads the earlier tab (`⏵` with padding) too, so the drawings
already in the tracker still read.

`‸` stays, `┃ « » ▒ ∅` stay. `┃` and `∅` are absent from Liberation Mono, which is in GitHub's
monospace stack; nothing has reported a problem with them.

Alternative: a different edge glyph (`│`) for the side-by-side form. Rejected: it moves the problem
to another glyph, and a maintainer reported the same narrowing for it on a phone. Alternative:
render an image per state. Deferred to the evidence-clip work of #292, which needs hosting anyway.
Alternative: an HTML table with a `<pre>` per cell. Rejected: GitHub-only, and chat shows the
tags.

## Risks / Trade-offs

- **`·` in a drawing is a space** → `--read` says so and a note containing a middle dot cannot be
  read back through a drawing; a case file holds the literal text, which has no such loss.
- **A case file's trailing spaces are content** → an editor that trims them changes the case.
  `.editorconfig` turns trimming off for `*.case` and the skill says so; nothing checks it.
- **A line break has no underline** → a selection that begins at the end of a line or ends at the
  start of one draws the same as a shorter one, and reading a drawn block returns the shorter. The
  state helper draws such a selection with `«` and `»` where they are, and a case file states it
  the same way; only `--read` of a drawing loses it.
- **A note holding `┃ « » ‸ ∅ ▒`** cannot be drawn reversibly, so `--record` refuses it and the
  skill says a case file cannot hold them.
- **A drawing that is right about the state and wrong about when** (three in the tracker) → the
  runner fails at `before` with what it holds; the skill tells a drawing's author to draw `before`
  as the start.
- **A `▒` cover reaching past the viewport** → chrome exists only for rendered lines; cases are
  small, and the drawing notes what it could not see.
- **Exclusive group** → the cases run alone in their job; at about 80 ms each that is a launch and
  a few seconds.
- **The reference columns are ignored** → an author who means one as a result gets no assertion.
  A failure's first line names the columns it ignored.

## Open Questions

- Whether a case may carry a second setup for a control column (off-mode, native Obsidian), which
  the skill draws as one more result column.
- Whether a case file for an open bug should be able to say so and fail only when it starts
  passing.
- Zoom and fold state as preamble names, when the first case needs one.
