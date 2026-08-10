## Why

Shift+Enter at the end of a line that is NOT its node's last line opens a provisional position
INSIDE the node, and the whitespace-only line it writes bisects that node in the parse. Every
line below the position that belonged to the node stops being one of its own lines and
re-parses as a separate node — a paragraph CHILD of a list item, one level deeper and carrying
a paragraph marker, or a sibling paragraph. Reported from a real vault as "the second line
jumps to the right with a paragraph icon"; measured on the planner and the decoration facts:

| Shape | The line below the position | Before | While the position is open |
|---|---|---|---|
| `- foo` / `␣␣bar` | `␣␣bar` | list continuation, `margin-left: 0` | paragraph at depth 1, `padding-left: 44px`, ¶ marker |
| the same under a heading | `␣␣bar` | list continuation, `margin-left: 24px` | paragraph at depth 2, `padding-left: 68px`, ¶ marker |
| `- top` / `⇥- foo` / `⇥␣␣bar` | `⇥␣␣bar` | list continuation, `margin-left: 0` | paragraph at depth 2, `padding-left: 68px`, ¶ marker |
| `alpha` / `beta` | `beta` | continuation, no marker | its own paragraph node, ¶ marker |

(24px `--to-decor-unit` plus the 20px marker gutter, at a 16px font.) Typing one character
folds the node back together and everything snaps back, which is the visible jump. The trigger
is exact: the caret at the END of a line that is not the node's last line. Mid-text is
unaffected (the new line carries the text after the caret, so it is not blank), and so is the
end of a node, where the same blank line becomes a trailing gap instead of a bisection.

This is not a regression. `src/parse.ts` is unchanged since the mapping core, the same
insertion predates `enter-and-shift-enter-grammar`, and the marker layer predates both. What
changed is ownership: `decorate-provisional-positions` fixed the caret's own line and named the
rule, so the displaced line below is now the only thing left moving.

Two stated rules meet here and the shape falls between them.

- `outline-keyboard-grammar`'s "Provisional positions" requires that "the tree SHALL have the
  same node count before and after the keypress that created it". Measured, every interior
  position violates it: 1→2 nodes for the flat item, 1→2 for the two-line paragraph, 2→3 for an
  item that already has children.
- `outline-decorations` then renders that split faithfully, because it is told to: "Only the
  caret's own line SHALL be affected. Every other line SHALL keep the facts of the document as
  it actually is." The preview parse that already knows the truth — the line below is still the
  node's continuation line in it — is computed and cached, and used for the caret's line alone.

The catalogue's S10 (`docs/research/15-enter-and-shift-enter-catalogue.md`) diagnosed exactly
this mechanism, a whitespace-only line re-parsing as a gap, but measured it only where the gap
lands AFTER the node. And design D3 of `decorate-provisional-positions` rejected "compute every
line from the preview" for a real reason, pinned by an e2e test: an Enter position at the end of
a childless heading makes that heading a parent in the preview, so its marker would blink on
under `markerVisibility: 'with-children'`. D3 is right about the direction it measured — the
preview INVENTING structure — and blind to the opposite one, the position DESTROYING it.

## What Changes

- **A provisional position stops changing the outline in either direction.** The existing
  invariant says a position adds no node; this change states the other half — a position removes
  none either. The lines that belonged to a node before the keypress still belong to it, so the
  node renders and behaves as the one node the user sees, for as long as the position is open.
- **Every line's facts come from the tree the position stands for, not from the raw parse of a
  buffer that has a blank line in the middle of a node.** D3's carve-out is preserved and stated
  as the rule it always was: the node a position would MATERIALIZE contributes nothing to any
  other line — a childless heading with an Enter position below it stays childless, and its
  marker does not blink on. That is now the single exception rather than the whole policy.
- **The same tree governs what the structural keys act on.** A structural operation dispatched
  while a position is open currently reads the bisected parse: the artifact child moves with the
  node, node-granular selection counts it as its own node, and enforcement computes verdicts
  against it. One case (Tab) was traced and survives; the rest are measured in this change and
  whatever the measurement finds broken is fixed here rather than deferred (`tasks.md`, Findings).
