## ADDED Requirements

### Requirement: The marker gutter is derived from the marks it must hold

The marker gutter — the room reserved between a depth's column and the start of that depth's
text — SHALL be derived from the marks that have to fit inside it, rather than chosen
independently of them.

A mark qualifies for the derivation when this layer positions it on the column and its width
does not depend on its own content. Qualifying marks fall into two classes, and the derivation
treats them differently because only one of them can be known before layout:

- **Layer-sized marks**, whose ink this layer or the theme decides: the synthetic block marker,
  an unordered list item's bullet, and a task item's checkbox.
- **Font-drawn marks**, whose ink is a glyph the reader's font supplies: a **single-digit**
  ordered number.

The derivation SHALL be: **the greatest distance any LAYER-SIZED mark's ink reaches right of
the column, plus one stated visual gap.** The stated gap SHALL be one value, so that what
varies between kinds is the room left beside a mark narrower than the widest one, and never the
column its text begins on — one gutter and marks of differing widths cannot deliver both a
constant gap and a shared column, and the shared column is the one this layer is for.

A layer-sized mark whose size the READER'S ENVIRONMENT sets SHALL enter the derivation as that
live value, read where it is used, rather than as a number recorded from one environment. A
checkbox is such a mark: it is drawn at the theme's own size, which the host resolves
differently per platform, so a constant taken from one platform is wrong on another — and wrong
in this layer's characteristic way, the mark rendering perfectly while its own text leaves the
shared column.

A FONT-DRAWN mark SHALL NOT be a term in the derivation, its ink being unknown before layout.
What such a mark is guaranteed is the FLOOR below and the shared column — not the stated gap.
Where a font draws one wider than the derivation left room for, it spends part of that gap;
only once it would cross the floor does its text leave the column, and that SHALL be asserted
rather than assumed.

The stated gap SHALL NOT be smaller than the advance of one space in the reader's font. This is
a floor the existing mechanism sets rather than a preference: every mark whose row is written
with a single space after it is sized as "the gutter, less one space", with that space
completing the run, so a gap below a space's own advance drives the sizing negative and the
mark overflows into the column its text was to begin on.

Where the native rendering of a mark states its own distance between that mark and its text,
that distance SHALL be neutralised rather than left to compete with the derived gap. A native
value left in place is inert only while the derived gutter happens to exceed it, and the kind
carrying it then leaves the shared column at whatever gutter stops exceeding it — a failure
visible as a few pixels of drift, with nothing in the rendering to attribute it to.

An ordered number of two or more digits SHALL NOT participate at all, in either class. Such a
number is permitted to exceed the gutter and lean right into the space its own text reserves, as
the column requirement already provides; its row's text therefore begins further right than its
siblings', and that SHALL be accepted rather than corrected. Widening the gutter so that the
widest possible number fits is explicitly rejected: it would loosen every ordinary row to spare
an occasional one, which is the opposite of what the gutter is being derived for.

Recorded measurements SHALL describe ONE commensurable pass — one environment, one set of
rules, one run. Figures from separate investigations SHALL NOT be combined, the marks being
positioned by rules that have changed between them. A term that varies between environments
SHALL NOT be settled by recording it in one of them and generalising; it is either read live,
as the checkbox term is, or it is not a term.

Surfaces that render the outline together SHALL lay out against ONE gutter, so that a row on one
and a row on the other begin their text on the same column — that shared column is what makes
them read as one outline rather than as two that resemble each other. Where the surfaces' own
derivations differ, the shared gutter SHALL be the largest of them: a gutter wider than a
surface's own marks need leaves those marks extra room and breaks nothing, while one narrower
than they need takes a kind off the column. Every expression that positions a mark relative to
the column SHALL read that gutter from the shared custom property rather than restating its
value, so a surface that resizes its own marks keeps their centres on the column.

#### Scenario: Text sits on one column, the widest mark exactly a gap from it

- **WHEN** a paragraph, a bulleted item, a task and a single-digit ordered item render at the
  same depth
- **THEN** all four texts begin on the same column, and the widest LAYER-SIZED mark's ink sits
  exactly the stated gap from its own text

#### Scenario: A font-drawn mark keeps the floor and the column

