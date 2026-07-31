## Why

`node-selection-enforcement`'s escalation rule conflates two ideas that its own recorded
rationale treats as one. The archived `outline-selection-enforcement` design (D4) justifies
selecting **whole subtrees**:

> a selection covering a heading but not its section (or a list item but not its children)
> has no valid structural meaning — every later operation on a node selection (delete, move,
> copy) targets subtrees... This matches Workflowy/Logseq behavior when selection leaves a
> single item.

It never separately justifies the other half of the rule: expanding to *the contiguous run of
children of the deepest common ancestor scope*. That expansion is what forces an ancestor into
the selection the moment a range crosses out of a scope, and it produces behavior nobody
chose:

- One `Shift+ArrowDown` from a subtree's last child selects the **entire document** (measured).
- Two cursors in adjacent siblings plus one press collapses to a single whole-document range
  (measured).
- The originating node becomes unrecoverable from the selection, because once an ancestor is
  pulled in the range's ends are that ancestor's bounds — which forced a stateful workaround
  into the extension design.

Every comparable outliner — Logseq, Workflowy, Roam, Notion, Dynalist, Tana — selects whole
subtrees without ever pulling in an ancestor. Real-vault use of Logseq confirms the shape:
selection is always about subtrees (a parent cannot be selected without its children), and
a copied set of subtrees pastes with its roots treated as siblings at the destination level.

This project has already conceded the point in writing. D4's own multi-range amendment says a
multi-range copy is "a concatenation of complete subtrees — **structurally valid by
construction**". The validity argument that motivates the whole requirement is satisfied
without contiguity.

## What Changes

- **The escalation cover stops expanding to a common-ancestor sibling run.** A boundary-
  crossing range escalates to the span starting at the FIRST end's own subtree start and
  closed under descendants from there — so it ends at the last root's subtree end, which is
  the LAST end's own subtree end in the common case and reaches further only when a node
  whose own line falls INSIDE the span has descendants below it (design D2). An ancestor whose
  own line sits ABOVE the span is never pulled in — which is the whole point — so crossing out
  of a scope stops at the crossing instead of reaching that scope's root and its later
  children.
- **The invariant is restated, not abandoned.** *No node is ever selected without its whole
  subtree* (downward closure) replaces *no node is ever partially selected together with
  content outside it* (which silently implied upward closure too). A selection remains a
  forest of whole subtrees; those subtrees may now sit at different depths.
- **The copied payload's roots normalize to a common level.** Each selected root keeps its own
  internal relative structure exactly, and the roots become siblings at the destination depth
  — matching how every other outliner treats a multi-subtree copy, and how our own
  `reencodeBlocksForDestination` already treats a multi-block paste.
- **Cover geometry generalizes from a sibling run to a forest.** `coveredSubtreeRoots` and
  `siblingCoverIds` both currently assume the covered nodes are siblings under one scope. They
  become forest-aware. A forest's roots decompose into exactly one contiguous sibling run per
  parent, which is already the input shape `deleteSubtreeGroups` (`fix-orphan-gap-on-node-
  deletion` D2) takes — so structural deletion of a mixed-depth cover needs no new machinery,
  only the grouped ids.
- **A classification gate widens as a side effect.** `coveredSubtreeRoots` now also backs
  `classify.ts`'s `isExactSubtreeCoverDeletion` — the gate that routes an exact-cover deletion
  to the verdict layer even though its raw line span reads as within-node. Forest-awareness
  admits shapes that gate has never seen. The widening is intended (a mixed-depth cover's
  deletion must be enforced too), but it is a behavior change in a second capability
  (`transaction-classification`) and is verified there, not assumed.
- **BREAKING (in-mode behavior)**: escalated selections that previously grew to include an
  ancestor now stop at the crossing. Files, the parse model, and off-mode behavior are
  untouched.

