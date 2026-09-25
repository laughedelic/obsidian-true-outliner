# Design

## Context

The measurements this design rests on are in `docs/research/lone-block-id`: what a lone id names in
Obsidian, what an embed shows, which operations separate an id today, and the two groups those
readings fall into. The motivation is proposal.md's.

The model owns lines verbatim (`src/model.ts`): a node is its own `lines`, then its `trailingGap`,
then its children, and encoding is span concatenation. Two facts about the code shape the approach:

- `ownSpan` is the one place a node's own footprint is defined, but a dozen walkers read
  `node.lines.length` and `node.trailingGap.length` directly to classify a line inside a node as
  content or gap: `caret.ts`, `enforce.ts`, `classify.ts`, `escalate.ts`,
  `select-all-ladder.ts`, `plugin/decorate.ts` (three walks), `plugin/fold-model.ts`.
- Every seam rule reads the gap after a subtree as its last descendant's `trailingGap`
  (`subtreeFinalNode`, `setFinalGap`, `needsBlankBetween`), and the kind below a node from
  `tailAsWritten`.

## Goals / Non-Goals

**Goals:**
- A first-group id is part of its node's own span, contiguous with it, so every operation that
  already treats a node as a unit carries the id with no operation-specific code.
- The seam invariant holds unchanged: the gap after a node's own span is still its `trailingGap`.
- Detection of misplaced ids and the edits each correction makes are pure core functions, tested
  without the editor.

**Non-Goals:**
- A node owning lines after its children. The second group is marked instead (D1).
- Changing how an inline id is parsed. It stays text in its node's lines.

## Decisions

### D1. The id is a field between a node's lines and its trailing gap

`OutlineNode` gains an optional `blockId: { gap: readonly string[]; line: string }` — the blank lines
between the node's own lines and the id, and the id's line verbatim. Encoding emits `lines`, then
`blockId.gap` and `blockId.line`, then `trailingGap`, then the children. `ownSpan` counts it,
`treesEqual` compares it, and the node's `trailingGap` stays the gap after the id.

Every first-group shape puts the id directly after its node's own lines, so this one position
covers them all, headings and list items included: their children follow the id.

Alternatives:
- **The id as a child node.** Every subtree operation would carry it with no model change, but an
  id is not a node: it would draw a marker one level in, make every table with an id foldable,
  answer a zoom, and need exceptions in each of those layers.
- **The id inside `lines`.** Geometry would be right for free, but everything that reads a node's
  text would read a blank line and an id as content: node text, split, merge, the caret's content
  end, and `tailAsWritten`, which would take the id for a table's last row.
- **A second span after a node's children.** It would let an id after an item's children, or
  after a whole list, belong to a node. It makes a node's own lines non-contiguous, which every
  line-geometry walker and every gap-after-this-subtree helper would have to learn — and the
  shapes it would cover are exactly the ones Obsidian reads differently from the outline, which
  are marked instead.

### D2. The attachment rule is one strategy function, applied while attaching blocks

`segment` already produces a lone id as a one-line paragraph block, and a line with text directly
under it as a longer paragraph, so the segmenter needs no change. `attach` in `parse.ts` asks one
function in `rules.ts`, beside `listAttachesTo`, whether a lone-id block attaches to the node
attached just before it, given that node, the open list stack and the id's indentation. When it
does, the previous node's `trailingGap` becomes `blockId.gap`, the id's line becomes
`blockId.line`, and the id block's own gap becomes the node's `trailingGap`.

The consecutive-id rule needs the block after the id: `attach` is handed a look-ahead that says
whether the next block is another lone id.

The rule attaches only where the previous node has no children yet, which is the same as "the id
follows the node's own lines" at attach time: an id after a node's children finds a child as the
previous node, and the list-item cases then decide it by column.

### D3. One helper classifies a line inside a node's own span

`model.ts` gains `lineRole(node, index)`, answering `content`, `id-gap`, `id` or `gap` for an index
into the node's own span, next to `ownSpan`. Every walker that reads `lines.length` and
`trailingGap.length` to tell content from gap switches to it. The caret treats `id` as content and
`id-gap` as gap (`content-space-caret`); decorations draw the `id` line as a continuation line of
its node and the `id-gap` lines as gap rows; enforcement and classification treat an edit on the
`id` line as an edit inside the node.

Alternative: patching each walker to add `blockId`'s length where it needs it. That is the
pattern that let four walkers drift before `forEachNodeWithLine` existed (`locate.ts`'s own
comment), repeated for a second boundary.

### D4. Operations carry the id through the paths that rewrite lines

Moves, deletions, covers and group forms carry the id with no change, because it is inside the
node's own span. The paths that rewrite a node's lines each handle it once:

- `reindentSubtreeVerbatim`, the shift functions in `reencode.ts`, `reencodeForDestination` and
  `unwrapListItem` re-indent `blockId.line` with the node: to the content column when the node is
  or becomes a list item, to the node's own column otherwise. Gap lines are blanked as every gap
  is.