- **WHEN** the reader's font draws a single-digit ordered number wider than the environment the
  gutter was derived against
- **THEN** its text still begins on the column its siblings' text begins on, and its own ink
  stays at least one space's advance clear of that text

#### Scenario: A wide ordered number pushes only its own text

- **WHEN** a list contains both `1.` and `10.` items
- **THEN** both numbers share one left edge, the two-digit number's own text begins further
  right than the single-digit number's, and neither number overlaps its own text

#### Scenario: Tightening the gutter does not move the grid

- **WHEN** the derived gutter is smaller than the previous value
- **THEN** every depth's column is where it was, each level remains one unit from the next, and
  only the distance between a mark and its own text changes

#### Scenario: A platform that sizes a mark differently keeps its text on the column

- **WHEN** the same outline renders where the host resolves a qualifying mark's own size to a
  larger value than the environment the derivation was measured in
- **THEN** the gutter grows with that mark, and every kind's text still begins on one column

#### Scenario: A second surface keeps both its column and its marks' centres

- **WHEN** a surface renders the outline's chrome with marks smaller than the editor's, whose
  own derivation would yield a smaller gutter than the editor's
- **THEN** it lays out against the editor's gutter so both surfaces' text begins on one column,
  and every one of its marks' visible centres still coincides with its own depth's column

**Covered by**: `e2e/specs/57-marker-gap.e2e.ts` ("starts all four qualifying marks' text on
one column"; "leaves the widest layer-sized mark exactly the stated gap from its text" — the
widest is MEASURED rather than named, so the assertion follows a theme that resizes one;
"gives a font-drawn mark the floor rather than the stated gap"; "keeps every mark clear of its
own text by at least one space's advance"; "pushes only its own text right when an ordered
number is too wide"), `e2e/specs/74-footer-chrome-pass.e2e.ts` ("lays the section's own chrome
out on the same gutter as its rows"; "keeps every ordinal clear of its own text, however wide
the number").


## MODIFIED Requirements

### Requirement: Markers are fixed-size and coexist with native and guide chrome
A marker's size SHALL NOT vary with the kind, heading level, or font size of the line it sits
on: every marker a surface draws SHALL render at one size. A surface MAY choose what that size
is, including expressing it relative to its own text, provided the size is the same for every
line that surface renders — the invariant is that a heading's marker is no larger than a
paragraph's, not that any particular unit is used to say so.

A marker SHALL NOT remove, replace, or visibly collide with Obsidian's native blockquote bar,
the CSS containment/specificity rules widget atoms carry, or Obsidian's native fold chevron on
a heading.

#### Scenario: Marker size is font-size-independent
- **WHEN** a marker renders on a heading line and on a paragraph line
- **THEN** its rendered width and height are identical despite the heading's larger font

#### Scenario: Blockquote native bar and marker coexist
- **WHEN** a blockquote line also carries a marker
- **THEN** both Obsidian's native colored bar and the marker render, neither clobbering the
  other

#### Scenario: A depth-0 widget atom's marker is not clipped
- **WHEN** a table with no ancestor (tree depth 0) renders a marker
- **THEN** the marker is fully visible, not clipped by Obsidian's native `contain: paint`
  containment

#### Scenario: Fold chevron stays clear of the marker and any active guide
- **WHEN** a heading has a foldable child, so Obsidian renders its native fold chevron
- **THEN** the chevron does not overlap the heading's own marker or an ancestor's guide
  line passing through the same row

**Covered by**: `e2e/specs/52-block-markers-icons.e2e.ts` ("blockquote: native colored bar
and the marker widget coexist (DOM widget, not a pseudo-element — no clobber by
construction)", "marker size is fixed (rem), NOT font-size-dependent — identical
width/height on a heading vs. a paragraph line", "no !important/specificity or
contain:paint regression: a depth-0 table (no ancestor guide) still shows its marker
unclipped", "code fence and blockquote markers align horizontally with a same-depth
paragraph's (native padding/text-indent compensation)", "heading marker vertical offset
from the line's own center is small and doesn't grow with heading level (H1 vs H3)",
"native fold chevron glyph sits between the marker and an ancestor's guide line, clear of
both").
