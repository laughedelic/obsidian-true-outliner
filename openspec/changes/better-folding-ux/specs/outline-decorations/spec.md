## ADDED Requirements

### Requirement: A folded node's marker carries the fold, and the count of what it hides

A folded node's marker SHALL render in a folded variant of its own kind's mark — the SAME glyph in
a solid weight, taking full text contrast where an unfolded mark is muted. Nothing SHALL be added
around the glyph: no halo, ring, outline or underline. The mark keeps saying what kind of node it
is, and the weight change says something is beneath it.

The variant SHALL NOT change the mark's box, since the marker gutter is derived from the marks it
must hold and a folded mark is not a wider one, and it SHALL be legible in both themes.

The choice is recorded rather than left open: six alternatives were drawn against every mark at
real geometry in `docs/research/28-fold-marker-mockup.html`. Everything drawn AROUND the glyph
either crowds it — the gutter is 14px and the fold affordance already shares it — or has to change
shape per kind to avoid cropping a wide glyph, which makes one state read as several. The weight
change is the only treatment every mark can carry identically, including a bullet, which is
already solid and where the count does the work instead.

The number of hidden descendants SHALL render after the node's own text, as chrome rather than as
document content: it SHALL NOT be selectable, SHALL NOT receive the caret, and SHALL NOT appear in
copied text.

When markers are hidden by the marker-visibility setting, the count SHALL still render and the
fold affordance SHALL still be offered — the setting governs the kind mark, not the fold.

#### Scenario: A folded heading's marker changes state, not shape
- **WHEN** a heading with children is folded
- **THEN** its marker is the heading mark in its folded treatment, in the same box and column

#### Scenario: The hidden count renders as chrome
- **WHEN** a folded node hiding four descendants is selected and copied
- **THEN** the clipboard holds the node's text and its subtree, with no count in it

#### Scenario: Markers off, fold still legible
- **WHEN** the marker-visibility setting hides markers and a node is folded
- **THEN** the hidden count and the fold affordance are still shown

### Requirement: A node we make foldable, with no native chevron, receives our own

Obsidian paints its fold indicator on heading and list lines by a rule of its own, which takes no
notice of what the editor reports as foldable. A line carrying a node `outline-folding` makes
foldable, with no native chevron on it — today the paragraph with attached children, and heading
or list lines whenever Obsidian's own rule declines them — SHALL receive a fold affordance drawn
by the plugin, in the marker gutter, at the position the native chevron is transformed onto for
the lines that have one.

The condition SHALL be that pairing — our fold, no native chevron — rather than the node's kind or
the editor's own notion of foldability. Kind is wrong because Obsidian's rule is its own to
change; the editor's notion is wrong because it covers lines we deliberately offer no fold on,
such as a raw HTML block.

Both affordances SHALL behave identically: revealed on hover while unfolded, persistent while
folded, one click to toggle, and never two of them on one line.

#### Scenario: One affordance per line, in one place
- **WHEN** a note contains a foldable heading, a foldable list item and a foldable paragraph
- **THEN** each line offers exactly one fold affordance, and all three sit in the same column

#### Scenario: A line we offer no fold on gets none
- **WHEN** a table is hovered, and when a raw HTML block Obsidian's own folding would fold is
  hovered
- **THEN** no fold affordance appears beside either marker
