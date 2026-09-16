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
  re-level so its root sits at the destination's depth.
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

## ADDED Requirements

### Requirement: A payload landing in the other encoding regime re-encodes as a whole subtree
When a subtree payload is inserted into a destination whose encoding regime differs from its
own, the payload SHALL be re-encoded as a UNIT: the destination's depth determines the regime,
and every node in the payload SHALL be re-encoded for that regime, preserving the payload's own
relative hierarchy exactly. No node SHALL retain an encoding that contradicts the regime its
new position places it in.

Into a LIST scope specifically, every node in the payload that HAS CHILDREN SHALL be encoded as
a list item. This is required by the mapping rather than chosen: below a list item a paragraph
has no expressible children at any indentation, so a payload whose interior nodes stay
paragraphs loses a level of its own hierarchy.

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

#### Scenario: A list subtree pasted into a heading section is unaffected
- **WHEN** a list item with nested children is pasted into a heading's section after a paragraph
- **THEN** the root takes the destination's content encoding and its descendants keep theirs,
  the existing behavior

#### Scenario: A same-regime paste is unaffected
- **WHEN** a payload is pasted into a destination of the same encoding regime
- **THEN** the existing re-indentation behavior applies unchanged

#### Scenario: An atom below a paragraph is still refused
- **WHEN** a payload containing an atom is inserted into a paragraph's children
- **THEN** the insertion is rejected as inexpressible, on every insertion path, rather than
  re-encoded

### Requirement: A pasted heading takes the content that follows it into its section
A heading inserted among siblings opens a section that extends to the next heading of its level
or shallower, so the anchor's following siblings SHALL become part of the inserted subtree.
This is the encoding's own meaning and SHALL NOT be worked around by relocating the insertion
or by demoting the heading: a caret at a heading level is a request for a section at that level.

Absorption SHALL NOT reach past the destination scope's own end — the enclosing heading's next
sibling is shallower than any level the payload can be re-levelled to, and therefore ends the
inserted section.

#### Scenario: Following siblings join the pasted section
- **WHEN** a heading-rooted payload is pasted after a sibling that is followed by more content
  at the same depth
- **THEN** that content re-parses as part of the pasted heading's section

#### Scenario: A sibling heading ends the pasted section
- **WHEN** the anchor's following sibling is a heading of the enclosing scope's level
- **THEN** that heading and everything after it stay outside the pasted section
