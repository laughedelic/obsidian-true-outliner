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
  crossing range escalates to exactly the span from the FIRST end's own subtree start to the
  LAST end's own subtree end — unless one end's node is an ancestor of the other's, in which
  case the ancestor's whole subtree is the cover, as today. Ancestors above the span are not
  pulled in, and neither are the ends' own later siblings.
- **The invariant is restated, not abandoned.** *No node is ever selected without its whole
  subtree* (downward closure) replaces *no node is ever partially selected together with
  content outside it* (which silently implied upward closure too). A selection remains a
  forest of whole subtrees; those subtrees may now sit at different depths.
- **The copied payload's roots normalize to a common level.** Each selected root keeps its own
  internal relative structure exactly, and the roots become siblings at the destination depth
  — matching how every other outliner treats a multi-subtree copy, and how our own
  `reencodeBlocksForDestination` already treats a multi-block paste.
- **Cover geometry generalizes from a sibling run to a forest.** `coveredSubtreeRoots` (used by
  the selection chrome) and `siblingCoverIds` (used by structural deletion) both currently
  assume the covered nodes are siblings under one scope. They become forest-aware.
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

## Impact

- `src/escalate.ts`: `subtreeCoverOf` unchanged; `siblingRunCover` is replaced by a
  forest-cover computation for the crossing case, and `coveredSubtreeRoots` follows.
- `src/enforce.ts`: `siblingCoverIds` becomes forest-aware, so structural deletion of a
  mixed-depth selection removes each root's subtree with its gap.
- `src/ops.ts`: `reencodeBlocksForDestination` gains root-level normalization.
- `tests/escalate.test.ts`: the property "an escalated cover is a run of siblings under one
  scope" is replaced by "an escalated cover is a forest of whole subtrees, downward-closed".
- E2E: `61-selection-enforcement.e2e.ts`'s crossing scenarios change expected covers.

## Sequencing

- **Before** `node-selection-extension`, whose walk is defined over the covers this change
  produces — and which no longer needs the extension-origin state once ancestors stop being
  pulled in, since the cover's start edge again identifies the originating node.
- **After** `fix-orphan-gap-on-node-deletion`, which decides whether a cover's end includes its
  owned gap's newline. That decision changes the geometry this change builds on, and is
  cheaper to settle on the simpler single-node case first.
- **Independent of** `content-space-caret` and `paste-heading-section-reencoding`.

## Out of scope

- Non-contiguous ("cherry-picked") block selection, the `Cmd`-click gesture Logseq offers.
  Multi-range selection already expresses it; making it a first-class gesture is separate.
- Modal block-selection state (docs/research/13). This change deliberately keeps a block
  selection representable as one ordinary range, which is what lets that question stay open.
- The paste re-encoding of headings into list scopes — its own change.
