## Context

See proposal.md — Why. The mechanics that shape the approach:

- `moveSurgery` (src/ops.ts) swaps two entries in a sibling array and swaps their positional
  trailing gaps. It is the only operation that relocates a node without re-encoding it: indent
  and outdent both run the moved node through `reencodeForDestination`, which recomputes its
  kind from the destination context. A reorder deliberately does not, and "node types and
  encodings are unchanged by reordering" is stated in the requirement.
- `listAttachesTo` (src/rules.ts) is consulted by `parse` only when the list stack is empty —
  among the children of the root or of a heading. Among a list item's own children the enclosing
  item owns the list stack, so a paragraph there never adopts a following list. The rule's reach
  is therefore section level, and only section level.
- `applyGroups` composes one surgery per root against the previous step's tree and calls
  `finalize` ONCE at the end, so a group's intermediate trees are never encoded.
- Rejection reasons are user-facing: `src/plugin/messages.ts` maps every reason to a cue shown
  in a `Notice`, and the map is exhaustive over the union, so a new reason is a compile error
  until it has a message.

## Goals / Non-Goals

**Goals:**

- Every accepted reorder's emitted markdown re-parses to the tree its own surgery built. Stating
  it as "the returned tree re-parses to itself" would state operation closure instead, which
  `finalize` satisfies for free by returning a parse output — the blind spot this whole class of
  defect lives in.
- The defect is closed for both directions and for the bystander, not only for the subject that
  a depth measurement happens to watch.
- The check is cheap to delete. It exists to hold a line that a mapping-rule decision may move,
  and it should read that way to whoever finds it next.

**Non-Goals:**

- Deciding whether a list following a paragraph should be that paragraph's child. That is the
  question underneath this defect and it is deliberately left open —
  `docs/research/17-list-paragraph-mapping.md`.
- Making the refused gestures work. Under today's mapping they have no encoding; giving them one
  means either rewriting a node's kind or changing the mapping, and both are out of scope.
- The blank-line boundary (proposal.md — Impact). Different requirement, different owner.

## Decisions

### D1. Refuse, rather than re-encode the landing node

The unifying principle offers two branches — the minimal encoding of the new tree, or a
rejection — and a reorder can only take the second. Taking the first means re-encoding the list
item as a paragraph so the arrangement becomes sayable, which fails on three counts. It
contradicts this requirement's own "node types and encodings are unchanged by reordering". It is
not reversible: moving the node back does not restore the marker, because the repair only ever
converts one way. And in the move-up and atom shapes the node that must change is the one the
caller did not select — a gesture on `P` silently unbullets `- A`.

Rejecting keeps every node's bytes intact and costs a gesture in a narrow shape. Measured, that
shape is 37 of 1285 accepted move downs and 24 of 1239 accepted move ups on the generator, all
of which currently "succeed" by returning the wrong tree.

### D2. The check runs per step, because the group form is DEFINED as the composition

The predicate asks one question of the sibling arrangement a swap would produce: would either
relocated root end up as a section-level list item whose new preceding sibling is a paragraph?
It is decided from the operand before any surgery runs, the shape `rejectAcrossScopes` already
uses, so a refusal costs nothing and does not depend on the result.

It therefore sits inside `moveSurgery`, and a group reorder inherits it once per step rather
than once for the operand. That is not a convenience: "Group forms of indent, outdent and
reordering" states that the group form's output tree IS the tree produced by applying the
single-node form to each covered root in turn. A step the single-node form refuses is a
composition that does not exist, so the group must refuse too — anything else makes the group
form's own definition false.

Measured against the actual defect on the labelled generator at seed 42, 3000 runs: the
predicate fires 37 times where move down produces 37 depth violations, and 24 times where move
up produces 24, with zero false positives and zero false negatives across roughly 2500 accepted
reorders. It is exact on that generator, not merely sufficient.

Alternative considered and rejected: check only the arrangement that will actually be encoded —
once per single-node reorder, and once for a group after `applyGroups` has composed every step.
It is appealing because `applyGroups` never encodes its intermediate trees, so it would refuse
strictly less: a run of `[atom, list item]` moving down past a paragraph has an inexpressible
intermediate and an expressible final arrangement, and this variant would accept it. It breaks
three things at once. The composition contract above, since the group would then accept where
applying the single-node form in turn rejects. The "Group closure" scenario, which requires
`result.tree` to equal the tree the sequential composition produces. And the equality property in
`tests/group-composition.test.ts`, whose oracle composes the PUBLIC operations
(`tests/group-oracle.ts` `composeSequential`) and asserts that a rejection on either side is a
rejection on both with the same typed reason. Aligning all three is a redefinition of group
semantics on the raw surgery algebra — a far larger change than this defect warrants, and one
that would have to be undone along with everything else here.

### D2a. The group form's own scenario becomes a rejection

