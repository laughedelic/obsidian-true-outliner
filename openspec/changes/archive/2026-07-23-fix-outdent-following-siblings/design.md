## Context

`outdent(doc, nodeId)` in [src/ops.ts](../../../src/ops.ts) implements the non-heading
brother→uncle move (heading outdent is a separate, unaffected level-shift path). Current
surgery, roughly:

```
surgery = updateSiblings(doc, parentPath, nodes => nodes.filter((_, i) => i !== index))
surgery = updateSiblings(surgery, grandPath, nodes => [
  ...nodes.slice(0, parentIndex + 1), moved, ...nodes.slice(parentIndex + 1),
])
```

Only the outdented node itself (`index`) is removed from `parent`'s children; everything
after it (`index + 1..`) stays under `parent`. `moved` (the re-encoded outdented node, with
its own pre-existing `children` carried over unchanged) is spliced in as `parent`'s next
sibling under `grandParent`. The result: the node's former following siblings stay attached to
`parent` instead of following the node out — see docs/research/04-open-questions.md Q17 for
the concrete repro (`- p\n\t- x\n\t- y\n\t- z\n`, outdenting `x`).

`document-tree-mapping` (Q2) already defines a "Context-determined encoding on reparent" rule
(`encodingKindAtDestination`) used to pick the outdented node's own encoding at its new spot;
this design reuses the same function for the re-parented siblings.

## Goals / Non-Goals

**Goals:**
- Outdenting a node with following siblings under the same parent re-parents those following
  siblings as the outdented node's own trailing children, appended after any children the
  node already had, preserving their original relative order.
- The re-parented siblings are re-encoded for their new context using the same
  context-determined encoding rule already applied to the outdented node itself.
- Closure holds: `parse(encode(surgery))` round-trips exactly as it does today for every other
  outdent case (no new node identity churn, no accidental line drift for untouched subtrees).
- Existing outdent behavior for a node with NO following siblings (the common case, already
  covered by tests) is byte-for-byte unchanged.

**Non-Goals:**
- Heading outdent (level-shift) semantics — untouched.
- Any change to indent, moveUp/moveDown, or split/merge.
- Revisiting `encodingKindAtDestination`'s own algebra — this reuses it as-is.
- Fixing the two other Q17 findings (heading Enter-handling) — tracked separately, out of
  scope here.

## Decisions

### Following siblings become the outdented node's trailing children, not a new sibling group
Matches Logseq's outdent-in-place semantics (the proposal's chosen behavior, already agreed in
Q17): the node being outdented "takes its former following siblings down with it" as its own
children, rather than leaving them as stranded orphans or promoting them to uncle level
themselves (which would silently flatten structure one level further than requested).
**Alternative considered**: leave following siblings under the original parent (today's
behavior) — rejected, this is the bug being fixed. **Alternative considered**: promote
following siblings to uncle level alongside the outdented node — rejected, changes the meaning
of "outdent one node" into "outdent N nodes," not what the keystroke requests.

### Re-parented siblings append AFTER the outdented node's pre-existing children
If the outdented node already has children (e.g. `x` had a child `w` before being outdented),
the former following siblings (`y`, `z`) are appended after `w`, giving `x: [w, y, z]`. This
keeps `w`'s position stable (least surprising: outdent doesn't reorder what was already there)
and reads naturally top-to-bottom as one flattened list.
**Alternative considered**: prepend `y`, `z` before `w` — rejected, would reorder `w` relative
to the node's other pre-existing state for no reason tied to the outdent itself.

### Re-encode moved-in siblings via the existing context-determined rule, computed against their new parent
Each re-parented sibling gets its encoding recomputed the same way `moved` itself is
(`encodingKindAtDestination`), but with the outdented node as the new parent and the correct
preceding/following slice among the node's new full children list. This keeps the single
"how does a reparented node's encoding get chosen" rule from `document-tree-mapping`
authoritative in exactly one place, rather than inventing a second rule for this case.
**Alternative considered**: carry the siblings' encoding verbatim (no re-encoding) — rejected,
can produce invalid nesting (e.g. a paragraph landing under a list-item parent with no
paragraph-under-list-item encoding) since their new parent's kind may differ from `parent`'s.

### Indentation: re-parented siblings shift to `childBaseCol(moved)`
Since `moved` itself changes to a new indentation column (`parent`'s former level via
`leadingWhitespace(parent.lines[0])` / `destinationIndent`), its new children must sit at
`childBaseCol(moved)` (computed with `moved`'s post-reencode marker), the same width
convention `reencodeForDestination` already uses for a node's own children (see its
`childDelta` computations). Each re-parented sibling subtree is passed through
`reencodeForDestination` (or `shiftSubtree`, when no kind conversion is needed) exactly like
`moved` is today, just against `moved` as parent instead of `grandParent`.

