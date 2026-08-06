## RENAMED Requirements

- FROM: `### Requirement: Widget-replaced atoms receive indentation and markers via direct DOM patching`
- TO: `### Requirement: Widget-replaced lines receive indentation, markers, and guides via direct DOM patching`

## MODIFIED Requirements

### Requirement: Additive-only indentation, native list rendering untouched
Every node's lines SHALL carry an indentation contribution equal to `depth × unit`,
computed from the node's distance from the document root in the parsed tree — not from raw
markdown indentation or heading level. Which CSS property carries that contribution SHALL be
determined by the line's RENDERED FORM, not by its node's kind: a line rendered as plain
text with no visible box of its own takes it as `padding-left`; a line that renders a
visible box of its own — an atom, or any line Obsidian replaces with an opaque widget —
takes it as `margin-left`, since padding does not move a visible box's own edges. List items
SHALL NEVER have their native `text-indent`/`padding-left` hang pair modified; instead they
SHALL receive `supplementalDepth × unit` as `margin-left`, where `supplementalDepth` is the
count of non-list-item ancestors above the nearest list root. Nodes at the same tree depth
SHALL receive the same indentation contribution regardless of whether their depth is encoded
via heading level, list indentation, or paragraph adjacency, AND regardless of whether the
line is currently rendered as plain text or as an opaque widget.

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

#### Scenario: A widget-rendered line aligns with its same-depth plain siblings
- **WHEN** a line whose node is NOT an atom (e.g. a paragraph consisting of a note embed,
  `![[Another note]]`) is rendered by Obsidian as an opaque replacement element, and a plain
  paragraph sits at the same tree depth in the same document
- **THEN** both start at the same column — the widget-rendered line's indentation
  contribution is its node's, exactly as though it had rendered as plain text

**Covered by**: `tests/decorate.test.ts` ("agrees across heading, list, and
paragraph-adjacency encodings", "includes multiline node continuation lines at the node's
own depth", "is constant across an entire nested list under a heading, equal to the root's
own depth", "re-roots at a list item that starts a new chain under a non-list-item
ancestor", "recomputes independently for separate lists under separate heading depths");
`e2e/specs/50-decorations.e2e.ts` ("heading-then-list: list shifts right by the heading
depth, per-level spacing untouched", "wide-numbering: no marker/text overlap across the
9->10 digit-width boundary", "multiline continuation: continuation lines indent identically
to the node's first line", "fold indicator on a parent list item does not collide with
decorated content", plus this change's embed-fixture coverage asserting cursor-on/cursor-off
indentation equality).

### Requirement: Widget-replaced lines receive indentation, markers, and guides via direct DOM patching
Obsidian replaces some lines in Live Preview with opaque elements on which a CM6
`Decoration.line` has no effect. Which lines those are SHALL NOT be assumed to correspond to
any set of node kinds, NOR SHALL they be identified by enumerating the CSS classes those
elements happen to carry: tables, callouts, raw HTML blocks, and horizontal rules are always
widget-replaced, but a line of ANY kind can be — a paragraph consisting of a note embed
(`![[Another note]]`) is one, and an embed can also occupy one line of a multi-line node or
a list item's line. A line-level replacement SHALL be recognized structurally, by standing
in for a whole editor line, so that a widget-rendered kind the layer has never seen is
handled correctly by construction.

Every line that Obsidian replaces with an opaque widget SHALL receive its indentation
contribution, its marker, its ancestors' guides, and its selection chrome via direct DOM
patching (inline styles and an injected marker child element) applied after each render,
computed from THAT LINE's own decoration facts — its depth, kind, first-line status, and
list-item status — exactly as the corresponding plain `.cm-line` would have received them.
The marker SHALL therefore follow the line's node kind: a widget-replaced paragraph line
renders the paragraph marker, a widget-replaced list-item line renders none (its native
bullet/number is untouched), and a widget-replaced continuation line renders none.

Native padding the widget itself contributes SHALL be read live (never hardcoded) and
subtracted so the widget's visible content aligns with same-depth content of other kinds,
clamped so a depth-0 line's contribution never goes negative.

A widget nested INSIDE a rendered `.cm-line` (for example an inline image embed among a
paragraph's text) SHALL NOT be patched: its host line is a real `.cm-line` that already
received its decoration declaratively, and patching the nested element too would shift it a
second time. Only a widget standing in for a whole editor line SHALL be patched. Cleanup —
removing a previously applied patch — SHALL be confined to widgets that genuinely carry no
line-level decoration state, and SHALL NOT be reached merely because a widget-replaced
line's node is not an atom.

#### Scenario: Widget atoms indent like plain atoms
- **WHEN** a table, callout, HTML block, or horizontal rule sits at a non-zero tree depth
- **THEN** its rendered position matches a same-depth code block or callout, not offset by
  its own native internal padding

#### Scenario: A widget-replaced non-atom line is decorated, not skipped
- **WHEN** a paragraph consisting of a note embed sits at a non-zero tree depth and renders
  as an opaque replacement element
- **THEN** it carries the paragraph's own indentation contribution, its paragraph marker,
  and every guide its ancestors own — not a flush-left undecorated block

#### Scenario: A widget-replaced continuation line takes its node's indentation and no marker
- **WHEN** a note embed occupies one line of a multi-line paragraph, so that line is
  widget-replaced while the node's first line is not
- **THEN** it carries the same indentation contribution as the node's first line, and no
  marker of its own

#### Scenario: A list-item line keeps native list rendering whatever it contains
- **WHEN** a list item's line contains a note embed (e.g. `- ![[Another note]]`)
- **THEN** it receives its `supplementalDepth` contribution and no synthetic marker, exactly
  as a list item containing only text does

#### Scenario: A widget nested inside a rendered line is left alone
- **WHEN** a paragraph line contains an inline embed among other text, so the line renders
  as a real `.cm-line` with a widget element nested inside it
- **THEN** the line's own indentation and marker render once, from the line's declarative
  decoration, and the nested widget receives no patch of its own — no doubled shift

**Covered by**: `e2e/specs/50-decorations.e2e.ts` ("widget-replaced atoms (table, callout,
hr, html) get margin-left too"), `e2e/specs/52-block-markers-icons.e2e.ts`
("widget-replaced atom kinds (table/callout/html/hr) each get exactly one marker child"),
plus this change's embed-fixture coverage across the placements an embed can occupy
(whole-paragraph line, one line of a multi-line node, list-item line, inline among text) in
both the cursor-on and cursor-off states.
