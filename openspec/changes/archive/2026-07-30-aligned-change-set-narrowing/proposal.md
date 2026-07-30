## Why

The narrowing that turns a structural operation's line edits into character-level changes has
no way to describe a REORDER, and a consumer that re-derives its own document from the change
set acts on the false description. `diffLines` states every operation as one contiguous
line-range replacement; a swap preserves line count, so the narrowing takes its per-line branch
and emits "every line in this region was edited in place" — including partial character edits
inside lines the move never touched. Obsidian's live table widget reconciles against exactly
that and splits the table it owns: moving any sibling past a table severed the table's header
row from its body. Document corruption, reported from real-vault use.

The requirement as written asks only for the NARROWEST change set, and per-line rewrites of
unrelated lines can be narrow while being wrong. Minimality was never the goal in itself — it
is the means to a change set whose shape carries the operation's meaning, which is what cursor
mapping, undo/redo, and the host's own extensions all read. This change states the missing
half: the shape must also be TRUE.

## What Changes

- Narrowing gains a line-level ALIGNMENT step before it diffs anything. Lines an edit keeps —
  wherever they end up — are matched and excluded, and only the runs that remain are narrowed.
  Anchoring follows patience diff's rule: match only lines unique on both sides, chain them by
  longest increasing subsequence, recurse between anchors.
- The two existing narrowing branches (per-line for equal line counts, one trimmed character
  span otherwise) are unchanged. They now apply per changed run instead of per whole region.
- A move is consequently dispatched as one deletion plus one insertion, with the passed-over
  block's characters in no change range at all — for every atom kind, at any nesting depth.
- The requirement gains an explicit guarantee about relocation: an operation that MOVES lines
  SHALL NOT be expressed as an in-place rewrite of the lines it passes over.
- Change sets get strictly smaller for reorders (measured: 2 changes / 16 characters, against 5
  changes / ~40), so this tightens the existing minimality requirement rather than relaxing it.
- No dispatch site learns which operation it is dispatching. An earlier table-shaped fix that
  threaded a move direction into both dispatch sites is removed.
- `structural-history-integration`'s rationale for recording a move's cursor is corrected: a
  swap has two equally true descriptions, the alignment picks one from line content rather
  than from which node the user acted on, so mapping fails in one direction and happens to
  succeed in the other. Recording is still required — it is what makes the answer the same
  either way.

## Capabilities

### New Capabilities

None. This sharpens an existing capability rather than introducing one.

### Modified Capabilities

- `minimal-change-dispatch`: the narrowing requirement gains line alignment and a relocation
  guarantee — unchanged lines are excluded wherever they occur, not only at the region's
  leading and trailing edges, and a relocation is never expressed as an in-place rewrite.
- `structural-history-integration`: the stated reason a move's cursor must be recorded is made
  precise for aligned change sets. The requirement itself does not change.

## Impact

- `src/plugin/dispatch.ts` — the shared narrowing choke point; the alignment lives here.
- `src/plugin/keymap.ts`, `src/plugin/main.ts` — the move-direction plumbing added by the
  superseded fix is removed; neither site inspects the operation any more.
- `src/plugin/table-widget-move.ts` — deleted, along with its tests.
- `tests/plugin.test.ts` — dispatch-shape tests for the relocation guarantee, negative-controlled.
- `tests/history-caret.test.ts` — the negative control moves to the direction that still
  exercises history's mapping branch.
- `e2e/specs/20-structural-commands.e2e.ts`, `e2e/specs/30-keyboard-grammar.e2e.ts` — live-table
  move regressions, unchanged by this change and passing without any table-specific code.
- No public API, dependency, or data-format change.
