## MODIFIED Requirements

### Requirement: Context-determined encoding on reparent (provisional rule)
A reparented non-heading node's markdown encoding SHALL be recomputed as a pure function of
its new surroundings: it takes the block type of its nearest preceding sibling under the new
parent; if none, the following sibling; if it has no siblings, it encodes as a paragraph
under a heading or the root, and as a list item under any other parent. This rule SHALL be
implemented behind an isolated strategy function.

A HEADING node reaching a new destination — which only an insertion can do, since the
level-shifting operations move a heading by level rather than by reparenting — SHALL take its
encoding from the same function, with one arm per kind of destination:

- In a HEADING-BEARING scope (the root, or a heading's children) it SHALL remain a heading, and
  re-level to the destination's own depth. That level SHALL be taken from the destination's
  heading SIBLINGS — nearest preceding, else following — and only from the parent (one past its
  level, or 1 at root) where the scope has no sibling of either kind. Reading the parent alone
  is wrong wherever a scope SKIPS a level: the payload lands shallower than the siblings it is
  placed among and opens a section that swallows them.

  Which regime the payload lands in SHALL be read from the NEAREST sibling that expresses one,
  scanning preceding siblings backwards and then following siblings forwards. A heading donates
  its level; a LIST ITEM ends the scan and the payload converts, as it does in a list scope. A
  heading-bearing scope whose rows at the insertion point are list items is a LIST at that
  point, whatever its parent is, and a payload landing between two of them belongs to their run.
  Reading the scope where the kind rule reads the neighbours put a heading into the middle of a
  list wherever a list sits under a heading — the commonest shape a note has — splitting the run
  and, where the payload kept the heading regime, swallowing the sibling below it into a section
  it was never copied with.

  Paragraphs and atoms express neither regime and SHALL be transparent to this scan: they
  neither donate a level nor end it.
- In a LIST scope it SHALL become a list item, carrying its own `#` run verbatim into that
  item's text.

A node CONVERTED into a list item — a heading in a list scope, or a paragraph taking a list
item's encoding — SHALL take the LIST STYLE of its destination as well as its kind, read the
same way the kind is: the nearest preceding list-item sibling's style, else the nearest
following one's, else a `-` bullet. Only list items donate, as only paragraphs and list items
donate a kind.

This SHALL hold wherever the conversion happens, not on insertion alone: an indent's arrival,
an outdent's arrival, and the siblings an outdent adopts are converted by the same rule that
gives them their kind, and take their marker from the same reading.

Writing a fixed `-` instead ENDS the run it lands in. CommonMark begins a new list wherever the
bullet character changes, so a `-` arriving in a `*` run makes three lists of one — measured, a
`* a` / `* b` / `* c` scope taking a converted heading went from 2 rendered lists to 4, and now
stays at 2. An ordered run is divided the same way, and the ordinal sequence the reader is
following stops and resumes around the arrival.

An ordered donor SHALL hand over its NUMBER along with its delimiter. What each member of a run
finally reads is the renumbering requirement's to decide, and an arrival joining a run pushes
the members below it; the donated number matters because the marker's WIDTH sets the content
column the arrival's own children are written at.

That style SHALL reach the payload's TOP level only. Rows below it belong to lists the payload
brought with it, which have no destination run to sit level with, and take the default. A node
that ARRIVES as a list item is not a converted node: it keeps the marker its author wrote, as
it always did.

Where the re-levelling would need a level markdown does not have — judged on the payload's
DEEPEST heading, not its root — the insertion SHALL be rejected with `at-h6-bound`, the reason
and the reading `indent` already uses for the same shape. Neither alternative keeps the
payload's own tree: clamping puts two of its levels onto one, and converting to content at
section level hands the run to the attachment rule.

#### Scenario: Indent then outdent restores a paragraph
- **WHEN** a top-level paragraph is indented under a paragraph and then outdented back
- **THEN** it is re-encoded as a paragraph (nearest sibling at the destination is a
  paragraph) and the document is byte-identical to the original

#### Scenario: Nested-list documents never flatten
- **WHEN** outdent is applied to any item in a document consisting entirely of nested list
  items
- **THEN** the item remains a list item at its new depth (all destination siblings are list
  items)

#### Scenario: A heading inserted into a list scope becomes a list item carrying its rank
- **WHEN** a heading-rooted subtree is inserted below a list item
- **THEN** the heading encodes as a list item whose text begins with its original `#` run,
  and outdenting that item back to a heading scope restores a heading of the original rank

#### Scenario: A section pasted into a list under a heading joins the list
- **WHEN** a heading-rooted subtree is inserted after the `1. a` of `1. a` / `2. b`, themselves
  the children of an `h2`
- **THEN** it becomes `2.` and `2. b` becomes `3.` — the run is joined, not split

#### Scenario: A heading sibling still donates its level
- **WHEN** a heading-rooted subtree is inserted among a scope's heading siblings
- **THEN** it remains a heading at the sibling's level, unchanged by the rule above

#### Scenario: A paragraph sibling is transparent to the regime scan
- **WHEN** a heading-rooted subtree is inserted between two paragraphs in a heading's children
- **THEN** it remains a heading, since a paragraph expresses neither regime

#### Scenario: A converted heading joins the bullet run it lands in
- **WHEN** a heading is inserted into a scope whose items are written with `*`
- **THEN** the item it becomes is written with `*`, and the scope still renders as ONE list

#### Scenario: A converted heading joins an ordered run
- **WHEN** a heading is inserted after the `9. nine` of `8. eight` / `9. nine` / `10. ten`
- **THEN** it becomes `10.`, `10. ten` becomes `11.` because a member was inserted above it,
  and the heading's own children sit at the content column its marker's width gives it

#### Scenario: An ordered donor's delimiter is taken with its type
- **WHEN** a heading is inserted into a run written `1)` / `2)`
- **THEN** the item it becomes is written `2)`, not `2.`

#### Scenario: The payload's own nested rows take the default
- **WHEN** a heading with a heading child is inserted into an ordered run
- **THEN** the payload's root joins the run and its child is written with the default `-`

#### Scenario: An indented paragraph joins the run it lands in
- **WHEN** a top-level paragraph is indented under a parent whose children are written `*`
- **THEN** the item it becomes is written `*`

#### Scenario: An outdented paragraph joins the run it lands among
- **WHEN** a paragraph that is a list item's only child is outdented beside it, in a scope
  written `8.`
- **THEN** the item it becomes is written `9.`, taking the next number in that run

#### Scenario: An arriving list item keeps its own marker
- **WHEN** a list item written `-` is inserted into a scope whose items are written `*`
- **THEN** it is still written `-`, since it carries a marker its author chose

#### Scenario: A destination with no list to copy leaves the default
- **WHEN** a heading is inserted into a list scope that holds no list item
- **THEN** the item it becomes is written with `-`

#### Scenario: A heading inserted into a heading scope re-levels
- **WHEN** a heading-rooted subtree is inserted among a heading's children
- **THEN** it remains a heading, at the level the destination's depth requires, with every
  heading in the payload shifted by the same delta

#### Scenario: A payload deeper than the destination has room for is refused
- **WHEN** a heading-rooted subtree whose own deepest heading would land past `h6` is inserted
  into a heading-bearing scope
- **THEN** the insertion is rejected with `at-h6-bound` and the document is unchanged — even
  where the payload's ROOT alone would have fitted
