## Why

Pasting a heading section into a list mangles it. Reported from real-vault use on 2026-07-25,
and the description we filed it under — "the heading becomes a list item and loses its `#`
markers, while the section's other blocks land at inconsistent depths" — turns out to name one
of five separate defects, reached by a path the original plan never considered.

Measured across twenty-eight paste shapes driven through the real verdict path
(`docs/research/paste-across-encoding-regimes`), a paste reaches one of three insert points and
they do not agree. The expressibility guard lives in `insertSubtrees` rather than in the shared
re-encode step, so the replacement path that `minimal-changesets-for-structural-ops` added
bypasses it entirely; a caret paste turns the same guard's rejection into a native pass, so raw
text lands mid-line and corrupts the buffer; and a type-over vetoes. One payload, one
destination, three different answers depending only on what happened to be selected.

Where the paste does splice cleanly it has two further gaps. A pasted heading's section runs to
the next heading of its level or shallower, so it swallows every sibling that followed the
anchor — content nobody copied, selected or pointed at. And a heading payload keeps the levels
it was written with, because the re-encode step has no heading arm at all: a `#` section pasted
under an `#####` lands at root, five levels from the caret.

The existing `structural-operations` spec already requires that inexpressible sequences "be
rejected rather than inserted in corrupted form". The paste verdict layer does not honour it.

## What Changes

The unifying rule is the one the project already has, extended to reach headings. Replanting a
subtree takes the encoding its destination permits, and preserves the subtree's own relative
hierarchy — `Context-determined encoding on reparent` (Q2 follow-up #3) with a heading arm.
Which encoding a payload lands in is expressed by where the caret is, so no mode and no prompt
is needed.

- **A payload landing in a heading-bearing scope stays headings**, re-levelled so its root sits
  at the destination's depth, every heading in it shifting by the same delta. Setext normalizes
  to ATX on the way, through the function that already does that for level shifts.
- **A payload landing in a list scope converts**, and converts throughout: every structural node
  in it becomes a list item. For a node WITH CHILDREN this is forced rather than chosen — below a
  list item a paragraph can have no children at all, so preserving the payload's tree has exactly
  one encoding available. A CHILDLESS node converts with them because a list scope is one list.

  *(Corrected 2026-09-19, from the real-vault manual pass: this said only the nodes WITH children
  convert. Measured, that left two siblings of one copied section as a paragraph and a list item,
  over an accident of which of them happened to have children — M1 in
  `docs/research/paste-across-encoding-regimes`.)*
- **A converted heading carries its own `#` run as its list item's text.** `- ## Notes` is a
  list item containing an `h2` in CommonMark, Obsidian renders it with heading styling, and our
  own content-column rule already treats the marker run as chrome. The rank survives the move
  and returns intact if the item is later outdented back to a heading scope.
- **The guard moves into the shared re-encode step**, so all three insert paths run it, and what
  remains genuinely inexpressible — an atom below a paragraph — vetoes with the existing cue on
  every path instead of vetoing on one and corrupting the buffer on another.
- **A pasted heading still absorbs the content that follows it**, and that becomes a stated
  consequence rather than an accident: a heading opens a section, and a caret at a heading level
  is a request for one there. Absorption never reaches past the destination scope's own end.

## Capabilities

### Modified Capabilities

- `structural-operations`: the context-determined encoding rule gains its heading arm, and
  subtree insertion states what a payload's encoding becomes at a destination in the other
  regime — for the whole subtree, not the root alone.
- `node-edit-enforcement`: the structural-paste requirement gains the cross-regime case its
  wording already assumed, and the rule that an inexpressible payload is refused rather than
  passed through natively.

## Impact

- `src/ops.ts`: `reencodeBlocksForDestination` (the guard and the heading arm),
  `reindentSubtreeVerbatim`, `insertSubtrees`.
- `src/reencode.ts`: `reencodeForDestination` gains the heading conversions;
  `headingWithLevel` reaches the paste path.
- `src/enforce.ts`: `computePasteVerdict`'s native fall-through, and `insertAsOnlyChildren`,
  which stops being an unguarded path.
- `src/rules.ts`: `encodingKindAtDestination` — the heading arm's home, per its own comment
  that revising these rules should be a local change.
- `tests/ops.test.ts`, `tests/reencode.test.ts`, `tests/enforce.test.ts`, `tests/closure.test.ts`,
  and an e2e paste scenario.

## Non-goals

- Tab/Shift+Tab level-shift semantics, which are settled and unchanged.
- What a selection can contain.
- Whether headings should be nodes at all.
- Q34, whether a list following a paragraph is that paragraph's child. The measurement leans on
  that rule and does not revisit it; if it is ever revised, the reverse direction stops being
  settled and returns here.
- Arbitrary kind conversion in general. This is the heading/content boundary specifically, plus
  the one atom case that shares its code path.

## Sequencing

Independent of the selection work, and of the two search stacks open on `main` — no file
overlap beyond `docs/research/index.md`, which merges by union.

`drag-nodes-with-a-drop-preview` depends on this change and stacks on top of it. Both modify
`structural-operations`, and the drop consumes the rule decided here — its own proposal says so,
and its move operation re-encodes "by the SAME rule an insertion at that destination uses". Two
of its statements are written against the behaviour this change replaces, and are the whole of
what the restack has to settle:

- Its `A destination the insertion rule declines is rejected` scenario gives "a heading-rooted
  run under a non-heading parent" as its example. That destination is no longer declined — it
  converts. The requirement holds; only the example moves, to the atom-below-a-paragraph case
  that remains the sole rejection.
- `docs/research/node-drag-and-drop` states that candidate destinations are filtered by what
  `insertSubtrees` accepts, and names the same two rejections. Under this change the candidate
  set GROWS: a heading run may be dropped at any list depth, so the drop's depth interval widens
  rather than narrowing. That suits the preview's existing promise to draw the mark the run will
  have *after* re-encoding — which, for a heading dropped into a list, is a list marker followed
  by the heading's own `#` run.

