## MODIFIED Requirements

### Requirement: Chrome composes with existing decorations without displacing them
The block-level selected-node chrome SHALL render alongside indentation, guide-line,
and marker decorations on the same lines without removing, overriding, or visually
replacing them, and SHALL apply to every line Obsidian replaces with an opaque widget —
whatever that line's node kind is, not only the always-widget-replaced atom kinds (tables,
callouts, raw HTML, horizontal rules) — exactly as it applies to plain `.cm-line`s, using
whichever mechanism (declarative decoration or direct DOM patch) already reaches that line's
rendered form.
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

#### Scenario: A covered widget-replaced non-atom line gets chrome too
- **WHEN** an escalated cover includes a paragraph consisting of a note embed, rendered as
  an opaque replacement element rather than a plain `.cm-line`
- **THEN** that element receives the same selected-node chrome as every plain line in the
  same cover, reaching the same left edge

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
amounts on the same blockquote line; and this change's embed-fixture coverage asserting
chrome on a widget-replaced embed line in both cursor states.