### Sequencing: compute `moved`'s final children before building `moved`, or patch after
Simplest implementation: build `moved` (today's `reencodeForDestination` call) first, then
compute the re-encoded following-siblings and set `moved = { ...moved, children: [...moved.children, ...reencodedFollowing] }`
before splicing `moved` into `grandPath`. `parentPath`'s surgery becomes
`nodes.filter((_, i) => i <= index).filter((_, i2) => ...)` — concretely,
`nodes.slice(0, index)` (drop the node itself AND everything after it), replacing today's
`nodes.filter((_, i) => i !== index)`.
**Alternative considered**: two-pass surgery (remove node, then separately migrate following
siblings in a follow-up `updateSiblings` call) — rejected as needless complexity; one
`updateSiblings(doc, parentPath, ...)` call and one `updateSiblings(surgery, grandPath, ...)`
call is enough since both edits are still scoped to disjoint parts of the tree in a single
pass (parentPath truncates to `slice(0, index)`, grandPath gets `moved` with its new children
baked in).

### Trailing-gap handling for the truncated parent
`parent`'s last surviving child is now `index - 1` (or `parent` has zero children left, if the
outdented node was `parent`'s only child at index 0). Per the existing `trailingGap` model
(see `subtreeFinalNode`/`setFinalGap` used by `move`), the gap that used to trail `parent`'s
whole children list (owned by whichever node was previously last, likely one of the removed
following siblings) must not silently vanish or duplicate — it belongs to the document
boundary between what's now `parent`'s new last child (or `parent` itself, if now childless)
and whatever follows `moved` at `grandParent` level. Concretely: carry the trailing gap from
`subtreeFinalNode(<old last child under parent>)` onto the new last surviving node under
`parent` (`index - 1`, if it exists) — mirroring the existing `moveUp`/`moveDown` gap-carry
pattern, not inventing a new one.

## Risks / Trade-offs

- **[Risk] Off-by-one in the children-append order** (children before/after re-parented
  siblings) → Mitigation: explicit unit test pinning `x: [w, y, z]` order per the "append
  after" decision above.
- **[Risk] Trailing-gap loss when the outdented node was the last child before removal**
  (no following siblings — today's already-covered case) → Mitigation: this path is
  unchanged by the fix (empty following-siblings list means `moved.children` gets nothing
  appended, and the gap-carry logic only fires when there's a gap to carry); add a regression
  test asserting today's single-item-outdent tests still pass byte-for-byte.
- **[Risk] Re-encoding following siblings could change their kind unexpectedly** (e.g. a list
  item becoming a paragraph because it's now the outdented node's first re-parented child with
  no preceding sibling under the new parent, and the new parent's own kind drives the
  "no-siblings" fallback) → Mitigation: this is the same rule already governing the outdented
  node's own encoding (Q2's "Context-determined encoding on reparent"), so behavior is
  consistent with existing outdent semantics rather than novel; cover with a scenario where a
  reparented sibling's kind actually changes, to make the behavior visible and intentional
  rather than accidental.
- **[Risk] `finalize`'s cursor/edit-diffing (`diffLines`) assumptions** may implicitly expect
  only the outdented subtree's lines to move → Mitigation: verify `finalize` naturally handles
  a larger set of moved/re-encoded lines (it already diffs against the full `surgery` doc, not
  a scoped subset), and check the emitted `Edit` list stays minimal for the untouched-children
  case.

## Migration Plan

Pure function change, no persisted state or schema migration. Roll out as a normal code change
behind the existing test suite:
1. Add failing unit tests in `ops.test.ts` for the Q17 repro and its variants (no children,
   with pre-existing children, deeply nested following siblings) — confirm they fail against
   current `outdent`.
2. Implement the fix in `src/ops.ts::outdent`.
3. Confirm new tests pass and no existing `ops.test.ts`/`closure.test.ts` test regresses.
4. Re-run the outline-edit-enforcement e2e scenario that originally surfaced this
   (merge→split→outdent) to confirm the interaction now restores the expected structure.
Rollback is a plain revert — no data migration involved since this only affects in-memory tree
surgery for a live edit operation.

## Open Questions

- None outstanding — Q17 already recorded the user's chosen semantics (Logseq-style
  outdent-in-place); this design operationalizes that decision into `ops.ts`.
