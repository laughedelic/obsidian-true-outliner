## Context

See proposal.md — Why. The mechanics that shape the approach:

- `renumberRuns(nodes, startOf)` (src/ops.ts) walks the maximal runs of consecutive ordered
  items in one sibling list and renumbers each from `startOf(run)`. It also carries a marker's
  WIDTH change into the item's subtree, which is the part every call site depends on and which
  no decision here touches.
- Two `startOf` policies exist. `renumberOrdered` passes `lowestNumber` — the minimum number
  present in the run afterwards. `renumberOrderedAfterRemoval(before, after)` builds a
  `nodeId → run start` map over the BEFORE list and reads the start from the run's first member
  that appears in it, falling back to `lowestNumber` when no member does.
- The two policies are chosen per call site by classifying the transformation's SHAPE, and the
  classification lives in the call site's own comment. The spec carries the same split.
- Node ids survive a surgery: `updateSiblings` rebuilds spines by spreading, and
  `reencodeForDestination` spreads the node it re-encodes. Ids do NOT survive `finalize`, which
  re-parses — but every renumbering runs on the surgery tree, before that.

## Goals / Non-Goals

**Goals:**

- One start-number policy for the whole file, correct by construction rather than by a shape
  argument made per call site.
- The five reproduced shapes fixed by the same edit that removes the classification, not by
  five local patches.
- A permanent property that would have caught this class without knowing which operation had
  it — the sibling of `depth-contract.test.ts`, on the axis a depth measurement cannot see.

**Non-Goals:**

- Normalizing a document whose runs were never consecutive. `1.` / `1.` / `2.` is what the
  source said, and an operation that touches that run still renumbers it consecutively; this
  change does not decide when to leave inconsistent numbering alone.
- Reducing renumbering's reach in general. It stays the one documented exception to the
  minimal-edit rule.
- The reorder-absorption rejection (#57). Different decision, different clause.

## Decisions

### D1. One policy, taken against the before-list, at every call site

`renumberOrderedAfterRemoval`'s rule is not a removal rule. "The start of the run that the first
member present beforehand belonged to" is a statement about where a run's identity lives, and it
answers every shape:

| shape | first member present beforehand | why the minimum-present reading fails |
| --- | --- | --- |
| removal | the earliest survivor | the member carrying the start may be gone |
| insertion of a foreign node | a destination member | the arrival's number was never this list's |
| permutation within a run | the run's own head | — it agrees |
| permutation joining two runs | the earlier run's head | the swallowed run's start is lower |
| wholly inserted run | none — falls back | nothing to recover; the payload's own start stands |

Rows three and five are where the two policies already agree, which is why nine call sites split
between them for as long as they did. The change is to stop choosing: pass the before-list
everywhere, delete `renumberOrdered`, and drop `AfterRemoval` from the surviving helper's name so
nothing invites the classification back.

Alternatives considered:

- **Patch the five sites that misbehave, keep both helpers.** Rejected. The bug is the
  classification, not the sites: every future call site would face the same shape question, and
  the question has now been answered wrongly twice — once in the code's comment ("a MERGE is a
  removal for this purpose, which this comment got wrong until all three of its branches were
  measured") and once in the spec's insertion branch. Removing the question is what makes the
  fix hold.
- **Reset an arriving node's number before it lands.** Rejected. It fixes the arrival shapes and
  not the join shape, since a permutation adds no node at all. It also has to pick a number
  before it knows what run it lands in, which is the destination's decision, not the traveller's.
- **Renumber against the ORIGINAL document rather than the immediate before-list.** Rejected as
  unnecessary and weaker. `updateSiblings` hands each call site exactly the list it is about to
  change; a two-step surgery like outdent's departure-then-arrival wants each step measured
  against the list as that step found it. The original document would make the arrival step
  read the destination as it was before a departure that may have touched it.

### D2. The fallback stays `lowestNumber`, and stays a fallback

A run with no member from the before-list has no start to recover — a pasted `3. x` / `4. y`
landing between bullets keeps `3.`. That is the existing behavior of the removal helper's
fallback, and it is deliberately the older policy so that a mis-routed call degrades to what the
code did before rather than to a third rule. The unification makes the fallback rarer, not
different.

### D3. The property asserts markers above the operand, on an already-consecutive source

The permanent property is the one Q33's table names: **a node above the operand keeps its own
first line.** Two qualifications make it assertable.

- **Restricted to sources whose runs are already consecutive.** The generator emits documents
  like `1. a` / `1. b` / `2. c`, where a legitimate renumbering rewrites `1. b` to `2. b` — a
  line above the operand, changed correctly. Measured, the filter keeps 2656 of 3000 generated
  documents and leaves 1057–1768 accepted cases per operation, of which 780–1482 actually have
  an ordered marker above the fence — so the restriction costs reach it did not have to spend.
  Filtering rather than normalizing keeps the test free of a second implementation of the rule
  it is checking.
- **"Above" is measured from the topmost node the operation RELOCATES**, which for a reorder is
  the sibling it swaps with, not the subject. A reorder legitimately rewrites the marker of the
  node it swaps past. This is the same lesson as the reorder-absorption measurement: a property
  that watches only the subject scores zero on defects that live on the other relocated node.

The property covers indent, outdent, move up and move down. `insertSubtrees` is not driven by
the labelled generator — it takes parsed markdown rather than a node id — so its shape is
covered by example, alongside the four other reproductions.

Alternatives considered:

- **Assert run starts directly** — for every run in the result, its start equals the start of
  the run its earliest before-present member belonged to. Rejected: that is the implementation
  restated, and it would pass against any implementation that makes the same mistake
  consistently.
- **Extend `depth-contract.test.ts`.** Rejected: a renumbering defect changes no node's depth,
  and the depth suite's whole shape — subject label, delta table, coverage floors — is about
  where a node lands. This property is about what an operation leaves alone, which is a
  different assertion with a different fence.

### D4. No spec branch survives, and the joined-run clause becomes a consequence

The requirement currently states the joined-run outcome twice: once as the general principle
under REMOVAL and once again as a merge-specific clause. Under the single rule the merge shapes
follow from it, so the merge paragraph stays as worked examples of the rule rather than as its
own case analysis. The scenarios it earned — all three merge scenarios, the three deletion ones,
the indent-departure and unwrap ones — are unchanged and still pass, which is the evidence that
the collapse loses nothing.

## Risks / Trade-offs

- **A call site could pass the wrong before-list** — the list it produced rather than the list it
  found — which would silently restore the old behavior at that site. → The five behavioral
  shapes each get an example test naming the expected numbers, and the property covers the four
  generator-driven operations. A wrong before-list at any of them fails both.
- **The two-step surgeries (indent, outdent) call `updateSiblings` twice, and the second call's
  before-list is the tree after the first.** For both operations the destination is a different
  sibling list than the departure, so the first step cannot have changed it — but that is an
  invariant of today's algebra, not a guarantee. → D1's alternative (renumbering against the
  original document) is the escape hatch if a future operation departs and arrives in the SAME
  list; noted here so it is not rediscovered.
- **The fallback hides a mis-routed call.** A site that passes an unrelated before-list gets
  `lowestNumber` for every run and looks like the old code. → Accepted, deliberately: it is the
  behavior the file had, and the alternative (throwing) turns a numbering slip into a lost edit.
- **A source with non-consecutive runs still gets normalized on any touching operation**, and the
  property is silent about it by construction. → Out of scope by Non-Goals, and unchanged by this
  change: it is the behavior every renumbering has always had.

## Open Questions

None.
