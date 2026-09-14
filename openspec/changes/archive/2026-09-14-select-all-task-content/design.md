## Context

The ladder's first rung is computed by one function over the node's first line, and the
column it starts at is the whole of this change. The two boundaries in play, and why the
rung that starts after `- ` cannot survive in the editor, are recorded in
[docs/research/select-all-task-content.md](../../../docs/research/select-all-task-content.md).

## Goals / Non-Goals

**Goals:**

- The first press on a task item selects its text, and the selection stays there.
- Every non-task line keeps its rung byte for byte, including the `- # title` and bare `-`
  shapes the ladder's boundary was chosen to handle.

**Non-Goals:**

- Any change to the caret boundary, the filter's caret clamp, or the ladder's other rungs.

## Decisions

**Start the rung at the boundary split and merge use, not at a new one.** `markerPrefixCh`
already answers "where does this item's text begin" for Enter and Backspace, with the guards
that keep a paragraph reading `[ ] note` or a `- # [ ] title` from reporting a prefix past
their own text. Reusing it means a task item has one text-start column across every gesture
that needs one. The alternative, adding the task marker's length inside the ladder, would
duplicate those guards.

**Move the rung rather than clamp the range.** The caret clamp in the transaction filter
exists because a caret must sit on an addressable position. A range boundary has no such
invariant, and adding one for every Obsidian-dispatched selection would be a wider mechanism
than this defect needs. Starting past the task marker puts the boundary at a column
Obsidian's dispatch leaves alone.

**Let the empty task collapse.** `- [ ] ` has no text past its marker, so its rung is a
cursor. `nextRung` already skips a rung the selection equals, so the first press climbs to
the whole line. Pinned by a test so the behaviour is chosen, not accidental.

## Risks / Trade-offs

- **The ladder and the caret now disagree about `[ ]`** → stated in both places: the ladder's
  comment says why it skips the marker, the caret policy's comment says why it does not.
  The e2e case asserts the settled selection, which is what a user sees.