**The selection stays a single contiguous range.** This is the finding that makes the change
small: node order is text order, so a document-order run of nodes closed under descendants is
already a contiguous text span. In `- parent / ⇥- child one / ⇥- child two / - next`,
selecting `child two` and `next` is lines 2–3 — textually contiguous, no ancestor required.
The old rule pulled `parent` in not because of text geometry but purely because of the
common-ancestor formulation. No multi-range representation is introduced, so multi-cursor
remains unambiguously distinguishable: a block selection is one range, a multi-cursor
selection is several.

## Capabilities

### Modified Capabilities

- `node-selection-enforcement`: the escalation cover requirement is REPLACED — its name asserts
  the sibling-run mechanism this change removes, so it is retired and a forest-span requirement
  added in its place, with the whole-subtree invariant restated as downward closure. The gap-line trigger, expand-only, orientation, multi-range and
  jurisdiction requirements are unchanged.
- `structural-operations`: subtree insertion gains the root-normalization rule for a payload
  whose roots came from different depths.
- `escalated-selection-decoration`: the "exact cover" recognition generalizes from a sibling
  run to a forest of roots at mixed depths.

### Deliberately unmodified

- `transaction-classification`: its "A change exactly covering whole subtrees is a boundary-
  crossing edit" requirement already delegates cover recognition to the exported computation
  rather than restating the geometry, so it needs no textual amendment — but its OBSERVABLE
  reach widens with the cover, which is why it gets its own verification task rather than
  riding along silently.
- `structural-operations`' "Subtree deletion" requirement keeps its single-run contiguity rule.
  A forest is delivered as several such runs through the existing multi-group form, not by
  loosening what one run may be.

## Impact

- `src/escalate.ts`: `subtreeCoverOf` unchanged; `siblingRunCover` is replaced by a
  forest-cover computation for the crossing case, and `coveredSubtreeRoots` follows.
- `src/classify.ts`: `isExactSubtreeCoverDeletion` reads `coveredSubtreeRoots`, so a
  forest-aware cover WIDENS a classification gate — deletions that read as within-node today
  start reaching the verdict layer. Re-measured explicitly rather than assumed benign.
- `src/enforce.ts`: `siblingCoverIds` returns GROUPS (one contiguous sibling run per parent)
  instead of one flat run, and `coverIdsOf` feeds them to `deleteSubtreeGroups`.
  `computeMultiRangeDeletionVerdict` already builds groups from `coveredSubtreeRoots` and
  needs no shape change.
- `src/ops.ts`: `deleteSubtreeGroups` already removes several runs under different parents in
  one pass — no new deletion machinery. `reencodeBlocksForDestination` gains root-level
  normalization.
- `src/plugin/decorations.ts`: two `coveredSubtreeRoots` call sites gate block chrome; a
  mixed-depth cover must decorate per root rather than fall back to character-level highlight.
- `tests/escalate.test.ts`: the "multi-sibling scope resolution" case is re-expected, and a
  downward-closure property replaces the implicit sibling-run assumption.
- E2E: `61-selection-enforcement.e2e.ts`'s crossing scenarios change expected covers.

## Sequencing

- **Before** `node-selection-extension`, whose walk is defined over the covers this change
  produces — and which no longer needs the extension-origin state once ancestors stop being
  pulled in, since the cover's start edge again identifies the originating node.
- **After** `fix-orphan-gap-on-node-deletion` — SATISFIED (archived 2026-07-26). It settled the
  question this change's geometry depends on: a cover's end includes the last root's owned gap
  in full, at `ch: 0` on the gap's last line (`subtreeCoverEnd`). It also created the two new
  `coveredSubtreeRoots` call sites listed under Impact, which is the main way the ground has
  moved since this proposal was written.
- **Independent of** `content-space-caret` (archived 2026-07-26) and
  `paste-heading-section-reencoding` (still open).

## Out of scope

- Non-contiguous ("cherry-picked") block selection, the `Cmd`-click gesture Logseq offers.
  Multi-range selection already expresses it; making it a first-class gesture is separate.
- Modal block-selection state (docs/research/13). This change deliberately keeps a block
  selection representable as one ordinary range, which is what lets that question stay open.
- The paste re-encoding of headings into list scopes — its own change.
