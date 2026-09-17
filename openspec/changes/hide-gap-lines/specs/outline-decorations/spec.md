## ADDED Requirements

### Requirement: Blank separator rows are collapsible, and the caret's row never collapses
A setting SHALL govern whether the blank separator lines between nodes — every line the tree
model owns as a node's trailing gap — are drawn as rows at all. It SHALL default to drawing
them, which is the rendering that exists today.

With the setting on, every such row SHALL render at zero height, and the rows above and below it
SHALL become adjacent. The row SHALL remain a line of the document in every other respect: its
element SHALL still be present, in its own place in the editor's line order, covering its own
extent. Collapsing SHALL be a matter of what is painted and nothing else — no line's indentation,
column, marker or text SHALL move, no character SHALL be inserted or removed, and a note SHALL be
byte-identical whichever way the setting is set.

The collapse SHALL apply to a separator row whether or not it carries an indentation guide. A
top-level gap carries none, and is a row like any other.

**The row holding the caret SHALL NOT collapse.** A blank line the caret rests on is a PROVISIONAL
POSITION (`content-space-caret`, `outline-keyboard-grammar`), and renders as the node it would
become; it is therefore not a separator row and SHALL be drawn at full height with the separation
around it collapsed, so the position reads as exactly one row. This SHALL hold for every blank line
a caret can come to rest on, whether the plugin's own dispatch or a programmatic placement put it
there.

A guide running through a collapsed row SHALL stay continuous: the requirement that guides render
through blank separator lines is unaffected, and the rows either side of the collapsed one are
adjacent, so no break appears where one is removed.

Collapsing SHALL NOT be implemented by any decoration that replaces a line break. A gap line is
where a fold cover, a node cover's selection background and a zoomed view's trailing hidden range
each end, and the backlinks footer anchors at the document end past the last of them; all four
SHALL keep working unchanged with the setting on.

#### Scenario: Separator rows collapse and content rows do not move
- **WHEN** the setting is turned on over a note of headings, paragraphs and list items separated
  by blank lines
- **THEN** every blank separator row renders at zero height while every content row keeps the
  exact chrome and height it had, and the editor's content is shorter by the rows removed

#### Scenario: A top-level gap collapses too
- **WHEN** two top-level nodes are separated by a blank line, which carries no guide because
  neither node has an ancestor
- **THEN** that row collapses like any other, rather than staying open because it had no guide to
  draw

#### Scenario: The caret's own row stays visible
- **WHEN** a structural keypress leaves the caret on a blank line between two nodes
- **THEN** that row renders at full height as the node it would become, and the blank lines
  separating it from the nodes above and below it collapse

#### Scenario: A guide crosses a collapsed row unbroken
- **WHEN** an ancestor's guide runs through a blank separator line that the setting collapses
- **THEN** the guide is one unbroken run: the rows either side of the collapsed one are adjacent,
  so nothing is drawn between them and nothing is missing

#### Scenario: The footer and a fold survive the collapse
- **WHEN** the setting is on in a note that ends with a blank line, with the backlinks footer
  enabled and a node folded
- **THEN** the footer renders and the fold cover is intact, because no line break has been
  replaced
