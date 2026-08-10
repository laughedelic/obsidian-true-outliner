## Context

See proposal.md — Why. The state that shapes the approach:

`renumberOrdered(nodes)` in `src/ops.ts` is a pure sibling-list → sibling-list function. It
walks maximal runs of ordered items and rewrites each run's markers from
`Math.min(...run numbers)`. Its own doc comment states the reason for the minimum — a swap
must not inherit the moved item's number, and `5. 6. 7.` must keep starting at 5 — and
that reason only holds when the run's members are the same set before and after.

Every caller passes the ALREADY-transformed sibling list, so by the time the function runs,
the removed items are gone and the pre-removal start is unrecoverable from its argument.
That is the whole defect: the information exists at every call site and is thrown away one
line before it is needed.

Callers fall into three shapes:

- **Removal from a sibling list** — `deleteSubtreeGroups` (the general form `deleteSubtrees`
  delegates to), `unwrapListItem`, `indent`'s departure side (the node leaves its old level
  to become a child of its previous sibling), and all three of `mergeNodes`' surgery
  branches.
- **Permutation** — `move`'s swap.
- **Insertion or replacement** — `splitNode`, `insertSubtrees`, `outdent`'s arrival side,
  `indent`'s arrival side.

`outdent` truncates the child list at the outdented node's index, which keeps index 0, so
its departure side cannot lose a head.

`mergeNodes` was classified as an insertion in this design's first draft, on the argument
that `second` is reached by walking forward from `first` and so always has a predecessor at
its own level. **That argument is wrong**, and review caught it. Having a predecessor is
not the same as keeping the run's HEAD: the predecessor need not be in the run. Measured,
all three branches lose one:

- Absorbing a non-ordered SEPARATOR joins two runs — `5. a` / `- x` / `1. c` produced
  `1. ax` / `2. c`, rewriting the survivor's own number to the swallowed run's minimum.
- Absorbing a node's own first child renumbered NOTHING — `- p` with `1. a` / `2. b` /
  `3. c` produced `- pa` with `2. b` / `3. c`.
- A cross-scope merge removes `second` at index ≥ 1 whose predecessor is a bullet —
  `- p` / `- kid` / `1. a` / `2. b` left `2. b` at the top level.

## Goals / Non-Goals

**Goals:**

- One stated contract for renumbering that covers both shapes, so a future operation reads
  a rule instead of copying a call.
- The removal fix reaches every removal call site, not the reported one only.
- A permutation's behavior is byte-identical to today, pinned by a test rather than by
  reading.

**Non-Goals:**

- Changing when renumbering happens, or which lines it may touch. Only the start number
  a run resumes from changes.
- Any change to `OutlineNode`/`listStyle`. The pre-removal start is derived at the call
  site and consumed immediately; it never becomes model state.
- The insertion direction (a lower-numbered item pasted into a higher-numbered run) — see
  proposal.md — Out of scope.
- **The siblings an outdent ADOPTS.** Measured while confirming D4: outdenting `1. a` out of
  `- p` / `1. a` / `2. b` / `3. c` leaves `2. b` and `3. c` as children of `a`, and that
  nested run starts at 2. It reads oddly, but the list is NEW at that level — nothing was
  removed from it — so the removal rule has no start to restore, and renumbering it from 1
  would be the renumber-always policy this project does not use. Recorded, not fixed: it is
  the same open direction as the insertion case above.

## Decisions

### D1. A second entry point that takes the BEFORE list, not a parameter on the existing one

`renumberOrderedAfterRemoval(before, after)` sits beside `renumberOrdered(nodes)`, and both
delegate to one internal walker parameterized by how a run's start is chosen.

Alternatives considered:

- **`renumberOrdered(nodes, startFrom?)`** — the caller computes the number. Every removal
  site would then have to find which run the first survivor was in, which is the actual
  logic; it would be duplicated three times, and a caller that passes nothing silently gets
  the buggy behavior back.
- **Always take the before list.** Then the permutation and insertion callers must supply a
  "before" whose relationship to "after" is not a removal, and the function's contract
  becomes "match nodes by id where you can, else guess" — the min rule expressed as a
  fallback rather than as a deliberate choice. Two named functions say which rule the
  caller means.

The pairing also makes the diff at each call site one identifier wide and reviewable
against the shape list in Context.

### D2. The start is looked up by the surviving run's FIRST member, keyed on node id

Build, from `before`, a map of ordered-node id → the start number of the maximal run that
node was in. For each maximal ordered run in `after`, use `map.get(run[0].id)`; where the id
is absent, fall back to the minimum present.

