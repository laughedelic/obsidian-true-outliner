## ADDED Requirements

### Requirement: Decorations are scoped to outline mode
The decoration layer SHALL be registered as CodeMirror extensions via
`registerEditorExtension` and SHALL render indentation, guides, and markers only when the
editor's file has outline mode enabled (resolved through the same mode source the keyboard
grammar uses). Outside outline mode, or in the reading/preview view, the document SHALL
render exactly as stock Obsidian, with no additive indentation, guides, markers, or other
decorations present.

#### Scenario: No chrome off-mode
- **WHEN** a note without outline mode enabled is open in the editor
- **THEN** no indentation, guides, or markers are rendered; the DOM matches stock Obsidian
  live preview

#### Scenario: Toggle applies immediately
- **WHEN** outline mode is toggled on for the open note
- **THEN** decorations appear on the next editor render, with no reload required

**Covered by**: `e2e/specs/51-guides-gradient.e2e.ts` ("draws no guides with outline mode
off"), `e2e/specs/52-block-markers-icons.e2e.ts` ("draws no markers with outline mode off").

### Requirement: A pure list renders byte-identical to outline-mode-off
A document consisting entirely of list items with no non-list-item ancestor (no heading or
paragraph above any node in the list) SHALL render with zero decoration contribution: no
added indentation, no guide, no marker. Every list item's `supplementalDepth` SHALL be 0,
and no ancestor exists to own a guide.

#### Scenario: Pure list nesting shows no decoration
- **WHEN** a document is a deeply nested list with no heading or paragraph ancestor anywhere
  in it
- **THEN** every list item's rendered position, guide state, and marker state are identical
  to outline-mode-off

**Covered by**: `tests/decorate.test.ts` ("is 0 for a list with no non-list-item ancestors
(byte-identical invariant)"), `e2e/specs/51-guides-gradient.e2e.ts` ("a pure list nesting
fixture (no non-list ancestor) draws no guides at all").

### Requirement: Additive-only indentation, native list rendering untouched
Every node's lines SHALL carry an indentation contribution equal to `depth × unit`
(headings/paragraphs via `padding-left`; atoms via `margin-left`, since padding does not
move an atom's own visible box), computed from the node's distance from the document root
in the parsed tree — not from raw markdown indentation or heading level. List items SHALL
NEVER have their native `text-indent`/`padding-left` hang pair modified; instead they SHALL
receive `supplementalDepth × unit` as `margin-left`, where `supplementalDepth` is the count
of non-list-item ancestors above the nearest list root. Nodes at the same tree depth SHALL
receive the same indentation contribution regardless of whether their depth is encoded via
heading level, list indentation, or paragraph adjacency.

#### Scenario: Heading and list depth align
- **WHEN** a `### Heading` two tree-levels deep (nested under an `#` and a `##` ancestor)
  and a twice-indented list item are both visible in the same document
- **THEN** both render the same indentation contribution

#### Scenario: A list shifts as a whole under a non-list ancestor, internal spacing untouched
- **WHEN** a list sits under a heading
- **THEN** the list's start position shifts right by the heading's own depth contribution,
  while spacing between the list's own nesting levels is pixel-identical to
  outline-mode-off

#### Scenario: Multiline continuation lines match their node's first line
- **WHEN** a paragraph or list item spans multiple physical lines (via a hard line break)
- **THEN** every continuation line carries the same indentation contribution as the node's
  first line

**Covered by**: `tests/decorate.test.ts` ("agrees across heading, list, and
paragraph-adjacency encodings", "includes multiline node continuation lines at the node's
own depth", "is constant across an entire nested list under a heading, equal to the root's
own depth", "re-roots at a list item that starts a new chain under a non-list-item
ancestor", "recomputes independently for separate lists under separate heading depths");
`e2e/specs/50-decorations.e2e.ts` ("heading-then-list: list shifts right by the heading
depth, per-level spacing untouched", "wide-numbering: no marker/text overlap across the
9->10 digit-width boundary", "multiline continuation: continuation lines indent identically
to the node's first line", "fold indicator on a parent list item does not collide with
decorated content").

### Requirement: Widget-replaced atoms receive indentation and markers via direct DOM patching
Tables, callouts, raw HTML blocks, and horizontal rules SHALL render in Live Preview as
opaque replacement widgets on which a CM6 `Decoration.line` has no effect. These kinds SHALL
receive their indentation contribution and marker via direct DOM patching (an inline
`margin-left` style and an injected marker child element) applied after each render, with
native padding the widget itself contributes read live (never hardcoded) and subtracted so
the widget's visible content aligns with same-depth code/callout content, clamped so a
depth-0 atom's contribution never goes negative.

#### Scenario: Widget atoms indent like plain atoms
- **WHEN** a table, callout, HTML block, or horizontal rule sits at a non-zero tree depth
- **THEN** its rendered position matches a same-depth code block or callout, not offset by
  its own native internal padding

**Covered by**: `e2e/specs/50-decorations.e2e.ts` ("widget-replaced atoms (table, callout,
hr, html) get margin-left too"), `e2e/specs/52-block-markers-icons.e2e.ts`
("widget-replaced atom kinds (table/callout/html/hr) each get exactly one marker child").

### Requirement: Indentation and markers compose with Obsidian's native base margin
Obsidian's "readable line width" feature applies a native, uniform base margin to every
line, independent of outline mode. The decoration layer's own `margin-left`/`padding-left`
contributions SHALL be added to that native base, never replace it.

#### Scenario: Margin-shifted lines don't invert under a nonzero native base
- **WHEN** the active theme or viewport gives every line a nonzero native base margin (e.g.
  a community theme with a narrower reading column)
- **THEN** a depth-1 list item under a depth-0 heading still renders to the right of the
  heading, not to its left

**Covered by**: `e2e/specs/51-guides-gradient.e2e.ts` ("margin-based lines compose with
Obsidian's own native base margin instead of replacing it (readable-line-width / community
themes)").

### Requirement: Indentation guides render only where native list guides have no representation
Every line SHALL carry an indentation-guide decoration for each strict, non-list-item
ancestor at a shallower tree depth — i.e. a guide is "owned" by a heading, paragraph, or
atom ancestor with descendants, and every line inside its subtree renders that guide. A
list-item ancestor SHALL NEVER own a guide: Obsidian's native list indent guides already
connect one bullet to the next within a list, and this layer only fills the gap those native
guides don't cover (a non-list ancestor bridging into or between blocks). Guides SHALL
render continuously through blank separator lines between sibling blocks, not just through
node content lines.

#### Scenario: Non-list ancestor's guide bridges through a list
- **WHEN** a list sits under a heading
- **THEN** every line of the list, including its own nested levels, renders the heading's
  guide; the list's own internal nesting renders no guide of its own

#### Scenario: A pure list nesting has no guide at all
- **WHEN** a document is a deeply nested list with no non-list ancestor
- **THEN** no guide renders anywhere in it, deferring entirely to Obsidian's native list
  indent guides

#### Scenario: Guides span blank lines between siblings
- **WHEN** a blank line separates two sibling blocks, or precedes a node's own first child
- **THEN** the guide renders through that blank line with no visible break

#### Scenario: Multiline continuation carries the same guide as the first line
- **WHEN** a node spans multiple physical lines
- **THEN** every continuation line renders the same active guide depths as the node's first
  line

**Covered by**: `tests/decorate.test.ts` (`computeLineGuides` suite: "produces empty
guideDepths for every line of a flat, childless document", "a leaf node's own line has no
active guide (only strict ancestors count)", "flags every fact isGapLine: false except a
leaf's own trailing blank separator lines", "a non-list ancestor bridges a guide onto every
descendant line, including list-item ones", "a pure list nesting (no non-list ancestor) has
no active guide anywhere", "a list item never itself owns a guide for its own children", "a
multi-line (Shift+Enter) node's continuation line inherits the same guideDepths as its first
line", "nests: a deeper non-list ancestor's own guide is appended to its parent's, not
replacing it", "is a strict superset of decorate()'s line coverage (every decorate() line
plus gap-only lines)"); `e2e/specs/51-guides-gradient.e2e.ts` ("a non-list ancestor's guide
sets a resolved gradient background on its own descendant BLOCK lines", "heading-then-list:
the bridging guide DOES render through list-item lines too", "a pure list nesting fixture
(no non-list ancestor) draws no guides at all", "multiline continuation: a guide renders
identically on a BLOCK node's own first line AND its continuation line", "multiline
continuation through a LIST-ITEM child: both lines render the bridging guide", "nests
correctly: each deeper (non-list) ancestor's descendant carries one more active gradient
layer", "every blank gap line between … also carries the guide — true continuity, no
breaks", "updates after a document edit without a mode toggle").

### Requirement: Guides coexist with native blockquote chrome and table scrolling
The guide mechanism SHALL NOT remove or replace Obsidian's native blockquote left-bar
rendering, and SHALL NOT disable a wide table's own horizontal scroll behavior.

#### Scenario: Blockquote native bar and guide render together
- **WHEN** a blockquote line also carries an active guide
- **THEN** both Obsidian's native colored left bar and the guide line render, neither
  replacing the other

#### Scenario: Wide table keeps its own scrollbar with a guide active
- **WHEN** a table wide enough to need horizontal scroll also carries an active guide
- **THEN** the table's own scrollbar remains functional (not the whole document becoming
  scrollable), and the guide still renders

**Covered by**: `e2e/specs/51-guides-gradient.e2e.ts` ("blockquote: native colored bar
(::before) and our guide (::after) coexist, neither clobbers the other", "wide-table
fixture: guide renders AND the table keeps its own real horizontal scroll (not the whole
document)", "widget-replaced atoms: callout/hr/html/table all get the guide after
overriding Obsidian's native contain:paint", "no !important/specificity fight resurrected:
position and background resolve as set, unbeaten by Obsidian's own CSS").

### Requirement: Block markers identify node kind, gated by a visibility setting
Every marker-eligible node's true first line SHALL render a synthetic marker distinct per
node kind. List items SHALL NEVER receive a marker — their native bullet/number already
signals the node. A marker SHALL appear only on a node's own first line, never on
continuation lines or blank gap lines. Which kinds actually render a marker SHALL be
governed by the `markerVisibility` setting (`'all'`, `'with-children'`, or
`'headings-and-paragraphs'`); the space reserved for a marker SHALL remain constant
regardless of this setting, so toggling it changes only whether the icon is drawn, never
text position.

#### Scenario: Every eligible kind gets a distinct marker under 'all'
- **WHEN** `markerVisibility` is `'all'` and a document contains a heading, paragraph, code
  fence, table, callout, quote, HTML block, and horizontal rule
- **THEN** each renders its own kind-specific marker on its first line, and none render on
  any continuation or gap line

#### Scenario: List items are unchanged
- **WHEN** a list item is rendered in outline mode, at any `markerVisibility` setting
- **THEN** it shows Obsidian's native bullet/number exactly as it would outside outline
  mode, with no additional synthetic marker

#### Scenario: 'with-children' hides leaf markers, including atoms
- **WHEN** `markerVisibility` is `'with-children'`
- **THEN** only nodes with at least one child render a marker; every atom (leaf by
  construction) renders none, regardless of kind

#### Scenario: 'headings-and-paragraphs' keys off kind, not instance state
- **WHEN** `markerVisibility` is `'headings-and-paragraphs'`
- **THEN** every heading and paragraph renders a marker whether or not it currently has
  children, and no atom kind ever renders one

#### Scenario: Hiding a marker never reflows text
- **WHEN** `markerVisibility` changes such that a previously-visible marker is hidden
- **THEN** the line's indentation (padding-left/margin-left) is unchanged; only the marker
  icon's presence changes

#### Scenario: Marker setting changes take effect without a rebuild
- **WHEN** `markerVisibility` is changed while a note is open in outline mode
- **THEN** the next render reflects the new setting, including for widget-replaced atoms
  whose decoration output would otherwise be byte-identical across the change

**Covered by**: `tests/decorate.test.ts` ("marks only the first line of each node as
isFirstLine", "flags hasNativeMarker only for list-item first lines", "carries the node
kind at every line, including list-item continuations", "carries whether the node has
children, constant across its own lines"); `e2e/specs/52-block-markers-icons.e2e.ts`
("plain-line kinds (heading/paragraph/code/quote) each get exactly one marker, on the first
line only", "widget-replaced atom kinds (table/callout/html/hr) each get exactly one marker
child", "list items get no marker at all (native bullet/number only)", "marker doesn't
repeat/duplicate across a live document edit (idempotent DOM patch)", "multi-line
continuation: a code fence's marker sits only on the opener line, indentation stays
consistent across all its lines", "'with-children': only branch nodes get a marker,
regardless of kind", "'with-children': a widget-replaced atom (table) with children
obviously still gets no marker — atoms are always leaves", "'headings-and-paragraphs': only
those two kinds get a marker, leaf or not — atoms never do", "changing marker visibility
live (no rebuild) toggles a leaf marker on the very next edit", "hiding a marker never
reflows the reserved gutter — text position is unaffected").

### Requirement: Markers are fixed-size and coexist with native and guide chrome
A marker's size SHALL be a fixed length (never `em`, which would resolve against the
surrounding line's own font-size), identical across every kind and heading level. A marker
SHALL NOT remove, replace, or visibly collide with Obsidian's native blockquote bar, the
CSS containment/specificity rules widget atoms carry, or Obsidian's native fold chevron on a
heading.

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

### Requirement: Nested per-cell editors receive no decorations
Obsidian renders an actively-edited table cell in Live Preview as its own independent CM6
editor instance mounted inside the outer table widget's DOM. This nested editor's own
"document" (the cell's raw text) SHALL receive no indentation, no guide, and no marker,
even though its outline-mode gate resolves to the same file as the real top-level note.

#### Scenario: Editing a table cell does not decorate the cell's own text
- **WHEN** a table cell in an outline-mode note is actively being edited
- **THEN** the cell's own nested editor renders with no added padding/margin and no marker,
  regardless of what the cell's raw text would otherwise parse as

**Covered by**: indirectly, `e2e/specs/52-block-markers-icons.e2e.ts`'s
`"'headings-and-paragraphs': only those two kinds get a marker, leaf or not — atoms never
do"` (this test's intermittent failure, traced to the nested-editor leak, is what surfaced
this requirement — see
[docs/research/10-experiment-5-block-markers.md](../../../../../docs/research/10-experiment-5-block-markers.md#follow-up-round-4-a-genuine-architectural-bug-found-via-a-flaky-test--decorations-leaking-into-obsidians-own-nested-per-cell-editors)).
No test directly opens a cell for editing and asserts the nested editor's own decoration
state — tracked as a coverage gap in `tasks.md`.

### Requirement: Decorations never mutate document state
The decoration layer SHALL be a pure rendering projection: it SHALL NOT dispatch any
document-changing transaction, move the cursor/selection, or create undo history entries,
regardless of how often it recomputes.

#### Scenario: Rendering produces no transaction
- **WHEN** the decoration layer recomputes after a document change
- **THEN** no new transaction is dispatched beyond the one that triggered the recompute,
  and the document text, cursor position, and undo stack are exactly as they were left by
  that triggering change

**Covered by**: `tests/decorate.test.ts` ("produces no facts for an empty document or
preamble-only document" — the pure computation has no side effects to begin with); no
dedicated e2e assertion checks the undo stack/cursor position directly after a decoration
recompute — tracked as a coverage gap in `tasks.md`.
