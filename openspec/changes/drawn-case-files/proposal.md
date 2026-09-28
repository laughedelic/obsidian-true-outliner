# Proposal

## Why

Bugs, fixes and manual passes are written as drawn cases — the document before, the keys, the
document after, caret included (`.agents/skills/presenting-examples/SKILL.md`) — and two things
keep that notation from doing its whole job
([#289](https://github.com/laughedelic/obsidian-true-outliner/issues/289), under
[#297](https://github.com/laughedelic/obsidian-true-outliner/issues/297)). A drawing does not run:
every repro is turned into a spec by hand, and the carets it draws are the author's prediction.
The harness does not draw: a case reads back `getBuffer()` and `getCursor()`, and what the real app
did reaches the reader as an assertion message rather than as the picture the case was written in.

`docs/research/drawn-case-files` measures both directions. The tracker holds 208 drawn blocks in 70
items, and a prototype read every one back into columns; the editor's state draws as the same
notation from one page-side read of about 8 ms; a case arranged in one call, run and read costs
about 80 ms. What a drawing leaves unsaid is the keys and the setup — 34% of the tracker's drawn
cases name no key at all — and the same measurement found three drawings whose `before` column
shows the state after the first key, so the drawing is right about the state and wrong about when.

## What Changes

- The notation moves out of `layout.mjs` into a module beside it that the layout script, the runner
  and the helper all import: a column of the literal document reads to text and selection, a state
  draws to a column, and a drawn block reads back into columns. `layout.mjs` keeps its command line
  and gains `--read`, which turns a block from an issue into column input, and `--case`, which
  draws a case file under its keys and settings.
- The notation gains a selection across lines: `«` on one line closes with `»` on a later line, and
  the underline continues between them. The tracker's #203 already draws one that way, and a
  stock-mode Shift+Arrow produces one.
- A **case file** (`.case`) is that column input with a preamble: an optional title, `outline`,
  `tabs` and `platform` settings, and a `keys` line whose phases (` | `) lead from `before` through
  each `expected` column. A `clipboard` column feeds ⌘V.
- One generated spec runs every case file under `e2e-tests/cases/<capability>/` in the real app, on
  desktop and under mobile emulation. It arranges the note, the caret and the settings in one call,
  checks the editor kept the drawn `before`, presses the keys, and compares the document, and the
  caret or block-selected lines where the `expected` column draws them. `npm run case -- <file>`
  runs a case file from anywhere, and `--record` prints what the app did as the `expected` column.
- A failing case's message is a verdict line and a drawing: `before`, `expected` and `actual` for
  the first phase that differs, the caret and selection read from the state.
- `e2e-tests/drawing.ts` holds the state-to-drawing helper — a self-contained page-side read and a
  `drawEditor()` any spec can call — and every failing e2e case prints the editor's drawing beside
  its failure screenshot.
- The skill documents case files and the reading side, and `AGENTS.md` makes a bug's repro a case
  file first. No existing spec moves.

## Capabilities

### New Capabilities

- `drawn-case-files`: the case-file format, the runner that executes it in the real app, the
  drawing it prints on a mismatch, and the helper that draws the editor's state.

### Modified Capabilities

None. `e2e-verification` describes the harness's guarantees; a case file is a new kind of input to
it, specified as its own capability rather than as more requirements there.

## Non-goals

- **Moving existing specs.** 181 of 958 cases reach only state and keys, 144 of them asserting
  equality on buffer, caret or selection alone (`docs/research/drawn-case-files`, "Existing
  specs"); most read layout, statistics or the DOM. Cases move when a change touches them, not in
  bulk, and the change ships case files for six repros that already ran unchanged.
- **Pointer gestures, commands run by name, timing.** Ten tracker cases drag, some run a command by
  name between keys, some name a time bound. A case file drives the keyboard and the clipboard.
- **Several ranges, folds, zoom, scroll, a rendered screen.** The notation draws the main range and
  says when there are more; the rest waits for a case that needs it.
- **Columns with keys in the header**, and comparison columns with a history name. A case file's
  columns have fixed roles; other headers are references the runner ignores.
- **Attaching to a running Obsidian.** The page-side read is written to be evaluated by the
  DevTools-protocol access of [#287](https://github.com/laughedelic/obsidian-true-outliner/issues/287)
  and the driver of [#290](https://github.com/laughedelic/obsidian-true-outliner/issues/290); this
  change does not add either.
- **Evidence clips and the second-pass agent** ([#292](https://github.com/laughedelic/obsidian-true-outliner/issues/292),
  [#293](https://github.com/laughedelic/obsidian-true-outliner/issues/293)), which build on it.
- **Known-failing cases.** A case file for an open bug lands with its fix.

## Impact

- `.agents/skills/presenting-examples/`: `notation.mjs` and its declarations added, `layout.mjs`
  reduced to the command line, `SKILL.md` extended. The two symlinked copies follow.
- `e2e-tests/`: `state-drawing.ts` and `case-report.ts` (pure, unit-tested), `drawing.ts` (the
  page-side read), `cases.ts` (finding files, pressing keys), `specs/98-drawn-cases.e2e.ts`,
  `cases/`; both wdio configs chain the drawing into `afterTest`.
- `scripts/`: `run-case.ts`; `spec-groups.ts` gains the group, marked exclusive because ⌘V writes
  the machine's clipboard.
- `tests/`: `notation.test.ts`, `case-report.test.ts`, `case-files.test.ts`; `.editorconfig`
  keeps trailing spaces in `*.case`.
- `docs/research/drawn-case-files.md` and its index row; `AGENTS.md`'s e2e section.
- CI: one more group in the matrix, desktop and mobile, whose cost is the launch and a few seconds.
