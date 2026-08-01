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
- Otherwise: take the document-order run of nodes from `firstNode` to `lastNode`, CLOSE IT
  UNDER DESCENDANTS, and the covered roots are the members whose parent is not a member. The
  cover starts at the first root's subtree start and ends at the last root's subtree end.

**The closure is normative; it is not a restatement of "the ends' own subtrees."** An earlier
draft of this decision gave both forms and called them equivalent. They are not, and the
counterexample is reachable by an ordinary drag:

```
- P
  - c1
  - c2      ← drag starts mid-line
- S
  - t1      ← drag ends mid-line
  - t2
```

"From `c2`'s own subtree start to `t1`'s own subtree end" is contiguous text — and it contains
`S`'s entire line while excluding `t2`. That is `S` selected without its whole subtree: exactly
the downward-closure violation D1 exists to forbid, and exactly the shape that would leave `t2`
orphaned on deletion. The closure form gives roots `c2` and `S`, ending after `t2`, which is
correct.

Stated directly, the end bound is **the subtree end of the OUTERMOST ancestor-or-self of
`lastNode` whose own start line is at or after the span's start.** The start needs no such
qualification: every ancestor of `firstNode` begins above it, so none can fall inside the span.

*The wording trap this replaces, kept because it is still a trap:* "the outermost subtree that
fully contains the end", unqualified, reinstates the expansion this change removes — the
outermost subtree containing a middle child is its PARENT, whose end reaches past the parent's
later children. The at-or-after-the-span-start qualifier is what excludes that parent (it
begins above the span), and it is what the closure form encodes. An earlier draft rejected the
qualified form for "making the two ends asymmetric and silently swallowing later siblings at
the end." The asymmetry is real and inherent — preorder places ancestors before their
descendants, so only the end side can have an ancestor inside the span — and the swallowed
later siblings (`t2` above) are required, not incidental. The rejection was the error.

*The cheap check for any candidate wording:* does it hold when an ancestor's own line falls
strictly inside the span? Both the plain sibling case and the crossing-out-of-a-scope case pass
under either form, which is why the equivalence claim survived a first reading.

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

### D4. Geometry generalizes from sibling run to forest, and it now has four consumers

`siblingRunCover` (escalate.ts) and `siblingCoverIds` (enforce.ts) both assume the covered
nodes are children of one scope. Both become forest-aware: given a span, return the maximal
subtrees it contains. The forest computation SHALL live in ONE exported function that every
consumer uses — the same "one correct call site, one silently-stale duplicate" hazard recorded
twice in docs/research/04 (Q18's detection-gate split, Q19's re-encode split).

`coveredSubtreeRoots` is that function's read-only face, and since this change was first
drafted it acquired two consumers beyond the selection chrome. All four move together:

