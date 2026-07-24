## ADDED Requirements

### Requirement: An exact whole-node or whole-subtree selection cover renders block-level chrome
When the current editor selection contains a non-empty range that covers a single
node's whole subtree, or the combined subtree of a contiguous run of sibling subtrees —
starting exactly at the covered node(s)' first character, and reaching at least their
last content character (whether it ends precisely there or extends further into that
same node's own trailing gap, as the gap-line escalation trigger's expand-only rule
retains) — every line that span covers SHALL render distinguishing block-level
highlight chrome. A range that does not reach this cover, or that starts short of it,
SHALL render no additional chrome.

#### Scenario: Escalated selection from a boundary-crossing drag gets chrome
- **WHEN** a drag selection escalates to a whole sibling subtree cover (per
  `node-selection-enforcement`)
- **THEN** every line of that cover renders the block-level selected-node chrome

#### Scenario: A drag past a node's end onto its trailing gap gets chrome
- **WHEN** the user drag-selects from the middle of a node's text down onto the blank
  line that follows it (the gap-line escalation trigger), landing on the gap rather
  than exactly at the node's last content character
- **THEN** the block-level chrome still renders for that node's whole subtree

#### Scenario: Selection that merely resembles a cover also gets chrome
- **WHEN** the user selects exactly a node's own full single line of text through
  ordinary native gestures (e.g. Home then Shift+End), without any boundary crossing
- **THEN** the same block-level chrome renders, since the current selection's bounds
  match that node's cover regardless of how the selection was produced

#### Scenario: A within-node partial-content selection gets no chrome
- **WHEN** the user selects part, but not all, of a single node's own content, without
  reaching its trailing gap
- **THEN** only the native character-level highlight renders; no block-level chrome
  appears

#### Scenario: Cursors never get chrome
- **WHEN** the selection is an empty range (a cursor), anywhere including on a node
  boundary or a gap line
- **THEN** no block-level chrome renders

**Covered by**: a new e2e spec for escalated-selection chrome (drag-past-boundary,
whole-line-text match, partial-content, cursor); a pure-module test suite for the
cover-membership query, mirroring `tests/escalate.test.ts`'s property style.

### Requirement: Multi-range selections decorate each covered range independently
For a multi-cursor/multi-range selection, each non-empty range SHALL be evaluated
against the exact-cover test independently. A range that is an exact cover renders its
own chrome regardless of whether other ranges in the same selection are covers.

#### Scenario: One escalated range and one partial-content range in the same selection
- **WHEN** a multi-range selection has one range that is an exact whole-subtree cover
  and one range that is a partial within-node selection
- **THEN** the covering range's lines render chrome and the partial range's lines do
  not

#### Scenario: Every range in a multi-range selection is an exact cover
- **WHEN** a multi-range selection consists of several ranges, each independently an
  exact whole-subtree cover (e.g. the uniform multi-range escalation result)
- **THEN** every one of those ranges' covered lines renders chrome

**Covered by**: e2e coverage for multi-range escalated selections; pure-module tests
over multi-range inputs.

### Requirement: Chrome composes with existing decorations without displacing them
The block-level selected-node chrome SHALL render alongside indentation, guide-line,
and marker decorations on the same lines without removing, overriding, or visually
replacing them, and SHALL apply to widget-replaced atom lines (tables, callouts, raw
HTML, horizontal rules) exactly as it applies to plain `.cm-line`s, using whichever
mechanism (declarative decoration or direct DOM patch) already reaches that line kind.
A line or widget that sets its OWN opaque background directly (e.g. a code fence) SHALL
still show the chrome tint blended with that background, the same as a line that stays
transparent. A line with its own native decorative element positioned at a fixed column
(e.g. a blockquote's colored side-bar) SHALL keep that element rendering at its own
native, unshifted position, regardless of how far the chrome's own left edge reaches for
that cover.

#### Scenario: A covered subtree containing an indented list item keeps its indentation
- **WHEN** an escalated cover includes a list item several levels deep
- **THEN** the list item's indentation and guide lines render unchanged, with the
  selected-node chrome added on top

#### Scenario: A covered subtree containing a table gets chrome too
- **WHEN** an escalated cover includes a table (a widget-replaced atom)
- **THEN** the table's rendered element receives the same selected-node chrome as
  plain lines in the same cover, alongside its existing margin and marker

#### Scenario: A widget atom's chrome matches the right edge every plain line reaches
- **WHEN** an escalated cover includes a widget atom (e.g. a table) whose own rendered
  box is wider on the right than a plain line's (reserved space for a native UI
  affordance not part of its visible content)
- **THEN** that widget's chrome right edge matches every plain line's own right edge in
  the same cover, not the widget's own wider box

#### Scenario: A code fence's own opaque background still shows the chrome tint
- **WHEN** an escalated cover includes a code fence line, which (unlike a heading or
  paragraph) sets its own opaque `background-color` directly on the line rather than
  staying transparent
- **THEN** the chrome tint renders blended with that background, the same as it does on
  a transparent line — the line becomes its own stacking-context root so its `z-index:
  -1` chrome pseudo resolves behind just that line's own content, not hoisted to an
  ancestor context where it would paint behind the line's own background too