Why the first member rather than, say, the lowest surviving id: a removal can only shrink or
MERGE runs, never split one or reorder within it, so the first survivor is the earliest
remaining member of the earliest contributing run — exactly the item whose original run
start the survivors should resume from. That is what makes `5. 6. 7.` minus its head come
back as `5. 6.` while `1. 2. 3.` minus its head comes back as `1. 2.`, with no case analysis.

The fallback is unreachable for the three call sites (a pure removal introduces no new
nodes), and is a defined answer rather than a crash if a fourth caller is ever routed here
with a mixed transformation. It is deliberately the OLD rule, so a mistaken call site
degrades to today's behavior rather than to a new one.

### D3. A run-merging removal takes the earlier run's start

Deleting a paragraph that stood between `1. 2.` and `5. 6.` leaves one run of four. D2's
lookup answers this without a special case — the first survivor came from the run that
started at 1 — and the spec states it so it is a decision rather than a side effect. The
alternative, keeping two runs alive across a now-absent separator, would need runs to be
identified by something other than adjacency, which is a model change for a shape nobody
has reported.

### D4. Reproduce before fixing, at the operation layer

The catalogue's two measurements are recorded outputs of `deleteSubtrees`, not of
`renumberOrdered`. The first task is to turn them into failing tests through the public
operation, so the fix is verified against the reported symptom rather than against the
helper's internals — and so `indent`'s and `unwrapListItem`'s exposure is MEASURED rather
than inferred from reading the call sites. If either turns out to be unreachable in
practice, that is recorded and its scenario dropped, not asserted anyway.

### D5. The child scope's marker comes from the donor that decided its kind

Added after a real-vault report during review (see proposal.md — What Changes). The
child-scope branch of `splitNode` asked `encodingKindAtDestination` which KIND to write and
then hardcoded `- ` and a bullet `listStyle`. `encodingKindAtDestination` answers with a
kind because that is all the reparenting callers need; here the answer came from a specific
donor among the existing children, and that donor also knows the marker.

Rather than widen `encodingKindAtDestination` to return a style — it is shared with
`indent`, `outdent` and `insertSubtrees`, which re-encode EXISTING nodes and have their own
style handling in `reencodeForDestination` — the split site looks the donor up itself:
the first `list-item` among `node.children`, which is exactly the node the kind came from.

`emptyItemPrefix` already encoded this rule for the SIBLING path, bundled with the donor's
own indentation. It is split into `itemMarkerText` / `itemTaskMarker` / `itemStyleFrom` so
the child path can take the marker while computing indentation from `destinationIndent`,
and so both paths share one rule instead of each holding half of it. The task marker is
deliberately excluded from the continuation-line pad: `[ ]` is content, so a continuation
of `- [ ] text` aligns after `- `.

Carrying the unchecked task marker into the child path is a behavior change beyond the
reported bullet, and it is the same argument design D5 of `enter-and-shift-enter-grammar`
made for siblings: a key that writes `- [ ] ` beside an item and `- ` above it is the
shape-dependence the empty-position rule exists to remove.

## Risks / Trade-offs

- **The `indent` and `unwrapListItem` cases are inferred from the code, not yet measured.**
  → D4 makes measurement the first task. Whatever it finds is what ships; the delta spec's
  scenarios are adjusted to match rather than the measurement to the spec.
- **Reading a call site is how the `mergeNodes` misclassification happened**, and D4's
  measurement rule was applied only to the sites this design expected to be defective, not
  to the ones it argued were safe. → Every call site classified as safe now carries a
  measured example or a stated structural reason at the call site itself, and the merge
  branches have regression coverage. The general lesson is the narrower one: an argument
  that a run's head survives must be about the RUN, not about indices.
- **Two functions with near-identical names invite the wrong one at a new call site.** →
  The fallback in D2 makes the wrong choice degrade to today's behavior, and the doc comment
  on each names the shape it is for, with the reason the other exists.
- **`closure.test.ts`'s property suite could surface a shape neither example covers**, since
  it generates removals over generated trees. → That is the intent: it runs against the
  delete operations already, so it is the change's broadest check, and any failure it
  produces is a real counterexample to the rule rather than noise.
- **A run that legitimately starts high now stays high after a deletion**, where a user might
  have expected renumbering from 1. → That is the project's existing choice for every other
  operation (`5. 6. 7.` keeps starting at 5); this change makes removal agree with it rather
  than introduce a second policy. Revisiting the policy itself is out of scope.
