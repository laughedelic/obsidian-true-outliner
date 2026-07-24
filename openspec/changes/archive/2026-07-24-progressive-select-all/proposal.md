## Why

Stock Select All (Mod-A) jumps straight from "wherever the cursor is" to "the entire
document," skipping every level of the outline's own structure in between. In an
outliner, the useful intermediate stops are node-shaped: a node's own content, its
whole subtree, its parent's subtree, and so on up to the root. `node-selection-enforcement`
already computes exactly this geometry (subtree covers) to escalate drag/keyboard
selections that cross node boundaries, but Mod-A itself is never routed through it —
pressing it still hands the browser/CM6's native "select everything" behavior with no
node-aware stops. `docs/research/13-selection-follow-ups.md`'s Track 2 records the
design already agreed after the second manual pass of that change (2026-07-20): a
stateless, repeated-Mod-A ladder that climbs node → subtree → ancestor subtrees →
whole document, reusing the existing escalation geometry rather than inventing new math.

This also stands in for keyboard single-node selection in tight lists, where the
gap-line drag trigger (`node-selection-enforcement`'s D4 amendment) has no blank line to
work with — the ladder is the only way to reach "select just this node" from the
keyboard there.

## What Changes

- Add a high-precedence `Mod-a` keymap handler (same precedence tier as the existing
  Tab/Enter grammar handler in `src/plugin/keymap.ts`) that intercepts Select All in
  outline-mode files before CM6's/Obsidian's own binding runs.
- Add a pure `selectAllLadder` (or similarly named) function, alongside `escalate.ts`,
  that given the document tree and the current selection's ranges returns the next rung
  up the ladder for each range:
  1. the current node's own content text (list items: content only, after the marker —
     see Detail to pin down below for headings/paragraphs, which have no marker to
     exclude);
  2. that node's whole subtree (reuses `subtreeCoverOf`/existing escalation geometry);
  3. the parent node's whole subtree; repeat outward through each ancestor;
  4. the whole outline body (all top-level nodes);
  5. the whole document including any frontmatter/preamble — identical to native
     Select All, so the ladder's top rung is a pass-through to stock behavior.
- Stateless matching: each keypress compares the CURRENT selection's ranges against the
  ladder computed from scratch (no press-count timer, no stored "where was I" state) and
  advances to the next rung strictly containing it — so the ladder is robust to any
  interruption (clicking away, editing, switching notes) between presses, matching how
  `obsidian-outliner`'s two-step version works.
- Multi-range support: each existing selection range climbs its own ladder
  independently; the resulting ranges are handed to CM6 as one dispatch, and
  `EditorSelection`'s own normalization merges any that now overlap — the uniform
  multi-range escalation rule already shipped in `node-selection-enforcement` keeps a
  merged result whole-subtree-valid.
- Falls through to native Select All untouched: outside outline mode, at the top rung,
  or for any selection shape the ladder doesn't recognize as sitting on a rung (e.g. a
  selection the user made manually that matches no computed rung) — first press just
  lands on whichever rung contains it.

## Capabilities

### New Capabilities
- `progressive-select-all`: repeated Mod-A escalation through node content → subtree →
  ancestor subtrees → whole outline → whole document, as a stateless keymap ladder built
  on `node-selection-enforcement`'s existing subtree-cover geometry.

### Modified Capabilities
(none — this adds a new keymap capability and a new pure-function module; it does not
change any existing capability's requirements. `node-selection-enforcement`'s escalation
math and `escalated-selection-decoration`'s rendering are reused as-is, not modified.)

## Impact

- New file: `src/select-all-ladder.ts` (or similar) — pure function(s), no CM6 imports,
  same style as `src/escalate.ts`.
- `src/plugin/keymap.ts`: add a `Mod-a` binding to the existing `Prec.highest` keymap
  extension, gated the same way (outline-mode check via `editorInfoField`).
- Tests: property/unit tests for the ladder module (mirroring `tests/escalate.test.ts`'s
  style), plus manual real-vault verification per this project's established practice for
  selection/focus-timing behavior (not easily covered by the automated harness).
- No changes to `node-selection-enforcement`'s spec, `escalate.ts`'s escalation math, or
  the transaction-filter drag/click path — this is purely a new, additive keymap
  consumer of that existing geometry.
