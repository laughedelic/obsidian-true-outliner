## Context

The escalation rule shipped in `outline-selection-enforcement` (D4) reads: resolve both ends
to nodes, find the deepest common ancestor scope, and cover the contiguous run of THAT SCOPE'S
CHILDREN spanning both ends. The consequence nobody stated at the time is that crossing out of
a scope drags the scope's own root into the selection.

Measured on a real Obsidian instance (2026-07-25), in
`- parent / ⇥- child one / ⇥- child two / - next`:

| gesture | result |
| --- | --- |
| `⇧↓` once from inside `child two` | the entire document |
| two cursors in `child one`/`child two`, `⇧↓` once | a single range covering the entire document |

Both follow from the rule; neither is a behavior anyone chose. A third consequence is
structural: once an ancestor is in the cover, the range's ends are that ancestor's bounds, so
the node the gesture started from is no longer recoverable from the selection — which is why
`node-selection-extension` was heading toward a stored extension origin.

## Goals / Non-Goals

**Goals:**

- Keep every guarantee the recorded rationale actually asked for: a selection is always a set
  of whole subtrees, and every later operation on it (delete, move, copy) has a valid target.
- Stop pulling ancestors into a selection that merely crossed a scope boundary.
- Keep a block selection representable as one ordinary contiguous range, so multi-cursor stays
  distinguishable from block selection without any mode state.

**Non-Goals:**

- Cherry-picked, non-contiguous block selection (Logseq's `Cmd`-click). Expressible today via
  multi-range; not a gesture this change adds.
- Modal block-selection state.
- Heading/list re-encoding on paste — its own change.
- Any change to the gap-line trigger, expand-only, orientation, multi-range uniformity, or
  preamble jurisdiction requirements.

## Decisions

### D1. The invariant is downward closure, not upward

Restated: **no node is ever selected without its whole subtree.** A selection is a forest of
whole subtrees; the roots may sit at different depths.

What is given up is the implicit upward half — "and never together with content outside its
parent." That half is what forced the ancestor in. The recorded rationale never argued for it:
it argued that selecting a heading without its section, or a list item without its children,
has no valid structural meaning. Downward closure delivers exactly that. Every outliner in the
comparison (Logseq, Workflowy, Roam, Notion, Dynalist, Tana) enforces downward closure and none
enforces the upward half.

### D2. The cover is a forest span, and it is still one contiguous range

For a crossing range with ends resolving to `firstNode` and `lastNode` in document order:

- If one is an ancestor of the other, the cover is the ANCESTOR's whole subtree. (Unchanged —
  selecting a parent takes its children.)
- Otherwise the cover runs from the start of the outermost subtree fully containing `firstNode`
  and beginning at-or-after it, to the end of the outermost subtree fully containing `lastNode`.
  Equivalently: take the document-order run of nodes from `firstNode` to `lastNode`, close it
  under descendants, and the selection roots are the members whose parent is not a member.

**This is a single contiguous text range.** Node order is text order and subtree covers tile
the document, so a document-order run closed under descendants occupies contiguous text. In the
worked example, `child two` + `next` is lines 2–3 — contiguous, with `parent`'s own line 0
sitting above the span rather than between its parts. The old rule reached for `parent` because
of the common-ancestor formulation, not because any text needed bridging.

*Why this matters beyond simplicity:* no multi-range representation is introduced, so "is this
a block selection or a multi-cursor selection" is answered by shape with no ambiguity — a block
selection is ONE range, a multi-cursor selection is several. The discriminator problem that
would have come with a set-of-ranges representation does not arise.

*Consequence for `node-selection-extension`:* the cover's start edge again identifies the
originating node, so the extension-origin `StateField` that change was going to need is no
longer required. Its walk becomes a plain function of the current cover.

### D3. Copied roots normalize to a common level

A selection's roots may now sit at different depths (`child two` at depth 2 and `next` at depth
1). On paste, the roots SHALL become siblings at the destination depth, each preserving its own
internal relative structure exactly.

This is what every comparable outliner does and what real Logseq use confirms: copying subtrees
from different places and pasting them elsewhere behaves as if each had been copied and pasted
as a sibling in turn, children coming along unchanged. It is also what
`reencodeBlocksForDestination` already does for a multi-block payload; the change is to apply
it to a payload whose roots did not start as siblings.

*Alternative considered:* preserve the roots' original relative depths on paste. Rejected —
the payload has no anchor to be relative *to* once its common ancestor is not part of it, which
is exactly the incoherence the old contiguity rule was avoiding by pulling the ancestor in.
Normalizing is the other way to make the payload well formed, and it is the one users of every
other outliner already expect.

### D4. Geometry generalizes from sibling run to forest, in two places

`siblingRunCover` (escalate.ts) and `siblingCoverIds` (enforce.ts) both assume the covered
nodes are children of one scope. Both become forest-aware: given a span, return the maximal
subtrees it contains. `coveredSubtreeRoots` — which the selection chrome uses to decide whether
to render block-level decoration — follows from the same computation, so mixed-depth covers
decorate correctly rather than falling back to character-level highlight.

This is the same "one correct call site, one silently-stale duplicate" hazard recorded twice in
docs/research/04 (Q18's detection-gate split, Q19's re-encode split). The forest computation
SHALL live in one exported function that both call sites use.

### D5. What deliberately does not change

The gap-line trigger, the expand-only invariant, orientation preservation, uniform multi-range
escalation, preamble jurisdiction, and the classification scoping are all untouched. Each was
reviewed in its own real-vault pass and none of them depends on the common-ancestor
formulation — they operate on whatever cover the geometry produces.

## Risks / Trade-offs

- **A copy can now span depths whose payload looks odd as raw markdown** (an indented item
  followed by an unindented one) → D3's normalization is what makes the paste correct; the
  clipboard text itself is a faithful slice of the document either way, which is the
  isomorphism guarantee, not a defect.
- **Chrome for mixed-depth covers may look ragged** — the decoration anchors chrome one level
  beyond the covered root's own column, and a forest has several roots at several columns →
  needs a real look during the manual pass; `escalated-selection-decoration` already handles
  multi-range covers independently, so per-root chrome is the likely shape.
- **Existing property tests encode the old invariant** → they are rewritten, not deleted, and
  the new property (downward closure, forest of whole subtrees) is strictly checkable in the
  same style.
- **Someone relied on the old behavior to select a whole section quickly** → the Mod-A ladder
  is the gesture for widening to an ancestor, and it is unchanged.

## Migration Plan

In-editor behavior only. No file, data, or parse-model migration. Rollback is disabling the
plugin or toggling outline mode off, both of which restore stock selection byte-for-byte.

## Open Questions

- Should a cover's end include its last root's owned trailing gap newline? Deliberately
  deferred to `fix-orphan-gap-on-node-deletion`, which is sequenced first precisely because
  that decision changes this change's geometry.
- Does mixed-depth chrome read clearly, or does it need per-root treatment? Manual pass.
