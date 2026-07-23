## Why

Outdent currently drops a node's following siblings instead of re-parenting them under it.
Outdenting the middle item of `- p\n\t- x\n\t- y\n\t- z\n` (outdenting `x`) produces
`- p\n\t- y\n\t- z\n\n- x` — `x` jumps out past its own former siblings `y`/`z` (which stay
under `p`) instead of becoming `p`'s immediate next sibling with `y`/`z` re-parented under it,
matching Logseq's outdent-in-place semantics. This is a pre-existing gap in the core `outdent`
operation (`document-tree-mapping`/Q2's original algebra) — no test ever covered "outdenting a
node with following siblings under the same parent" — that was only noticed via a
merge→split→outdent interaction surfaced during `outline-edit-enforcement`'s third manual pass
(docs/research/04-open-questions.md Q17). It affects every outdent of a non-last child, so it
is worth fixing at the root rather than leaving it as a known gap.

## What Changes

- **BREAKING**: `outdent`'s reparenting rule changes for non-heading nodes that have following
  siblings under the same parent. Today those following siblings stay put (silently orphaned
  from the outdented node's context); after this change they become the outdented node's own
  trailing children (after any children it already had), preserving the original relative
  order of `[outdented node's own children..., former following siblings...]`.
- Heading outdent (level-shift) is untouched — this only changes the non-heading
  brother→uncle path.
- Encoding-at-destination (`encodingKindAtDestination`) for the re-parented following siblings
  follows the same context-determined rule already used for the outdented node itself
  (Requirement: Context-determined encoding on reparent) — they now sit under a new parent
  (the outdented node) rather than under the original parent, so their nearest-preceding-sibling
  context is the outdented node's own last pre-existing child (if any).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `structural-operations`: the "Non-heading outdent moves brother to uncle" requirement gains
  following-sibling re-parenting semantics — outdenting a node with following siblings under
  the same parent now re-parents those following siblings as the outdented node's own trailing
  children, instead of leaving them behind under the original parent.

## Impact

- `src/ops.ts`: `outdent()` — the non-heading reparent path (surgery around
  `updateSiblings(doc, parentPath, ...)` / `updateSiblings(surgery, grandPath, ...)`) needs to
  detect and move following siblings into `moved.children`, re-encoding them for their new
  home under `moved` instead of leaving them under `parent`.
- `src/reencode.ts`: no new functions expected, but `reencodeForDestination` /
  `childBaseCol` are reused for the re-parented following siblings.
- Tests: `ops.test.ts` / `closure.test.ts` (no existing coverage for this case — new unit tests
  required), plus outline-edit-enforcement's e2e suite where the merge→split→outdent
  interaction was originally observed (docs/research/04-open-questions.md Q17) should be
  re-verified once the fix lands.
- No UI/keymap changes — same `outdent` entry point, same rejection codes; only the accepted
  non-heading, has-following-siblings case changes shape.
