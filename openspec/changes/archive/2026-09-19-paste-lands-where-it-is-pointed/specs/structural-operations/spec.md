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
  level, or 1 at root) where the scope has no heading sibling to copy. Reading the parent alone
  is wrong wherever a scope SKIPS a level: the payload lands shallower than the siblings it is
  placed among and opens a section that swallows them.
- In a LIST scope it SHALL become a list item, carrying its own `#` run verbatim into that
  item's text.

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

#### Scenario: A heading inserted into a heading scope re-levels
- **WHEN** a heading-rooted subtree is inserted among a heading's children
- **THEN** it remains a heading, at the level the destination's depth requires, with every
  heading in the payload shifted by the same delta

#### Scenario: A payload deeper than the destination has room for is refused
- **WHEN** a heading-rooted subtree whose own deepest heading would land past `h6` is inserted
  into a heading-bearing scope
- **THEN** the insertion is rejected with `at-h6-bound` and the document is unchanged — even
  where the payload's ROOT alone would have fitted

### Requirement: Subtree insertion at a boundary
An `insertSubtrees` operation SHALL splice a parsed sequence of whole subtrees into
the tree at a node boundary (before or after an anchor node), re-encoded at a depth
valid for the anchor's scope per the mapping algebra (heading levels bounded,
list/paragraph depth encodings converted as the existing reparenting rules require).
Sequences inexpressible at the target scope SHALL be rejected rather than inserted
in corrupted form. When no kind conversion is needed (the common case — the
sequence's own top-level kind already matches the destination context), each
subtree's original indent characters SHALL carry through verbatim beyond its own
top-level prefix, re-rooted at the destination depth — not expressed as a flat
numeric width delta, which can introduce a mismatched indent unit (e.g. spaces
inserted into an otherwise all-tab subtree) at any depth beyond the first level.

The inserted run SHALL carry the SEPARATION of the boundary it lands in on both sides of
itself. A gap is a boundary's separation and an insertion turns one boundary into two: the node
above the insertion point keeps its own gap, and the run's last block takes a copy of it. Where
that node is the document's LAST, its gap is the file's terminating newline rather than a
separation — the run SHALL take that over, and what separates the run from the node now above it
SHALL be that scope's own separation: the parent's trailing gap, or the boundary above it at the
root. A destination with no separation SHALL gain none, and a copied gap line SHALL be written as
an EMPTY line, a place line's own indentation saying nothing where it is copied to.

A blank line the PARSE requires is added independently, by the boundary normalization every
operation runs, and is not what this rule provides: a callout followed by a paragraph needs no
blank to parse, so the separation a reader sees there is this one.

#### Scenario: List items pasted under a deeper scope re-indent
- **WHEN** `insertSubtrees` places two top-level list-item subtrees after a list item
  nested two levels deep
- **THEN** the inserted items are re-encoded at the anchor's depth with their
  internal relative structure preserved

#### Scenario: A single node's nested children keep a consistent indent unit at any target depth
- **WHEN** `insertSubtrees` places ONE top-level list-item subtree — itself with a
  child two levels deep, all tab-indented — after an anchor at a depth different
  from where the subtree was originally encoded
- **THEN** every line in the inserted subtree, at every depth, uses the SAME indent
  character the anchor's own context uses — no mix of the original tabs with
  newly-added spaces at any level

#### Scenario: Insertion never splices mid-node
- **WHEN** `insertSubtrees` is invoked with any anchor
- **THEN** every existing node's own lines remain contiguous and byte-identical —
  inserted content only ever lands between nodes

#### Scenario: A run landing in a separated boundary is separated on both sides
- **WHEN** a run whose last block is a callout is inserted before a paragraph that a blank line
  separated from the node above it
- **THEN** a blank line stands between the run and that paragraph, as well as above the run,
  although the parse would read the two as separate nodes without one

#### Scenario: A tight destination gains no separation
- **WHEN** a run is inserted between two list items with no blank line between them
- **THEN** no blank line is added on either side of the run

#### Scenario: A run at the end of the document takes over the terminating newline
- **WHEN** a run is inserted after the document's last node
- **THEN** the file ends in exactly one newline, and the run is separated from the node above it
  by that scope's own separation

*(Amendment 2026-09-19, `paste-lands-where-it-is-pointed`: the run's own final gap was stripped
and the anchor's was moved onto it, which left the run flush against a neighbour wherever the
parse required no blank line — measured in `docs/research/paste-across-encoding-regimes`, M6.)*

## ADDED Requirements

### Requirement: A payload landing in the other encoding regime re-encodes as a whole subtree
When a subtree payload is inserted into a destination whose encoding regime differs from its
own, the payload SHALL be re-encoded as a UNIT: the destination's depth determines the regime,
and every node in the payload SHALL be re-encoded for that regime, preserving the payload's own
relative hierarchy exactly. No node SHALL retain an encoding that contradicts the regime its
new position places it in.

Into a LIST scope specifically, every structural node in the payload SHALL be encoded as a list
item. For a node WITH CHILDREN this is required by the mapping rather than chosen: below a list
item a paragraph has no expressible children at any indentation, so a payload whose interior
nodes stay paragraphs loses a level of its own hierarchy. A CHILDLESS node converts with them
because a list scope is one list — a leaf left as a paragraph is a different kind of row from
the siblings it was copied beside, over an accident of whether each happened to have children.

Into a HEADING-BEARING scope, only the payload's ROOTS take the destination's encoding; each
root's descendants keep their own, as the existing reparenting rules already provide. A setext
heading being re-levelled SHALL be rewritten as ATX.

The rule SHALL live at the single shared re-encoding call site, and the expressibility guard
SHALL live there with it, so no insertion path can reach the re-encode without it.

#### Scenario: A heading section pasted into a list keeps its whole hierarchy
- **WHEN** a heading with a paragraph child and a nested list beneath that paragraph is pasted
  inside a list scope
- **THEN** every node in the payload lands as a list item at its own relative depth, and the
  result re-parses to a tree with the same shape as the payload's

#### Scenario: Peers in the payload land as the same kind of row
- **WHEN** a payload whose siblings differ only in whether they have children is pasted inside
  a list scope
- **THEN** all of them land as list items, the childless ones included

#### Scenario: A list subtree pasted into a heading section is unaffected
- **WHEN** a list item with nested children is pasted into a heading's section after a paragraph
- **THEN** the root takes the destination's content encoding and its descendants keep theirs,
  the existing behavior

#### Scenario: A same-regime paste is unaffected
- **WHEN** a payload is pasted into a destination of the same encoding regime
- **THEN** the existing re-indentation behavior applies unchanged

#### Scenario: An atom AT THE PAYLOAD'S TOP LEVEL below a paragraph is refused
- **WHEN** a payload whose own roots include an atom is inserted into a paragraph's children
- **THEN** the insertion is rejected as inexpressible, on every insertion path, rather than
  re-encoded

#### Scenario: An atom DEEPER in the payload is not refused
- **WHEN** a payload rooted at a heading, with an atom among its descendants, is inserted into a
  paragraph's children
- **THEN** the insertion is accepted: the root converts to a list item and the atom is a legal
  child of it, so nothing here is inexpressible

### Requirement: A pasted heading takes the content that follows it into its section
A heading inserted among siblings opens a section that extends to the next heading of its level
or shallower, so the anchor's following siblings SHALL become part of the inserted subtree.
This is the encoding's own meaning and SHALL NOT be worked around by relocating the insertion
or by demoting the heading: a caret at a heading level is a request for a section at that level.

Absorption SHALL NOT reach past the destination scope's own end. A payload re-levelled from its
heading siblings sits level WITH them, so the next such sibling ends the inserted section, and
the enclosing heading's own next sibling — shallower again — ends it in either case.

#### Scenario: Following siblings join the pasted section
- **WHEN** a heading-rooted payload is pasted after a sibling that is followed by more content
  at the same depth
- **THEN** that content re-parses as part of the pasted heading's section

#### Scenario: A sibling heading ends the pasted section
- **WHEN** the anchor's following sibling is a heading of the enclosing scope's level
- **THEN** that heading and everything after it stay outside the pasted section

#### Scenario: A scope whose headings skip a level still ends the pasted section
- **WHEN** a payload is pasted among an `h1`'s children, which are `h3` headings
- **THEN** it takes `h3` from those siblings rather than `h2` from the parent, and the following
  `h3` stays outside the pasted section
