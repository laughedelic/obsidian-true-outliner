## Context

`node-selection-enforcement` already computes subtree covers (`escalate.ts`:
`subtreeCoverOf`, `subtreeContentEnd`, `siblingRunCover`) to escalate drag/keyboard
selections that cross node boundaries. That module is deliberately CM6-free — pure
`OutlineDoc`/`LineRange` math, with `src/plugin/transaction-filter.ts` as its only CM6
adapter. Mod-A is currently NOT routed through any of this: it's native CM6/Obsidian
Select All, unconditionally selecting the whole document in one press.

`src/plugin/keymap.ts` already has a precedent for exactly the kind of interception this
needs: `grammarExtension` is a `Prec.highest` keymap that gates on outline mode via
`editorInfoField`, converts CM6 offsets to `{line, ch}`, calls a pure planning function,
and dispatches the result (or returns `false` to fall through to stock behavior when the
pure function has nothing to do).

## Goals / Non-Goals

**Goals:**
- Repeated Mod-A climbs: node's own content → node's whole subtree → parent's whole
  subtree → ... → whole outline body → whole document (frontmatter included, i.e.
  identical to native Select All).
- Stateless: no press-count timer or stored "last rung" — each press recomputes the
  ladder from the CURRENT selection and picks the next rung strictly containing it.
- Reuses `escalate.ts`'s existing subtree-cover geometry rather than reimplementing it.
- Each range in a multi-range selection climbs its own ladder independently; CM6's own
  `EditorSelection` construction normalizes/merges overlaps.
- Falls through cleanly to native Select All: outside outline mode, and at the top rung.

**Non-Goals:**
- Not touching drag/mouse selection escalation, gap-line trigger, or any existing
  `node-selection-enforcement` behavior — this only adds a new keymap consumer of the
  existing geometry.
- Not the "click the bullet to select the subtree" mouse gesture
  (docs/research/13 Track 2, separate item) — keyboard-only here.
- Not modal block-selection keyboard extension (Shift+Down escalating by subtree per
  keypress) — a separate, larger piece per docs/research/13.
- Not fixing the structural keymap commands' (Tab/Shift-Tab/move) lack of
  multi-node-selection awareness — filed separately in docs/research/13 (2026-07-24
  entry); a ladder-selected multi-subtree range hitting Tab today still only touches the
  last node, and this change does not alter that.

## Decisions

### D1: New pure module `src/select-all-ladder.ts`, not a method added to `escalate.ts`
The ladder needs different geometry than escalation: escalation asks "does this range
need to grow to become a valid cover?"; the ladder asks "given the document tree, what
is the ORDERED SEQUENCE of rungs (content → subtree → ancestor subtrees → outline →
document) for the node(s) under this range, and which rung does the current range
already sit on?" That's a distinct question worth its own file, though it will import
and reuse `escalate.ts`'s internal cover-computation helpers (exporting
`subtreeCoverOf`/`subtreeContentEnd` or an equivalent shared helper, whichever keeps
duplication lowest — decided at implementation time, not a spec-level concern).

**Alternative considered**: extend `escalateRange` itself to also handle Mod-A. Rejected
— escalation is triggered by TRANSACTION SHAPE (a drag/paste that already crosses a
boundary) and lives in the transaction filter; the ladder is triggered by a REPEATED KEY
PRESS and needs its own keymap entry point per the design already agreed in
docs/research/13. Conflating them would make `escalateRange`'s contract harder to reason
about for both call sites.

### D2: Keymap interception, not the transaction filter
docs/research/13 already settled this: the transaction filter sees a dispatched
transaction, and Mod-A dispatched twice in a row produces two IDENTICAL "select
everything" transactions — nothing in the transaction itself distinguishes "first
press" from "second press," so the filter cannot implement a ladder. A `Prec.highest`
keymap handler runs BEFORE any transaction is created and can inspect the CURRENT
selection to decide the NEXT one, exactly like `grammarExtension` already does for
Tab/Enter.

**Alternative considered**: a stored "press count" or "last selection" field on the
editor. Rejected per the stateless design goal already agreed in docs/research/13 — a
timer/counter approach breaks the moment the user clicks away, edits, or switches panes
between presses, and Workflowy/obsidian-outliner's own two-step versions are stateless
for the same reason.