- `splitNode` leaves `blockId` on the node that keeps the first line.
- `mergeNodes` keeps whichever `blockId` exists, and rejects with `merge-not-expressible` when both
  do.
- The seam below a node with an id is the seam below a one-line paragraph: a line of text directly
  under the id joins it (`docs/research/lone-block-id`, `^t5`). `tailAsWritten` returns a paragraph
  tail for such a node, and `normalizeBoundaries`' list-item first-child rule reads the same
  tail, so both seam rules follow without new cases.

### D5. Detection and corrections are a pure core module

A new `src/block-ids.ts` exports `misplacedBlockIds(doc)`: for each misplaced line, its line
number, the id's character range, the reading, and its corrections, each a list of line edits plus
the caret position the edit leaves. It reads the parsed tree only — a paragraph node that is a lone
id and did not attach, a paragraph whose first line would be one, a paragraph whose one line is an
id with trailing whitespace — so it runs on whatever `parse` returns and is tested against every
shape in the research note.

The corrections' edits are line edits in the same `Edit` shape operations emit, and are
constructed so their result re-parses with the id attached; the unit tests assert that re-parse.

### D6. The plugin reads the detection, draws, and dispatches

- **Mark.** A view plugin in the shape of the surplus-space mark (`decorations.ts`): a
  `Decoration.mark` with class `to-decor-misplaced-id` and a title over the id's range, outline
  mode only, absent in nested editors.
- **Glyph.** The decorate facts carry a `misplaced` flag for the paragraph's first line; the marker
  builder draws a warning icon in the marker slot when it is set, keeping `data-kind` and adding
  `data-misplaced`. The glyph ignores `markerVisibility`.
- **Press.** The mark on the id text takes its press the way the surplus-space mark does: one
  capture-phase `pointerdown` listener that swallows the trailing mouse events and opens the menu
  at release. The glyph is a node mark, so its press is already `zoom-click.ts`'s `MarkPress`,
  which resolves at release because a press that moves is a drag (`node-dragging`). Its `zooms`
  flag, which already holds a task's checkbox back from zooming, becomes what a release in place
  does — zoom, open the correction menu, or nothing — and a mark carrying `data-misplaced` takes
  the menu. A press on the glyph that moves still drags the paragraph.
- **Menu.** Obsidian's `Menu` (public): the disabled reading row, one row per correction, the
  removal row. `showAtMouseEvent` for a press, `showAtPosition` from `coordsAtPos` for the command.
- **Dispatch.** A correction is one transaction carrying a new plugin-own `userEvent`,
  `input.structure.block-id`, added to `classify.ts`'s plugin-own list: the edit is valid by
  construction (D5), and classified by shape it would read as a boundary-crossing edit for
  enforcement to rewrite.
- **Command.** `checkCallback` over the caret's line, available only when that line is misplaced.
- **Styles.** A new part under `styles/` for the mark and the glyph, using `--text-warning` and the
  highlight background the surplus mark uses.

### D8. A moved misplaced id keeps its kind

`reencodeBlocksForDestination`, the step a drag (`moveSubtreesTo`) and a paste share, converts a
paragraph arriving in a list scope into a list item. A paragraph that is a lone block id is exempt:
it keeps its kind and takes the destination's column, so a dropped id is an id line and the
re-parse attaches it, or keeps it misplaced, by D2's rule. Without the exemption a drop between a
lead paragraph and its list writes `- ^id`, an empty item carrying the id, which names neither and
is not marked either (measured on `main` at 42130da). Indent and outdent of a misplaced id are not
exempt: they are paragraph operations the user asked for by name.

### D7. Keys on an attached id's line

The keymap resolves the caret's `lineRole`. On an `id` line, Enter at the end calls the same path
as Enter at the node's content end; any other Enter, Shift+Enter anywhere, and Backspace at the
start reject with the cue (`outline-keyboard-grammar`). Typing, and deleting the id's own
characters, are ordinary edits; the re-parse decides whether what remains is still attached.

## Risks / Trade-offs

- [A walker still reads `lines.length` and `trailingGap.length` directly and misplaces the caret or
  a decoration on an id line] → D3's helper replaces every such site found by grep, and the
  property suites gain generated lone ids, so a walker that disagrees with `ownSpan` fails a
  geometry property rather than a user.
- [A re-encode path forgets the id's indentation and the result re-parses with the id detached]
  → the closure property compares attached ids across the re-parse (`structural-operations`,
  "Closure with ids"), over generators that put ids after every kind and inside list items.
- [Marking reads as nagging on notes written for Obsidian's whole-list reading] → the mark is
  outline mode only and never edits; a user who wants Obsidian's reading keeps the id as it is.
- [The correction menu's reading row goes stale if Obsidian changes its rule] → the readings are
  measured and cited to the research note, and the probes there re-run in one command.

## Migration Plan

No stored state changes. A note's text is never rewritten by this change except by a correction the
user chooses. #205 rebases onto this branch from the primary checkout once it lands.
