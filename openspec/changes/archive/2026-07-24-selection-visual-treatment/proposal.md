## Why

Node-selection-enforcement escalates boundary-crossing selections to whole-node/subtree
coverage, but the result still renders as stock character-level highlight — there's no
visual cue that a selection is "this whole node," only that some text got wider. The
real-vault manual pass that validated escalation flagged this gap explicitly and the
enforcement change's design.md scoped it out deliberately (docs/research/13). It matters
now because escalated selections are already the operand of shipped structural edits
(node-edit-enforcement) and will become more frequent once keyboard/mouse gestures for
single-node selection land, so the mismatch between "what's selected" and "what's shown"
is worth closing on its own, independent of those follow-ups.

## What Changes

- A new decoration behavior that recognizes when the editor's current selection is
  exactly a whole-node/subtree cover (per `escalate.ts`'s cover geometry) and renders
  block-level highlight chrome for it, instead of leaving it to read as plain
  character-level highlight.
- The chrome reads as one rectangle anchored to the covered subtree's ROOT column —
  not each individual line's own (possibly deeper) indentation — so it fills correctly
  under nested lists, code blocks, callouts, tables, and blockquotes, and never reaches
  into a shallower ancestor's own territory (e.g. selecting an H3 section tints from
  that H3's own column, not H1's or H2's).
- The native character-level highlight is suppressed while the whole selection is
  block-covered, so it doesn't visually compete with the chrome.
- Applies per-range: a multi-range escalated selection gets independent chrome for each
  covered subtree.
- Purely reactive to current editor state — no change to selection computation, the
  transaction filter, or document content; consistent with decorations' additive-only,
  state-non-mutating discipline.
- Composes with existing indentation/guide/marker decorations without displacing them.

## Capabilities

### New Capabilities
- `escalated-selection-decoration`: visual rendering of an escalated (whole-node or
  whole-subtree) selection as block-level highlight chrome, distinguishable from stock
  character-level selection highlight.

### Modified Capabilities
(none — selection computation in `node-selection-enforcement` and the base decoration
behaviors in `outline-decorations` are unchanged; this change only adds a new decoration
that reacts to selection state already produced by the existing escalation core.)

## Impact

- `src/plugin/decorations.ts` (or a sibling module): new decoration/DOM-patch path keyed
  off the current `EditorSelection`, reusing `escalate.ts`'s subtree-cover geometry
  read-only (no new escalation math).
- `src/escalate.ts`: likely exports a query helper (e.g. "is this range exactly some
  node's subtree cover") for the decoration layer to call — read-only addition, no
  change to existing escalation behavior.
- `styles.css`: new chrome styling (background/border) for escalated-selection blocks,
  coexisting with native selection highlight, indentation, and guide-line CSS.
- Editor-only, outline-mode-gated, Live Preview; no effect on document content, off-mode
  notes, or reading view.
