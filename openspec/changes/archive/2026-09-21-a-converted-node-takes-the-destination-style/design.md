## Context

See proposal.md — Why. The mechanics that shape the approach:

- `reencodeBlocksForDestination` (`src/ops.ts`) is the one re-encode step both insert paths run.
  It already reads its surroundings twice — `encodingKindAtDestination` for the kind,
  `destinationHeadingLevel` for the level — and hands the result to `reencodeIntoListScope`.
- `reencodeIntoListScope` recurses over the payload, converting each node and computing each
  child's indent from its parent's marker width.
- `itemStyleFrom(donor)` (`src/ops.ts`) already takes a style from a single known donor; it is
  what `splitNode` uses, where the donor is the item being split. It does no scanning, because a
  split has nowhere to scan.

## Goals / Non-Goals

**Goals.** A converted node stops dividing the list it joins. One rule, read where the two rules
it belongs beside are read.

**Non-Goals.** An arriving list item's own marker. The task marker. Any change to which nodes
convert, or to the renumbering that follows.

## Decisions

### D1. The rule goes in `rules.ts`, beside the two it mirrors

`src/rules.ts` is where the provisional mapping rules are isolated "so revising them (or making
them configurable) is a local change". The kind and the level are already there, read from the
same sibling scan. A third regime read anywhere else would be the drift those two were put
together to prevent.

`itemStyleFrom` is not extended to cover it: it answers "what style sits beside THIS donor",
which a split knows and an insertion has to find. Both now share `DEFAULT_LIST_STYLE`, so the
`-` fallback is written once.

### D2. An ordered donor hands over its number, not just its type

The renumbering pass owns what each member of a run finally reads, so the arrival's number is
provisional either way. It still has to be the donor's rather than a fixed `1.`, because
`reencodeIntoListScope` computes each child's indent from its parent's MARKER WIDTH before any
renumbering runs. A `1.` arriving into a run of `10.` would lay its children out a column short,
and the re-parse would hand them back as siblings.

### D3. The style reaches the payload's top level only

A payload's nested rows have no destination run to sit level with — the list they belong to is
one the payload brought. So `reencodeIntoListScope` passes the style at depth 0 and drops it in
the recursion, where the default answers.

### D4. An arriving list item is not a converted node

`reencodeIntoListScope` already leaves an arriving item's marker alone, on the stated ground that
"an ordered payload does not silently become bullets". The same reasoning holds in the other
direction: the marker is the author's, and a paste that rewrote it would be exactly the silent
change this rule exists to prevent. So a pasted `- x` still divides a `*` run.

That is a boundary worth stating rather than a gap: what divides a run and what joins it now
turns on whether the arrival brought a marker of its own.

### D5. Every conversion site takes it, not the insert path alone

The requirement this change modifies is about a REPARENTED node, and a paste is not the only way
to reparent one. An indent's arrival, an outdent's arrival and the siblings an outdent adopts all
convert a paragraph into a list item, and all three wrote `-` — measured, indenting a paragraph
under a parent whose children read `*` produced `- plain` and ended the run, exactly as the paste
path did.

None of those sites is adding a conversion: `encodingKindAtDestination` already made each of
these nodes a list item at its destination. Only the marker was written without looking, so
widening makes the existing conversion write the right one rather than converting anything new.

Each site already built the sibling slices the kind is read from. Lifting each into a named
context and handing it to both rules is what keeps them from drifting onto different
surroundings — the failure mode the two rules were put in one file to avoid.

## Risks / Trade-offs

**It changes what `a-split-run-keeps-its-own-numbers` reaches.** A converted heading pasted into
an ordered run used to divide it, and that layer's rule kept both fragments' numbers. It now
joins the run, so the items below shift by one — which is the renumbering requirement working,
not the defect that layer fixed. The plain-bullet gesture that layer was written for is
untouched, and its own test for it is unchanged.

**It narrows that layer's property.** `renumbering-contract.test.ts`'s paste property asserted
that a payload carrying no ordered item rewrites no ordered marker. A heading payload carries
none and now BECOMES one, so it no longer belongs in that property's payload set; it is replaced
by `* y`, which keeps the property's reach (accepted ~2600, with-marker-below ~1750, unchanged)
and its premise true. The converted direction is carried by example instead, because asserting it
as a property would mean computing the expected renumbering — a calculation, not an invariant.

**An indented paragraph now joins an ordered run.** Indenting a paragraph under a parent whose
children read `8.` makes it `9.` rather than a bullet, which renumbers nothing but does change
what the row is. It is the same answer the paste path gives, and the alternative is the rule
holding for one gesture and not its neighbours.

**A converted node now renumbers a run it joins.** Pasting a heading into `8.` / `9.` / `10.`
moves `10. ten` to `11. ten`, a line the paste did not otherwise touch. This is the one
documented exception to "edits touch only the lines the operation semantically requires", and it
is the same push any inserted ordered item makes.
