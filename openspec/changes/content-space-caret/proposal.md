## Why

Chrome transparency (`node-edit-enforcement` D9) currently governs *edits* only: Backspace and
Delete read intent from the cursor regardless of gap width or marker internals, but the caret
itself is still placed and moved in raw character space. Blank gap lines and list-item marker
prefixes are addressable positions, so ordinary navigation stumbles over encoding chrome that
carries no content.

A real-Obsidian probe pass (2026-07-25, recorded in [examples.md](examples.md)) measured two
concrete failures: ArrowLeft at a list item's content start is a permanent no-op at every
depth, so the caret cannot leave an item backwards at all; and Home pressed twice reaches
inside the marker even though ArrowLeft and mouse clicks are both clamped out of it.

The Home case was then root-caused, and the answer decides the architecture. ArrowLeft
classifies `selection-only` and is clamped; Home classifies `programmatic` — Obsidian's own
Home dispatches with no `userEvent` — and is passed through by design. The funnel behaves
exactly as specified; the clamp simply never sees the key. The clamp cannot be extended to
reach Home without clamping `programmatic` transactions, which breaks a committed pass-through
requirement and the workspace-restore and sync-reconciliation scenarios under it. Correction
cannot fix this case at all. Which gesture lands in which class is Obsidian's implementation
choice, per gesture and per release — not something a correction layer can enumerate in
advance, and the reason motion moves to bound keys instead (design.md D1).

The gap-line half of this was filed as deferred work in
[docs/research/13](../../../docs/research/13-selection-follow-ups.md) ("Gap-line cursor
transparency"), with a specific risk (CM6's goal-column tracking) and a specific instruction:
prototype vertical motion first, do not decide from code review.

## What Changes

- **Gap lines stop being addressable in outline mode.** Vertical and horizontal motion move
  between node contents, never landing on a blank gap line. A click on a gap line resolves
  through gap *ownership*, which the parse model already fixes: the gap belongs to the node
  above it, so the caret lands at that node's content end. No pixel-proximity heuristic.
- **The list-item marker prefix stops being addressable, uniformly**, closing the
  Home-versus-ArrowLeft inconsistency. ArrowLeft at a content start now crosses to the previous
  node's content end, mirroring ArrowRight, which already skips the next item's marker
  correctly. A heading's `#` prefix is NOT affected: it stays directly editable text, as
  `clampCursorToContent`'s existing list-item-only scope and `progressive-select-all`'s
  column-0 heading rung both already have it.
- **Home and End escalate**: first press to the current visual row's own content boundary,
  second press to the whole node's content boundary, collapsing to one step when the node
  occupies one unwrapped row. This is the multiline-node answer.
- **Escape is NOT bound.** Native collapse-to-edge stays; because a cover's end is a gap-line
  position, the placement rule above already lands the caret on content. Leaving the key
  unbound keeps it free for the filed modal block-selection work.
- **The preamble is out of jurisdiction, explicitly.** Frontmatter and anything before the
  first node keep byte-for-byte stock motion and placement. No frontmatter handling is added:
  Obsidian has its own Properties UI, and a note can be taken out of outline mode for raw
  editing. The carve-out exists so the addressable-position rule — stated over node content
  spans — cannot be read as clamping the caret out of a region that belongs to no node.
- **BREAKING (in-mode behavior, not file format)**: positions the caret could previously occupy
  in outline mode become unreachable. Files, the parse model, and off-mode behavior are
  untouched.

## Capabilities

### New Capabilities

- `content-space-caret`: caret placement and motion in outline mode — which document positions
  are addressable at all, how vertical and horizontal motion traverse node contents, how
  Home/End and pointer clicks resolve, and the goal-column contract for repeated vertical
  motion.

### Modified Capabilities

- `node-selection-enforcement`: the requirement "Within-node content selections and cursors are
  untouched" is narrowed. Its guarantee that gap-line cursor placement stays native is reversed
  for outline mode, and its list-item marker clamp is superseded by the broader
  addressable-position rule in `content-space-caret`.
- `node-edit-enforcement`: the "Editing semantics are chrome-transparent" requirement's
  deliberate escape hatch — an edit made with the caret placed ON a gap line stays native —
  becomes unreachable in outline mode. The escape hatch becomes the outline-mode toggle, as
  anticipated in docs/research/13.

## Impact

- `src/plugin/keymap.ts`: new motion handlers join the existing high-precedence, per-keypress
  outline-mode-gated keymap.
- `src/escalate.ts`: `clampCursorToContent` is superseded by a general content-space position
  mapper; the cover geometry is untouched.
- `src/plugin/transaction-filter.ts`: the clamp call site is replaced; escalation math is
  untouched.
- New pure decision modules, unit- and property-tested independently of Obsidian, following the
  established `escalate.ts` pattern.
- Manual verification is a gate, not a formality: the goal-column risk recorded in
  docs/research/13 needs hands-on testing against real navigation before the motion rules are
  settled.

## Sequencing

Independent of every other change in this series. It touches caret placement only — not
escalation geometry, not extension, not edit verdicts — so it can land before, after, or
alongside `selection-as-subtree-set`.

## Out of scope

- Keyboard selection extension (Shift+Arrow) — `node-selection-extension`.
- The escalation geometry itself — `selection-as-subtree-set`.
- Structural keys over multi-node selections; the two-transaction escalation flash;
  Enter/Backspace edge cases; modal block selection; folding.
