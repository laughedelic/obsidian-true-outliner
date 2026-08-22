## Why

A reorder swaps two siblings in the tree and re-encodes nothing. When the swap places a
SECTION-LEVEL list item directly after a paragraph sibling, the emitted markdown says something
the surgery did not: the attachment rule (`listAttachesTo`) makes that item the paragraph's
child on the re-parse. The operation reports success, consumes an undo step, and returns a node
one level deeper than the tree it built.

The arrangement is not merely unencoded — it is unrepresentable, and known to be. The
mapping-core verdict in `docs/research/04-open-questions.md` records "list item as the sibling
directly after a paragraph" as unrepresentable, "the rule working as designed". Reordering is
the one relocation that never asked.

Measured on the labelled generator, seed 42, 3000 runs per operation:

| | accepted | subject's depth wrong | any node's depth wrong |
| --- | --- | --- | --- |
| move down | 1285 | 37 | 37 |
| move up | 1239 | **0** | **24** |

Move up violates the same contract at the same rate and reports zero against a subject-only
measurement, because the node it absorbs is the one the caller did not select. `- A` / blank /
`P`, move up on `P`, emits `P` / blank / `- A` and `- A` becomes `P`'s child. An atom moved down
between a paragraph and a list does the same. Any property that watches only the subject is
blind to two thirds of this defect.

## What Changes

- A reorder that would place a section-level list item directly after a paragraph sibling is
  REJECTED, with a rejection reason of its own. This is the unifying principle applied where it
  was skipped: the minimal encoding of the new tree, or a rejection — never markdown that means
  something else.
- The check covers BOTH nodes the swap relocates. A swap moves two subtrees, and either can land
  after a paragraph: the subject at its new slot, or the displaced sibling at the subject's old
  one. Watching only the subject leaves move up broken.
- `structural-operations`' "Sibling reordering" requirement gains the rejection and states the
  depth guarantee for EVERY node, not only the subject — the clause that makes the move-up case
  a violation rather than an unnoticed side effect.
- "A non-heading subject lands at a stated depth in the result" gains its deferred move-down
  row. That requirement is live now that `depth-contract-property-tests` is archived, so the
  sentence deferring move down "until the defect that violates it is fixed" is retired here.
- **BREAKING for one documented outcome**: "Group forms of indent, outdent and reordering"
  states a scenario whose result reparents a bystander — the group move up of `[L1, L2]` over
  `- L0` emits `L1` / `L2` / `- L0`, which re-parses with `- L0` as `L2`'s child. It is the same
  absorption the single-node move up performs on the same shape, and it becomes a rejection.
- `tests/depth-contract.test.ts` gains the move-down row and a reorder property that asserts no
  node's depth changes; `tests/group-ops.test.ts` gains the rejection where it currently asserts
  that absorption as an accepted outcome.
- The rejection carries a comment naming the mapping question that would make it unreachable,
  and the document that holds the exploration. It is expected to be deleted, not maintained.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structural-operations`, three requirements:
  - "Sibling reordering" gains the inexpressible-landing rejection and a depth guarantee that
    covers every node in the document rather than the subject alone. Both clauses are about the
    RESULT tree — what the caller receives once the encoding has re-parsed — which is where the
    disagreement between surgery and encoding becomes observable.
  - "A non-heading subject lands at a stated depth in the result" adds move down, which its own
    text defers until this defect is fixed.
  - "Group forms of indent, outdent and reordering" turns its `- L0` / `L1` / `L2` scenario into
    a rejection. The requirement's order rule and its prose are unchanged: what changes is that
    the one shape where the order rule and the sequential composition disagreed is refused
    before either applies.

## Impact

- `src/ops.ts` (`moveSurgery`), `src/result.ts` (one rejection reason). No change to `parse.ts`,
  `reencode.ts`, or any encoding path: nothing is rewritten, a case is refused.
- `tests/depth-contract.test.ts`, `tests/ops.test.ts`.
- Group reorders inherit the rejection through `applyGroups`, whose rejection is already atomic —
  a group containing one inexpressible landing refuses as a whole.
- Users lose a gesture in a narrow shape: the last bullet before a paragraph will not move down,
  and a paragraph above a list will not move up. Measured at 37 of 1285 and 24 of 1239 accepted
  reorders on the generator. Both currently "succeed" by corrupting the tree.
- The blank-line half of the original report is NOT in scope. A column-0 paragraph emitted
  directly after a list line is a lazy continuation for every renderer outside this plugin's
  dialect, and outdent introduces 100 such boundaries to the reorders' 35 (seed 42, 3000 runs).
  It is a fidelity requirement of its own, modelled on "An operation that creates a heading's
  first paragraph child separates them", and belongs with the operation that owns most of it.
  Measured incidentally: every one of the reorders' 35 coincides with a case this change now
  rejects, so the reorder paths stop producing them either way.
- `docs/research/17-list-paragraph-mapping.md` records the exploration this change deliberately
  does not settle — whether a list following a paragraph should be its child at all — with the
  four candidate readings, the measurements, and the external research. `Q34` in
  `04-open-questions.md` registers it as open. Under two of the four readings this change's
  rejection becomes unreachable code and is deleted.
