## MODIFIED Requirements

### Requirement: Enter splits the node
In outline mode, Enter SHALL split the node at the cursor. For a node WITH
children, the remainder becomes the node's new FIRST CHILD — content-adjacent to
the split point, never jumping over the existing subtree — encoded per the child
scope's kind rules. For a node with NO children, the remainder becomes a sibling of
the same kind (empty lower half when the cursor is at the node's end), as before.
The cursor lands at the remainder's content start. On a heading line, Enter SHALL
split the heading's text at the cursor: the heading keeps the text before the
cursor (same level, marker, and setext-ness unchanged) and the text after the
cursor becomes a new paragraph, landing as the heading's new FIRST child —
regardless of whether the heading already has children, since a heading's only
possible SIBLING is another heading and a plain-text split has no such encoding.
When the cursor is at the heading's end (or only trailing whitespace follows),
Enter SHALL widen the heading's own trailing gap and place the cursor on a line
blank-separated from both the heading and whatever follows, per the same
gap-widening rule a childless paragraph's end-of-node split already uses — the new
child materializes only once text is typed there. For a setext heading, a mid-title
Enter SHALL keep the underline attached to the (truncated) heading, never treating it
as part of the split-off remainder. Enter with the cursor on a setext heading's
underline line SHALL decline with the rejection cue (`cannot-split`), since the
underline carries no title text to split. On an atom's interior, Enter SHALL decline
the key (stock newline).

#### Scenario: Split a list item mid-text
- **WHEN** Enter is pressed with the cursor inside a childless `- alpha beta`,
  after "alpha "
- **THEN** the text becomes two sibling items `- alpha ` and `- beta` and the
  cursor sits after the new item's marker (narrowed by this change: a list item
  WITH children splits differently — see the scenario below)

#### Scenario: Split a parent lands the remainder as first child
- **WHEN** Enter is pressed mid-text in a list item that has children
- **THEN** the remainder becomes the item's new first child, sitting directly
  below the split point and above the existing children

#### Scenario: Enter at end creates an empty sibling
- **WHEN** Enter is pressed at the end of a childless list item's text
- **THEN** a new empty sibling item appears below and the cursor sits on it

#### Scenario: Enter mid-heading-text splits the title
- **WHEN** Enter is pressed with the cursor mid-text inside `# Hello world`
  (after "Hello ")
- **THEN** the heading becomes `# Hello ` and a new paragraph child `world`
  appears directly below it, with the cursor at the new paragraph's content start

#### Scenario: Enter mid-heading-text with an existing paragraph child
- **WHEN** Enter is pressed mid-text in a heading whose existing first child is
  itself a paragraph
- **THEN** the split-off remainder becomes a new paragraph, separated from the
  existing paragraph child by a blank line so the two stay distinct nodes on
  re-parse (they do not merge into one paragraph)

#### Scenario: Enter at the end of a heading widens the gap
- **WHEN** Enter is pressed at the end of a heading's text (cursor after the last
  character, no trailing whitespace)
- **THEN** the heading's trailing gap widens by two blank lines (one more than
  this behavior inserted before this change) and the cursor lands on the first
  one, blank-separated from the heading above and from whatever follows below,
  ready for a real child paragraph to materialize once text is typed

#### Scenario: Enter mid-title of a setext heading keeps the underline attached
- **WHEN** Enter is pressed mid-text inside a setext heading `Hello world`
  underlined `====`, after "Hello "
- **THEN** the heading becomes `Hello ` still underlined by `====`, with a new
  paragraph child `world` directly below it — the underline is never treated as
  part of the split-off remainder

#### Scenario: Enter on a setext heading's underline declines
- **WHEN** Enter is pressed with the cursor on a setext heading's underline line
  (`===` or `---`)
- **THEN** the key is declined with the rejection cue and nothing changes
