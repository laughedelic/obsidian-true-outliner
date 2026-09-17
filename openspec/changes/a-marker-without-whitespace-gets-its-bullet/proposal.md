## Why

A line holding nothing but `-` renders as a raw dash. It carries the outline's indentation, its
guide column and its fold arrow, but no bullet, while the items above and below it show theirs.
Reported from real-vault use on 2026-09-17, with screenshots, in stock Live Preview and in
outline mode alike; reading mode shows the same line as an ordinary bullet.

Three readers disagree about that line, measured and recorded in
[docs/research/marker-without-trailing-space](../../../docs/research/marker-without-trailing-space.md):
our parser and Obsidian's own reading mode read an empty list item, while the CodeMirror markdown
mode Live Preview runs gates every list token on `listRE = /^(?:[*\-+]|^[0-9]+([.)]))\s+/` — read
out of the 1.13.7 bundle — whose `\s+` no marker at end of line can satisfy. No token, no
`formatting-list-ul`, and so no `.list-bullet` element for the plugin to style.

`outline-decorations` states that a list item's marker is Obsidian's, that the plugin styles and
positions it rather than adding one, and that `markerVisibility` never hides it. Every clause
assumes the element exists. On this one shape it does not, and the line reads as body text in an
outline that is telling the user it is a node.

The fact we carried said otherwise: `hasNativeMarker` was `isListItem && isFirstLine`, a claim
about Obsidian's DOM made from our parse alone and never checked against the rule Obsidian
applies.

## What Changes

- **`hasNativeMarker` states what it says**: whether Live Preview draws the glyph, mirroring the
  mode's own rule against the line's text. The consumers that meant "this line carries a marker"
  — the marker gutter, the surplus-whitespace mark, the ordered-digit span — ask
  `isListItem && isFirstLine` instead, which is what they were reading it for.
- **The bullet is supplied where Obsidian declines to draw one**, as a `.list-bullet` mark over
  the marker's single character: the element, the class and the span Obsidian uses itself, so its
  own rule hides the raw glyph and draws the dot, and every rule already targeting that class —
  the current and ancestor accents, the folded state, the hover — reaches it with no second
  selector.
- **Only a bullet is supplied.** An ordered marker's digits are its glyph and are ordinary text on
  the line whether or not a token was emitted, so nothing is missing to draw.

## Non-goals

- **The parse is unchanged.** A bare marker stays an empty list item, which is what CommonMark and
  Obsidian's reading mode both read. Live Preview disagreeing with its own reading mode is a
  rendering gap to cover, not a reason to hold a different tree than the file means.
- **No new CSS.** Reusing Obsidian's own class is what makes this a decoration change and not a
  styling one; a `to-decor-supplied-bullet` class rides along for scoping that may never be
  needed.
- **The rest of the line's geometry is left as it is.** Live Preview also withholds
  `HyperMD-list-line` from that line, and what else follows from that is its own question.
- **Enter's empty-item ladder on a bare marker** stays as it is — the same end-of-line blind spot
  in `contentColumnCh`'s other consumers, recorded against the change that fixed the continuation.
