## Context

`node-edit-enforcement` promises that deleting across boundaries removes whole subtrees "with
their trailing gap lines". Measured, that promise does not reach the most ordinary case: select
one node, delete it, and its blank line stays.

The mechanism is traceable. `collectChangedLineSpans` computes a span's last line as
`lineAt(max(fromA, toA - 1))`. For a deletion running from `0:0` to `1:0` — one node's content
plus the newline that ends it — `toA - 1` is still on line 0, so the span reads as lines 0–0.
`spanCrossesBoundary` sees a single node, classification returns `within-node-edit`, and the
verdict layer is never consulted.

A second finding from the same probe: `collectEditFact` returns `undefined` for any transaction
with more than one change range, so multi-range deletions pass unconditionally. Deleting two
exact covers leaves two orphan blank lines.

## Goals / Non-Goals

**Goals:**

- Deleting an exactly-selected node takes its owned trailing gap.
- The same holds for a multi-range selection of several exact covers.
- Whatever layer is chosen, the fix is stated as a rule, not as a special case for one span
  shape.

**Non-Goals:**

- Redefining gap ownership.
- Changing escalation geometry beyond D1's conclusion.
- Deletion shapes that are not exact covers — those already have verdicts and are unaffected.

## Decisions

### D1. Which layer owns it — decide with a measurement, not a preference

Two candidate fixes, with materially different blast radii. This decision is deliberately left
to the implementation's first task rather than settled here, because the evidence needed is
cheap to gather and not yet in hand.

**Option A — classification.** Treat a change span that exactly covers one or more whole
subtrees as boundary-crossing, so it reaches the verdict layer and the existing structural
deletion runs. Contained to `classify.ts` plus the span derivation; no geometry moves; nothing
that currently gets a verdict changes. Risk: "exactly covers a subtree" becomes a second place
that computes cover geometry, the duplication hazard recorded twice in docs/research/04 (Q18,
Q19) — mitigated by calling `escalate.ts`'s exported computation rather than re-deriving.

**Option B — cover geometry.** Make an escalated cover end past its last node's owned gap, so
the deletion range naturally spans a boundary. Conceptually cleaner: the cover then really is
"the node and its gap", matching what `escalate-include-owned-gap` says it already is. Risk:
it moves every escalated selection's end by one position, rippling into
`node-selection-enforcement`'s committed scenarios, `tests/escalate.test.ts`, the selection
chrome's bounds, and `selection-as-subtree-set`'s geometry.

*What is already known, from the code rather than a measurement:* `subtreeCoverEnd`
([src/escalate.ts:106](../../../src/escalate.ts)) returns `{line: <last gap line>, ch: 0}` when
the node has a trailing gap, and the end of the last content line when it has none. Both leave
the final newline outside the range — which IS the orphan-blank-line mechanism. The offsets are
not the unknown.

*What actually needs measuring, therefore:* whether Option B collides with three things it
would have to move past.

1. The deliberate `ch: 0` convention. The comment at `subtreeCoverEnd` explains it: gap lines
   are semantically blank even when they hold incidental whitespace, so the cover's end does not
   depend on that whitespace. Ending at the NEXT line's start instead would reintroduce exactly
   the dependence the convention avoids — or would not, if the next line's start is
   whitespace-independent by construction. Determine which.
2. `coveredSubtreeRoots`'s match, which is `posEqual(lo, cover.start) && !posBefore(hi,
   cover.end)`. Moving `cover.end` changes what counts as an exact cover, and the selection
   chrome keys off it.
3. The document's last node, where there is no next line to point at.

*A criterion the layer choice must satisfy, not discover later:* Option B makes consecutive
covers TOUCH — one cover ending exactly where the next begins. Measured 2026-07-25: CodeMirror
keeps touching non-empty ranges separate and merges only overlapping ones, so
`node-selection-extension`'s "one range is a block selection, several are multi-cursor"
discriminator survives either option. Recording it here because that change depends on a
property this one can move, and the dependency is otherwise invisible from either side.

*Why this is sequenced before `selection-as-subtree-set`:* Option B changes the geometry that
change builds on. Deciding after would mean revising it.

### D2. Multi-range verdicts are in scope, and are the smaller half

`collectEditFact`'s single-range restriction was a deliberate conservative bias in
`outline-edit-enforcement` D1 ("this phase models the single-range shapes the spec scenarios
describe, not multi-cursor edits"). It is now load-bearing in the wrong direction: escalated
multi-range selections are reachable by ordinary gestures, and deleting one passes through raw.

The extension is narrow: compute a verdict per change range, require every range to be an exact
cover for the structural path, and fall back to today's pass for anything else. No new deletion
semantics — the same structural deletion, applied per range.

### D3. Do not widen beyond exact covers

Only deletions whose ranges exactly cover whole subtrees change behavior. Ordinary character
deletions, merges, and boundary-crossing partial deletions keep the verdicts they get today.
This keeps the change auditable: every behavior difference is attributable to a selection that
was already an exact cover.

## Risks / Trade-offs

- **Option B ripples into a change that is sequenced after this one** → that is exactly why this
  is sequenced first; the cost of deciding late is higher than the cost of deciding now.
- **Multi-range verdicts touch the enforcement funnel's hottest path** → the latency budget in
  `node-edit-enforcement` applies unchanged, and per-range verdicts are the same computation
  repeated, not a more expensive one.
- **A user who wanted the blank line kept** → gap ownership already says the line belongs to the
  deleted node; keeping it was never the stated behavior, and outline mode can be toggled off
  for literal whitespace editing.

## Migration Plan

In-editor behavior only. No file or data migration.

## Open Questions

- D1's layer choice, pending the geometry measurement in task 1.
- Whether the same span-derivation blind spot affects any other classification path — worth a
  look while the code is open, since the `toA - 1` idiom appears once but its consequences were
  not obvious.