`Group forms of indent, outdent and reordering` states a scenario whose result is an absorption:
the group move up of `[L1, L2]` over `- L0` emits `L1` / `L2` / `- L0`, which re-parses with
`- L0` as `L2`'s child. That is the same bystander reparenting the single-node move up performs
on the same shape, and the delta modifies it to a rejection.

The requirement's surrounding prose is kept. The order rule is still the governing rule and is
still stated first; what changes is that the shape where it disagreed with the composition is now
refused before either rule applies. Its other scenarios — a run moving up or down past its own
neighbour — demonstrate order preservation on arrangements that remain expressible.

Consequence worth naming: every measured disagreement between the order rule and the composition
had this shape (49 of 49, recorded in the requirement). With the shape refused, the two agree on
everything a reorder accepts, and `compositionKeptRootOrder` in `tests/group-oracle.ts` becomes a
precondition that filters nothing. That is a simplification to notice later, not a change to make
here.

### D3. Both relocated roots are checked

A swap relocates two subtrees. The subject lands at the far slot; the displaced sibling lands at
the slot the subject left, whose own preceding sibling is one further back. Either can come to
rest after a paragraph. Checking only the subject leaves move up entirely uncovered, which is
precisely how this defect stayed invisible to a subject-only depth property.

### D4. Scoped to section level

`listAttachesTo` is only consulted among the children of the root or of a heading, so that is
where the check applies. Measured: inside a list item's children, moving a list item down past a
sibling paragraph is accepted today and leaves both depths intact, because the enclosing item
still owns the list stack. Widening the check there would refuse a gesture that works.

### D5. A rejection reason of its own

`reorder-not-expressible`, following `merge-not-expressible` and `insertion-not-expressible`.
Reusing `not-expressible-under-target` would be wrong twice: a reorder has no target it is
placing the node under, and the shared cue ("Markdown can't express that nesting here.") does
not describe what happened. The new cue names the outcome the user would otherwise have seen.

### D6. The property that guards it watches every node, not the subject

`tests/depth-contract.test.ts` measures the subject by design, and the subject is exactly what
move up does not disturb. The reorder guard therefore compares the depth of EVERY label before
and after, which is the property that catches the bystander. Move down's deferred row is added
alongside it, since the subject-level contract now holds for it too.

Keeping both is deliberate: the row states the operation's own promise in the table where the
other operations state theirs, and the whole-document property states the stronger fact that a
permutation moves nothing between levels.

### D7. The check is written to be deleted

The comment at the rejection names the mapping question and the document that holds it, and says
plainly that two of the four candidate readings make this branch unreachable. Under those
readings a flush list after a paragraph is a sibling, the tree the swap builds is ordinary, and
there is nothing to refuse — measured on the spike in doc 17, where reorder absorption drops to
zero without any check and acceptance rises. Whoever revisits the mapping should be able to
delete this in one commit and watch the guard property stay green.

## Risks / Trade-offs

- **The group form loses a documented behaviour, not only a defective one.** The scenario D2a
  modifies exists to demonstrate the order rule, and after this change no expressible shape
  demonstrates it — because every disagreement between the order rule and the composition was an
  absorption. → Accepted: the rule still governs and its prose still explains why it is stated
  first, and the alternative is keeping a scenario that mandates reparenting a node the cover
  never named. Recorded in D2a so the loss is deliberate rather than discovered.
- **A group reorder is refused when only an intermediate step is inexpressible**, even though the
  arrangement it would have emitted is fine. The reachable shape is a run of `[atom, list item]`
  moving down past a paragraph. Not reachable on the current generator, which produces no atoms.
  → Accepted, and it is the composition contract's own consequence rather than a shortcut (D2):
  the group form is defined as applying the single-node form to each root in turn, and that
  sequence genuinely cannot be performed. Group rejection is already specified as atomic, and
  refusing is the conservative direction. Task 3.4 pins the shape so the behaviour is a decision
  on record rather than something rediscovered as a bug.
- **The refused gestures are ones users will attempt.** A list followed by a paragraph is common
  — 45 of 149 list items in the corpus and test vault are paragraph-owned. → The cue names the
  reason, and the gesture is refused rather than silently corrupting the tree, which is what it
  does today. If the frequency proves unacceptable in real use, that is evidence for the mapping
  change, and doc 17 is where it belongs.
- **The check outlives its reason and becomes folklore.** → D7's comment, this design, and the
  Q34 entry all name the same document; the guard property is written so that removing the check
  fails it loudly under today's mapping and passes trivially under a changed one.

## Migration Plan

None — no data, no persisted state, no API surface. The removal path is D7: delete the predicate
and its call sites, delete the rejection reason and its message, and keep the guard property,
which becomes a statement about a permutation rather than about a refusal.

## Open Questions

- Whether a list following a paragraph should be that paragraph's child at all. Deliberately not
  answered here; the exploration, the four candidate readings, the measurements and the external
  research are in `docs/research/17-list-paragraph-mapping.md`, registered as Q34. It cannot
  change this change's specs or tasks — it can only make them unnecessary.