### D3: Ladder rung computation — recompute from the document tree on every press
For a given range's anchor node (found via `nodeAtLine`, same as `escalateRange`), the
rung sequence is:
1. `{ node's content: node.lines only, subtree's cover clipped to exclude descendants }`
2. `subtreeCoverOf(doc, node)` — the node's own whole subtree (reused as-is from
   `escalate.ts`).
3. `subtreeCoverOf(doc, parent)`, then `subtreeCoverOf(doc, grandparent)`, ... up
   `findPath`'s ancestor chain to a top-level node.
4. The whole outline body: cover from the first top-level node's start to the last
   top-level node's `subtreeContentEnd`.
5. The whole document: `{0, doc.preamble.length + <outline body> + trailing}` —
   identical to what native Select All already produces, so rung 5 is implemented as
   "return false, let stock Mod-A handle it" rather than hand-computing the same range.

The handler compares the CURRENT primary range (and, per-range, every range in a
multi-range selection) against this sequence: find the first rung that STRICTLY
contains the current range (or, if the current range doesn't exactly equal any earlier
rung, the first rung that contains it at all — covers the "user made a selection by hand
that happens to fall between two rungs" case, landing on the smallest rung that swallows
it rather than requiring an exact match to advance). If the current range already equals
the topmost non-document rung, fall through to native Select All for rung 5.

### D4: List-item "own content" rung starts after the marker
Per docs/research/13's flagged detail: rung 1 for a list item starts at
`contentColumnCh` of its first line (the same marker-transparent boundary
`clampCursorToContent`/`splitNode` already use in `ops.ts`), not column 0 — matching
obsidian-outliner and reading better for copy (copying a list item's content shouldn't
include its own `- ` marker). Headings and paragraphs have no marker to exclude, so
their rung 1 starts at column 0 of their first line, same as today's cursor position
there.

### D5: Multi-range handling — independent per-range ladder climb, CM6 normalizes
Matches `escalateRanges`' own multi-range approach: map each range through the same
single-range rung logic independently, then hand the full array to
`EditorSelection.create` (or equivalent), letting CM6's own overlap-merging do the
work — no custom merge logic needed. Unlike `escalateRanges`, there is no "uniform
escalation" step here: each range legitimately sits at its OWN rung (e.g., two ranges in
sibling nodes at different depths), and forcing them to a common rung isn't part of the
agreed design.

## Risks / Trade-offs

- **Ambiguous "which rung is next" when the user's selection doesn't exactly match any
  rung** (e.g., a partial manual selection, or a selection left over from a completed
  edit) → Mitigation: land on the smallest rung that CONTAINS the current selection,
  same resolution `expandToCover`-style logic already uses elsewhere; first press always
  "rounds up" to structure rather than requiring an exact prior rung.
- **Tight-list "own content" rung (D4) has no visual distinction from the subtree rung
  when a list item has no children** → Mitigation: none needed — the ladder correctly
  collapses two rungs into one for a leaf node (content end == subtree end), which is
  the existing pattern `escalateRange`'s same-node case already exhibits.
- **Deep documents produce long ladders (many ancestor rungs)** → Mitigation: none
  needed functionally (this is the intended, wanted behavior — Logseq-style
  parent-by-parent escalation per the precedent docs/research/13 cites); flag only as a
  UX note for manual testing, not a defect.
- **No automated coverage for the keymap dispatch path itself** (same class of
  focus/timing concern already accepted for `SelectionDecorationPlugin`) → Mitigation:
  the pure ladder-computation module gets full unit/property test coverage (mirroring
  `tests/escalate.test.ts`); the keymap wiring itself is verified manually in a real
  vault, consistent with this project's established practice for CM6-adapter-level code.

## Migration Plan

Purely additive: a new pure module plus one new keymap binding. No data model, storage,
or existing-capability changes. No feature flag needed — ships as part of the existing
`Prec.highest` grammar keymap extension, active whenever outline mode is on for a file,
same activation gating as Tab/Enter today. Rollback is a revert of the two changed/added
files if needed.

## Open Questions

- Exact export surface between `escalate.ts` and the new ladder module (share
  `subtreeCoverOf`/`subtreeContentEnd` via export, or duplicate the small amount of
  needed geometry) — an implementation-time call, not expected to affect behavior or the
  spec.
- Whether rung 1 for a node with children but empty of "extra" content beyond its own
  first line(s) needs any special-casing beyond what D4/D3 already describe — expected
  no, but worth confirming against `tests/escalate.test.ts`'s existing fixture set during
  implementation.