#### Scenario: A blockquote's native side-bar stays at its own position, not the chrome's left edge
- **WHEN** an escalated cover includes a blockquote line, and the cover's shared left
  edge reaches well past that blockquote's own native column
- **THEN** the blockquote's own colored side-bar renders at its own native, unshifted
  position — neither relocated to the chrome's left edge nor removed/hidden — regardless
  of how far that edge reaches for this particular cover

**Covered by**: e2e coverage extending the existing decoration corpus with an
escalated-selection-over-table/callout fixture; a dedicated code-fence stacking-context
regression check (asserting the selected line's own resolved `z-index`, since computed
background-color/z-index values on the chrome pseudo alone look correct even when the
actual paint order is wrong); a dedicated blockquote regression check comparing the
side-bar's resolved absolute position across two covers with very different shift
amounts on the same blockquote line.

### Requirement: Chrome anchors one level beyond the covered root's own column, not each line's own
The chrome's left edge SHALL align to the SAME column for every line an escalated cover
spans, regardless of how much more deeply any individual descendant line (a nested list
item, code fence, blockquote, or table) is itself indented. That shared column SHALL be
one level shallower than the covered root's own column — the same column the root's
PARENT would render an indentation guide at, clearing the root's own marker icon (which
is centered ON its own column) rather than bisecting it. A top-level root (no parent)
SHALL use an equivalent one-level offset rather than its own column. The chrome SHALL
NOT reach any further left than this (content further left belongs to a shallower
ancestor, outside the current selection). A list-item root has no additive column of its
own (list indentation is deferred entirely to native rendering, consistent with how
indentation guides already treat list-item ancestors) — its own line's shift, less one
level, is used as the target instead.

#### Scenario: A selected section's nested list/code/blockquote/table all align to one edge
- **WHEN** an escalated cover is rooted at a heading and spans a nested list item, a
  code fence, a blockquote, and a table at various (deeper) depths
- **THEN** every one of those lines' chrome renders with its left edge at the SAME
  absolute column, one level shallower than the root heading's own column — none of
  them show a gap between that column and their own (more deeply indented) content

#### Scenario: Chrome clears the covered root's own marker instead of bisecting it
- **WHEN** an escalated cover is rooted at a heading that has its own marker icon
- **THEN** the chrome's left edge sits to the left of that marker's own column, so the
  marker renders fully inside the tinted region rather than being cut through its middle

#### Scenario: Chrome never reaches into a shallower ancestor's own territory
- **WHEN** an escalated cover is rooted at a nested (e.g. H3) heading inside a deeper
  document structure (H1 > H2 > H3)
- **THEN** the shallower ancestor headings' (H1, H2) own lines render no chrome

**Covered by**: e2e coverage comparing the resolved viewport position of the chrome's
left edge across a heading root, its descendants at varying depths (list, code,
blockquote), and its shallower ancestors; a dedicated blockquote-specific regression
check (Obsidian's native blockquote side-bar rule sets `width: 1px` on the same pseudo-
element this chrome uses, which silently shrank the whole chrome box before this rule
explicitly reset `width`).

### Requirement: Native character-level highlight is suppressed while the whole selection is block-covered
When every non-empty range in the current selection is an exact cover, the native
browser character-level `::selection` highlight SHALL render transparent for text inside
the outline-mode editor, so it does not visually compete with the block-level chrome.
When any non-empty range is NOT a cover (including off-mode notes, where chrome never
applies at all), the native highlight SHALL render normally.

#### Scenario: Escalated selection suppresses the native highlight
- **WHEN** a drag selection escalates to a whole-subtree cover
- **THEN** the native character-level selection highlight renders fully transparent

#### Scenario: A partial, non-covered selection keeps the native highlight
- **WHEN** the user selects part of a single node's own content (not a cover)
- **THEN** the native character-level selection highlight renders normally, unsuppressed

#### Scenario: Off-mode notes never suppress native selection
- **WHEN** a note without outline mode enabled has any selection, covered-shaped or not
- **THEN** the native character-level selection highlight always renders normally

**Covered by**: e2e coverage reading the resolved `::selection` computed
`background-color` across a covered selection, a partial selection, a cursor, and an
off-mode note.

### Requirement: Chrome is purely derived and never mutates selection or document state
The decoration SHALL be computed only from the current `EditorState` (selection and
parsed document); it SHALL NOT alter the selection, dispatch a transaction, or persist
any new state. It SHALL be scoped to outline-mode editors only, matching every other
decoration in `outline-decorations`, and SHALL have no effect in off-mode notes or
reading view.

#### Scenario: Off-mode note shows no chrome
- **WHEN** a note without outline mode enabled has a selection that would otherwise be
  an exact node cover
- **THEN** no block-level chrome renders; the selection appears exactly as stock
  Obsidian would render it

#### Scenario: Rendering the chrome does not change the selection
- **WHEN** an exact-cover selection is displayed with chrome
- **THEN** the underlying `EditorSelection` and document content are unchanged from
  before the chrome was computed

**Covered by**: e2e off-mode reference comparison; unit test asserting the decoration
computation is a pure function of `EditorState`.