| consumer | what forest-awareness does to it |
| --- | --- |
| `plugin/decorations.ts` | mixed-depth covers decorate as a forest instead of falling back to character-level highlight (D4's open chrome question) |
| `enforce.ts` `coverIdsOf` → `siblingCoverIds` | returns GROUPS, one contiguous run per parent, instead of one flat run |
| `enforce.ts` `computeMultiRangeDeletionVerdict` | needs the same per-parent grouping: it pushed each range's roots as ONE group, which is rejected once a range's cover is a forest — a VETO of the whole deletion |
| `classify.ts` `isExactSubtreeCoverDeletion` | a GATE WIDENS: see below |

**Deletion needs no new machinery.** A forest's roots decompose into exactly one contiguous
sibling run per parent — an interval in document order cannot straddle a parent's children
non-contiguously — and that is precisely `deleteSubtreeGroups`' input shape
(`fix-orphan-gap-on-node-deletion` D2): several runs, possibly under different parents,
resolved against the pristine document and removed in ONE structural pass with ONE diff.
`siblingCoverIds` returning groups and `coverIdsOf` calling `deleteSubtreeGroups` instead of
`deleteSubtrees` is the whole change — but EVERY caller that hands roots to
`deleteSubtreeGroups` must group them, `computeMultiRangeDeletionVerdict` included. Missing one
is not a silent degradation: `resolveContiguousGroup` rejects a group whose members do not
share a parent, and the rejection surfaces as a veto — the user's deletion simply refused. `deleteSubtrees`' own single-run contiguity rule, and
`structural-operations`' requirement stating it, stay exactly as they are.

**The classification gate does NOT widen — measured, and not what this decision first
assumed.** `isExactSubtreeCoverDeletion` (`transaction-classification`: "A change exactly
covering whole subtrees is a boundary-crossing edit") asks `coveredSubtreeRoots` whether a
deletion whose raw line span reads as within-node is in fact an exact cover. Redefining the
cover looked like it must redefine what that gate admits, so this was filed as a widening to
enumerate rather than reason about.

The enumeration says otherwise. The gate is only consulted when NO span crosses a boundary by
line identity — when every line the change touched belongs to one node. A range shaped that way
cannot reach a multi-root cover's end, so the forest branch is unreachable from the gate, and
the single-node branch never enters `forestCoverOf` at all. Over generated documents, building
the deletion span for every single-subtree cover and every node-pair forest cover, 452 cases
reached the gate as the deciding test and every one of them was single-rooted.

What actually enforces a mixed-depth deletion is the ordinary line-identity test, which sees
two different nodes and returns `boundary-crossing-edit` before the gate is ever asked. The
gate remains what it was built for: the single-node cover whose trailing newline the span
convention is blind to.

*Recorded because the argument above is exactly the kind that stops being true when someone
changes the span convention*, so it is pinned as a property with a coverage counter rather than
left as prose. The counter matters more than the assertion here: a filter this narrow passes
just as happily when it excludes everything, and the first version of this property reached its
assertion once in 302 cases before being rewritten to enumerate real cover shapes.

### D5. What deliberately does not change

The gap-line trigger, the expand-only invariant, orientation preservation, uniform multi-range
escalation, preamble jurisdiction, and the classification scoping are all untouched. Each was
reviewed in its own real-vault pass and none of them depends on the common-ancestor
formulation — they operate on whatever cover the geometry produces.

Two things added to `node-selection-enforcement` after this change was drafted are likewise
carried forward verbatim when its escalation requirement is replaced, rather than being
re-derived:

- **The keymap-jurisdiction paragraph.** The requirement governs ranges the filter RECEIVES —
  pointer drags, stale or programmatically restored ranges — and no longer governs
  `Shift+ArrowUp`/`Shift+ArrowDown`, which `node-selection-extension` intercepts. Its
  "A raw crossing range from any other source still escalates" scenario and its re-pointed
  **Covered by** note come with it. A REMOVED/ADDED pair that omitted them would silently
  revert a decision this change agrees with; the replacement is about the cover's shape, not
  about who dispatches ranges into the filter.
- **Cursor placement is not this layer's concern.** `content-space-caret` moved it out
  entirely. Nothing here moves an empty range.

## Risks / Trade-offs

- **A copy can now span depths whose payload looks odd as raw markdown** (an indented item
  followed by an unindented one) → D3's normalization is what makes the paste correct; the
  clipboard text itself is a faithful slice of the document either way, which is the
  isomorphism guarantee, not a defect.
- **Chrome for mixed-depth covers may look ragged** — the decoration anchors chrome one level
  beyond the covered root's own column, and a forest has several roots at several columns →
  needs a real look during the manual pass; `escalated-selection-decoration` already handles
  multi-range covers independently, so per-root chrome is the likely shape.
- **The old invariant is barely test-encoded, which is worse than being encoded wrongly.**
  `tests/escalate.test.ts` has no sibling-run property — only one unit test that pins the
  behavior directly (`multi-sibling scope resolution`) and a set of properties (expand-only,
  orientation, idempotence, ch-boundaries) that hold under either rule. So a broken forest
  computation would pass most of the suite → the downward-closure property is added first,
  not last, and it is exactly what would have caught the closure gap in D2's first draft.
- **Someone relied on the old behavior to select a whole section quickly** → the Mod-A ladder
  is the gesture for widening to an ancestor, and it is unchanged.
- **The downward-closure invariant is enforced by the transaction filter, and undo/redo bypass
  the filter entirely.** Found during `minimal-changesets-for-structural-ops`
  (docs/research/04 Q29 and its follow-on): `@codemirror/commands` dispatches history
  transactions with `filter: false`, and CM6's `resolveTransaction` honours that by skipping
  `filterTransaction` — verified against the installed package, not inferred. What undo/redo
  restore is the pre-operation selection MAPPED FORWARD through the operation's changes, and
  for an edit inside or adjacent to the covered span that is no longer a forest of whole
  subtrees. Observed in a real vault: redoing an indent of a block-selected paragraph restored
  a range covering only the content within the new list item.
  → This does not change any decision here — the geometry is unaffected, and D1 is still the
  right invariant. It bounds where the invariant is claimed to HOLD: "every selection the
  filter produced", not "every selection that can exist". Two consequences worth carrying into
  implementation. The property tests should say so, or they will eventually be read as
  promising more than the mechanism can deliver. And D4's exact-cover recognition
  (`coveredSubtreeRoots`) will correctly report "not a cover" for these, so the block chrome
  drops and the selection renders as an ordinary one — which is the observable symptom, and
  is arguably the honest rendering of a selection that genuinely is not a cover.
  Re-normalizing restored selections is possible but belongs to whoever owns the history-side
  gap. The CARET half of this same `filter: false` fact has since been closed by
  `caret-placement-policy` (archived 2026-07-30): rather than reach the restored transaction,
  it records a structural operation's caret into history exactly when mapping cannot reproduce
  it (`src/caret-policy.ts`; that capability's "A dispatched caret is recorded exactly when
  mapping cannot reproduce it"). Note the shape of that answer — it did NOT make the filter
  reach undo/redo; it made the correct value survive the trip. No equivalent exists for
  selections, and none is proposed here. The SELECTION half remains open, and
  `node-selection-extension` has the sharper stake in it: its stateless walk assumes its input
  is a cover, and a mapped-forward restored selection is not one.

## Migration Plan

In-editor behavior only. No file, data, or parse-model migration. Rollback is disabling the
plugin or toggling outline mode off, both of which restore stock selection byte-for-byte.

## Open Questions

- ~~Should a cover's end include its last root's owned trailing gap newline?~~ **Answered by
  `fix-orphan-gap-on-node-deletion` (archived 2026-07-26), which was sequenced first for exactly
  this reason.** Yes, in full: `subtreeCoverEnd` ends at the gap's LAST line at `ch: 0`, so gap
  ownership stays all-or-nothing and a whitespace-only gap line matches regardless of its
  incidental trailing whitespace. That change also chose CLASSIFICATION rather than geometry as
  the layer to fix (docs/research/04 Q22), which is why the gate in D4 exists at all. Every
  span rule here is written against this end convention; nothing in it is still provisional.
- Does mixed-depth chrome read clearly, or does it need per-root treatment? Manual pass.
- ~~Does the widened classification gate (D4) admit any deletion shape the verdict layer does
  not model?~~ **Answered during implementation: the gate does not widen at all.** See D4 —
  it is unreachable for multi-root covers, and mixed-depth deletions are classified by the
  ordinary line-identity test instead.
- A TYPE-OVER of a mixed-depth cover has no modeled answer for where the typed text lands:
  `deleteAndSplice` splices into the single gap a deletion left, and a forest leaves one gap per
  parent. Newly reachable because of this change. Implemented as a conservative `PASS` (the
  native replacement of a forest span re-parses to a valid tree — it is simply not structural),
  which matches the layer's "a wrong pass is editable text; a wrong rewrite is surprising
  relocation" bias. Whether it deserves a real rule is left to the manual pass: it needs a
  judgement about what users expect, not more measurement.
