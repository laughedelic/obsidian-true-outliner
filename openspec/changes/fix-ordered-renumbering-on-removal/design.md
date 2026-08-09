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
  delegates to), `unwrapListItem`, and `indent`'s departure side (the node leaves its old
  level to become a child of its previous sibling).
- **Permutation** — `move`'s swap.
- **Insertion or replacement** — `splitNode`, `insertSubtrees`, `outdent`'s arrival side,
  `mergeNodes`, `indent`'s arrival side.

Only the first shape can lose a run's head. `mergeNodes` removes a node too, but `second`
is reached by walking forward from `first`, so at its own level it always has a predecessor;
`outdent` truncates the child list at the outdented node's index, which keeps index 0.

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

## Risks / Trade-offs

- **The `indent` and `unwrapListItem` cases are inferred from the code, not yet measured.**
  → D4 makes measurement the first task. Whatever it finds is what ships; the delta spec's
  scenarios are adjusted to match rather than the measurement to the spec.
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
