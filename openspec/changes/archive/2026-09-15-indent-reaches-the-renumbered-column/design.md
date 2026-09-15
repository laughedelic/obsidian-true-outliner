## Context

`indentSurgery` does three things in sequence: encode the subject for its destination, remove
it from the level it leaves (renumbering that level's ordered runs), and insert it under the
target. The first step reads the target's content column, and the second can move it — a
renumbering that crosses a digit boundary changes an item's marker width without moving the
line the marker sits on. The reproduction, the shrink and the age of the defect are in
[docs/research/indent-under-a-renumbered-marker.md](../../../docs/research/indent-under-a-renumbered-marker.md).

`renumberRuns` already repairs the subtree an item HAS when its marker changes width
(`shiftBelowMarker`), which is the same rule reached from the other side.

## Goals / Non-Goals

**Goals:**

- A node indented under a target the same operation renumbers reaches the column that target
  ends with, in both directions.
- What the property found stays found without freezing what it searches.

**Non-Goals:**

- Any change to the renumbering rule itself, or to which runs an operation renumbers.
- Outdent and the reorders, whose destinations are a parent's own indentation rather than its
  content column.

## Decisions

**Reorder the surgery rather than repair the result.** The departure renumbering runs first,
the target is read back out of its result, and the destination kind, insertion index and
indentation all derive from that. The alternative — leaving the order alone and widening any
child that falls short of its parent's column in `finalize` — would fix this case and hide
the next operation that writes one, since a column shortfall is exactly the symptom these
properties exist to report.

**The width evidence still comes from the document as found.** `destinationIndent`'s first
argument is only the document the indent unit is inferred from when the destination has no
sibling to copy from. It stays `doc`: the node being moved is still in `doc`, and a vault
whose one indented list item is that node would otherwise lose the evidence of its own unit
at the moment it is needed.

**Pin the counterexample, not the seed.** A property run from a fixed seed is 3000 fixed
documents and finds nothing it did not find the day the seed was chosen — this defect
survived every run of the property, from the commit that introduced it, until the seed that
drew it came up. What the random seed actually costs is the reproduction of a failure, so
`FC_SEED` puts a reported seed back instead, and the shapes a property draws are kept as
deterministic cases beside it.

**Both directions in one change.** The narrowing case fails no depth property: four columns
under a target that requires three is still the child the operation promised. It is the same
stale column read, and fixing only the direction a property can fail on would leave the other
to be rediscovered from an indentation complaint.
