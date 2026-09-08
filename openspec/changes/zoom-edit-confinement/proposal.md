## Why

`outline-zoom` shipped with half of its own confinement guarantee. The structural-command layer
was taught about the scope — `operandEscapes` and `splitEscapes` refuse an outdent, an indent, a
move or a split whose result would land outside the zoom root's subtree, with a typed rejection
and a cue. The text-editing layer was not taught anything, so a Backspace, a Delete or a paste at
the scope's edge reaches straight through it.

The measured catalogue (docs/research/24) is unambiguous. Nine gestures mutate content the user
cannot see and then drop the zoom with no cue; the zoomed and unzoomed results are byte-identical,
because nothing in the edit path knows a scope exists. A separate arithmetic error sends the
correction the other way: an Enter or a structural paste that appends a new last child of the zoom
root is dispatched at the first HIDDEN line's start, so the exit trigger counts a perfectly
in-scope edit as an escape and clears the zoom anyway. And an emptied list-item root that Backspace
unwraps leaves the zoom ACTIVE, rooted on a different node, with the trail still claiming
otherwise.

One cause sits under all three. `zoom-state.ts`'s trigger 2 is an offset comparison in the state
BEFORE the change, and it is being asked a question offsets cannot answer: docs/research/24's X2
records one insertion offset with two structural outcomes, in scope and out, depending only on what
is inserted. Whether an edit escapes is a fact about the re-parsed tree AFTER it. Trigger 2 was
built as the catch-all for changes that never pass enforcement — history, sync, another pane — and
it is being used as the primary answer for user edits it was never shaped to judge.

## What Changes

- **An edit whose result would leave the zoom scope is refused, not applied.** Backspace at the
  zoom root's content start, Delete at the end of the last visible line or on the cover's trailing
  gap, Mod-Backspace at the root's content start, and a paste that splices outside the subtree all
  leave the document unchanged and show the `would-leave-zoom-scope` cue the structural layer
  already uses. The two layers then agree on one judgement rather than each having its own, which
  is the argument `outline-zoom` already makes for the keyboard and the palette.
- **The escape test is the scope's invariant, judged over the AFTER state.** With the change
  applied and the document re-parsed: the text outside the zoom root's subtree is byte-identical,
  everything inserted lies inside the root's subtree as it now stands, and the root is still the
  same node. Not a comparison of changed POSITIONS — every such formulation fails a measured row,
  including after-state ones (docs/research/24: one keystroke removes a single line break and a
  whole hidden node is absorbed by it).
- **In-scope appends keep the zoom.** Enter at the end of the last visible line, and a structural
  paste there, stop clearing a scope they never left.
- **The zoom root is identified, not merely located.** A surviving node that merely starts on the
  anchor's line is not the root the user zoomed into. An emptied list-item root whose Backspace
  would unwrap it is refused; the zoom can no longer retarget silently.
- **The automatic exit narrows to what it was built for.** Trigger 2 stays the fallback for
  changes that never reach enforcement — history transactions, sync writes, edits dispatched from
  another pane — and stops being the answer for user edits. Deleting the zoom root's whole subtree
  deliberately still succeeds and still exits, exactly as `outline-zoom` specifies today.

## Non-goals

- **Promoting the zoom root out of the list.** Every reference outliner renders a zoomed root as a
  page title rather than an editable row, which is what makes its boundary gestures inert by
  construction (docs/research/24). That is a rendering change of its own size and it is not
  attempted here; this change makes the boundary honest with the root still in the list.
- **Capping the select-all ladder at the root's children.** Logseq's focused root cannot be deleted
  at all; ours can, deliberately, and `progressive-select-all`'s stated cap at the root's own
  subtree is unchanged.
- **The heading-merge veto defect.** Backspace at a heading's first content character deletes a `#`
  instead of vetoing, contradicting `node-edit-enforcement`'s own scenario, identically with and
  without a zoom (docs/research/24). It is base behaviour, not zoom behaviour, and belongs to its
  own change.
- **Confining motion, selection or the ladder further.** Those clauses shipped and measure correct.

## Capabilities

### New Capabilities

None. Every rule here belongs to a capability that already exists; adding a second home for "what
may leave the zoom scope" is how one judgement becomes two that disagree.

### Modified Capabilities

- `outline-zoom`: the rejection requirement extends from structural OPERANDS to every enforced
  edit, and states the after-state test it is judged by; the automatic-exit requirement narrows to
  changes that never pass enforcement, and requires the surviving root to be the same node rather
  than any node starting on the anchor's line.
- `node-edit-enforcement`: merges, deletions and structural pastes gain the scope as an input, and
  veto with the zoom rejection reason when their result would leave it.

## Impact

- `src/zoom.ts` — the escape predicate for an enforced edit, beside `operandEscapes` and
  `splitEscapes`.
- `src/enforce.ts` — stays zoom-free; its rewrite verdict carries the after-document it already
  computed, so the check outside it needs no second parse.
- `src/plugin/transaction-filter.ts` — already resolves the scope for its selection-only branch;
  resolves it for the edit branch too, and this is where the veto is applied.
- `src/plugin/zoom-state.ts`, `src/plugin/zoom-scope.ts` — the exit triggers narrow, and the
  root-identity resolver replaces `stillRooted`'s "some node starts here".
- `e2e/specs/80-outline-zoom.e2e.ts` — the boundary catalogue becomes assertions.
- No user-facing setting, no new command, no new rejection reason, no change to the file on disk.