- **A leftover position is a document-level consequence, recorded rather than fixed.** Any
  document change drops the abandon record (`provisional-cleanup.ts`), so Shift+Enter followed by
  a structural key leaves the blank line in the file and the node split on disk. Byte-identical
  to stock Obsidian, and no worse than it, but with the plugin the split is an outline the model
  now asserts. Out of scope here; recorded in the parking lot with its measurement.
- **The parse and the buffer are untouched.** No `NodeKind` change, no new encoding, and
  `encode(parse(md))` byte-identity is unaffected. What the keypress writes is unchanged; what
  the layers above it read while the caret rests there is what this change fixes.

Not breaking: every currently-correct rendering is preserved, and the end-of-node positions
`decorate-provisional-positions` closed keep exactly the behavior they have.

## Capabilities

### New Capabilities

None. Both halves refine existing requirements.

### Modified Capabilities

- `outline-decorations`: "A provisional position renders as the node it would become" states
  "Only the caret's own line SHALL be affected", which is the rule that renders the bisection.
  It is restated so that no line changes how it renders because a position is open — the
  displaced lines take the facts they had, and the materialized node's own existence is what
  contributes nothing. The "Neighbouring lines are unaffected" scenario survives with its
  meaning intact and gains the interior cases beside it.
- `outline-keyboard-grammar`: "Provisional positions" claims an unqualified node-count
  invariant that the buffer does not satisfy for an interior position. It is restated to say
  what is true and enforceable — the outline the plugin presents and acts on has the same nodes
  before and after, while the raw parse of the buffer does gain one — and to name the interior
  position as a first-class shape alongside the end-of-node one.
- `structural-operations`, `node-selection-extension`, `node-edit-enforcement`: candidates,
  pending the measurement pass. Each governs a consumer that reads the tree while a position is
  open. A delta is added for whichever the measurement shows acting on the bisected parse in a
  way the user can observe; a consumer measured correct gets no delta and its result is recorded.

## Impact

- **Code**: `src/plugin/decorations.ts` (`provisionalAt` already parses and caches the tree this
  needs — it is consumed for the caret's line and for the position trail, and this change makes
  it the source for every line, with the materialized node excluded); `src/plugin/decorate.ts`
  (the pure "tree the position stands for" fact, alongside `provisionalFact`);
  `src/plugin/parsed-doc.ts` and the structural-key path in `src/plugin/keymap.ts` /
  `src/plugin/grammar.ts` if the measurement pass finds an operation acting on the bisection.
- **Tests**: `tests/decorate.test.ts` for the pure rule, including the interior shapes above and
  the childless-heading exception as a negative control; `tests/grammar.test.ts` for the
  operations the measurement covers; `e2e/specs/50-decorations.e2e.ts` and
  `52-block-markers-icons.e2e.ts` for the rendered column and the absent marker on the displaced
  line, with the existing "a neighbouring line is not rendered as though the node already
  existed" test kept as the guard it is.
- **Docs**: `docs/research/15-enter-and-shift-enter-catalogue.md` gains the interior position as
  a measured entry under C2 ("The result SHALL re-parse as one (multiline) node"), which S10
  covers only at a node's end; `docs/research/12-decoration-follow-ups.md` gains the leftover
  blank line recorded above, and its "A non-list-item child of a list item is indented twice"
  entry gains the note that this change removes the transient way into it while the deliberate
  shape it describes stays open.
- **Not affected**: the parser, the encoder, the transaction filter, reading view, and every
  base decoration layer's geometry. A pure list's byte-identity invariant holds — the facts a
  displaced line regains are the ones it had, which in a pure list contribute nothing.
- **Depends on** `decorate-provisional-positions` (archived), whose rule this extends, and on
  `abandon-removes-only-the-place` (complete, unarchived) for the abandon behavior the leftover
  note measures against.
