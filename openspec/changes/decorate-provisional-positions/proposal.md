## Why

`enter-and-shift-enter-grammar` made the PROVISIONAL POSITION a first-class part of the
grammar: an accepted Enter or Shift+Enter may leave the caret on a blank line that holds the
place where a node — or a node's continuation line — materializes as soon as text is typed
there. The decoration layer knows nothing about it. `decorate()` emits facts only for a
node's own lines, so a blank line gets no depth, no marker gutter, and no marker, and the
caret lands at the document's left edge plus whatever literal whitespace the line holds.

Two consequences, both reported from real-vault use and both measured:

- **Enter at the end of a node** puts the caret at column 0 regardless of how deep the new
  node will be. The hierarchy visibly breaks for the one keystroke where the user is actually
  building it, and at depth 0 the caret sits directly on top of the guide column that renders
  there, which hides it.
- **Shift+Enter at the end of a list item** writes a whitespace-only continuation line, which
  re-parses as a gap rather than as part of the item, so the line loses its
  `supplementalDepth` margin and renders one whole level of it to the left — at the list's
  parent column, visually outside the list block. Typing one character repairs it, and the
  line jumps right.

This is the parking lot's "A provisional (gap) line has no decoration facts, so the caret
visibly jumps" (`docs/research/12-decoration-follow-ups.md`, catalogue S10), graduated to its
own change as that file's standing instruction requires. Its open question — which depth a
gap line should take — is answered here by not asking it: the layer renders what the parse
would make of the line if a character were typed there, which is the same reading
`outline-keyboard-grammar`'s "Provisional positions" requirement already demands the document
alone support.

Investigating that rule surfaced a third defect it depends on, in the buffer rather than the
rendering: an end-of-node Enter writes an unindented blank line even when the provisional
position belongs to a scope that is INSIDE a list item. Typing there then materializes the
node at the top level instead of as the intended child, and detaches the item's existing
children with it. Rendering "what would be typed here" cannot be both truthful and correct
while that holds, so the fix is part of this change rather than a follow-up.

## What Changes

- **A provisional position renders as the node it would become.** When the caret rests on a
  line that carries no node content, that line takes the indentation regime, depth, and
  marker of the node the parse would produce there — a paragraph at the destination's depth
  for Enter's position, the owning node's own continuation line for Shift+Enter's. The
  distinction is read from the document alone (blank-separated vs adjacent), never from
  editor state or from which key ran.
- **The paragraph marker appears on Enter's provisional position**, on the same terms as any
  other paragraph: it is a first line, so it is marker-eligible, and the `markerVisibility`
  setting governs it unchanged. A continuation position is not a first line and gets no
  marker, exactly as a real continuation line does not.
- **The position-indicator layer follows the caret onto the provisional line**: it becomes the
  current node for accent purposes, with the ancestors the materialized node would have, not
  the ancestors of the node that happens to own the gap.
- **The provisional position carries the indentation its destination scope requires.**
  `splitNode`'s gap-widening branch writes the destination indentation (via the existing
  `destinationIndent`, the one indentation rule shared with paste) instead of an empty line,
  and anchors the caret after it. For top-level and heading destinations that is the empty
  string and the bytes are unchanged; inside a list item it is what makes the position a
  child at all.
- **No document mutation from the rendering half.** The decoration remains a pure projection
  of buffer plus caret: nothing is dispatched, no history entry is created, and abandoning the
  position removes the line and the decoration with it, exactly as today.

## Capabilities

### New Capabilities

None. Both halves extend existing capabilities.

### Modified Capabilities

- `outline-decorations`: adds the rule that a caret-occupied line with no node content renders
  as the node it would become — indentation, marker, and position-indicator treatment — as a
  caret-derived layer alongside the existing base layers.
- `structural-operations`: adds the rule that a provisional position `splitNode` opens carries
  its destination scope's indentation, so typing there materializes the node at the depth the
  operation intended.

## Impact

- **Code**: `src/plugin/decorate.ts` (a pure "what would this line become" fact, alongside
  `decorate()`/`computeLineGuides()`/`computePositionTrail()`); `src/plugin/decorations.ts`
  (the caret-derived fact injected into the existing decoration and marker passes, cached per
  editor state the way the position trail already is); `src/ops.ts` (the gap-widening branch's
  indentation and anchor).
- **Tests**: `tests/decorate.test.ts` for the pure rule, including the preamble and
  end-of-document edges; `tests/split.test.ts` / `tests/ops.test.ts` for the indented
  provisional position and the subtree it must not detach; `e2e/specs/50-decorations.e2e.ts`
  and `e2e/specs/52-block-markers-icons.e2e.ts` for the rendered caret column and the
  provisional marker; `e2e/specs/53-decoration-contracts.e2e.ts` for the unchanged
  no-mutation contract.
- **Interacts with**: `structural-history-integration`'s undo-on-abandon, which must keep
  removing the position without a trace now that it may carry whitespace; and
  `content-space-caret`, whose non-addressable-gap rule is unchanged — no user gesture reaches
  a provisional line, only the plugin's own dispatch parks the caret there.
- **Not affected**: the parser, the transaction filter, node selection, reading view, and the
  base decoration layers' geometry. A pure list's byte-identity invariant holds: a
  continuation position in a pure list has `supplementalDepth` 0, so it contributes nothing.
- **Depends on** `enter-and-shift-enter-grammar` landing first: this change reads its
  "Provisional positions" requirement as its own premise and fixes one shape of its
  gap-widening branch.
