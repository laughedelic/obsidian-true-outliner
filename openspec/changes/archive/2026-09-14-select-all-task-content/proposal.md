## Why

The first Mod-A press on a task item settles as the whole line, dash and checkbox included,
where `progressive-select-all` promises the item's content. The ladder computes a rung that
starts after `- ` and includes `[ ] `; Obsidian's checkbox-widget mount then moves that
boundary onto the marker, with outline mode on or off. Measured in
[docs/research/select-all-task-content.md](../../../docs/research/select-all-task-content.md).

## What Changes

- The "own content" rung of a task item starts where its text begins, after the task marker,
  so the first press on `- [ ] buy milk` selects `buy milk`. The second press still takes the
  whole line, checkbox and all.
- An empty task item has no text rung: its first press takes the whole line.
- The rung's start is stated in the spec as the same boundary split and Backspace-merge
  already use, and the comments that recorded the opposite decision (the ladder keeps `[ ]`
  as content) are corrected.
- Unit cover for the task shapes and an e2e case that asserts the SETTLED selection, after
  Obsidian's late dispatch has landed.

No breaking changes: every non-task line keeps its exact rung.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `progressive-select-all`: "List-item content rung excludes the marker" widens the exclusion
  from the list marker alone to a task item's task marker as well, and names the empty-task
  collapse.

## Impact

- `src/select-all-ladder.ts` — the rung's start column.
- `src/ops.ts`, `src/caret-policy.ts` — comments that named the ladder among `[ ]`-as-content
  consumers.
- `tests/select-all-ladder.test.ts`, `e2e/specs/64-progressive-select-all.e2e.ts`.
- `docs/research/select-all-task-content.md`.

## Non-goals

- **The caret's own boundary.** Home still lands after `- `, before the checkbox; the
  transaction filter still clamps a caret back off the marker. A caret is one position and
  the checkbox is addressable on purpose (`content-space-caret`).
- **Obsidian's late selection dispatch.** The rung is moved out of its reach rather than
  clamping range boundaries the way carets are clamped. Widening `resolveForeignCursors` to
  ranges would touch every selection Obsidian ever dispatches, for one case a different
  start column removes.
- **Whether `[ ]` is chrome.** `enter-and-shift-enter-grammar` D5 keeps that question open,
  and this change does not answer it: split, merge and now the ladder use the task-marker
  boundary as the place an item's text begins, nothing more.
