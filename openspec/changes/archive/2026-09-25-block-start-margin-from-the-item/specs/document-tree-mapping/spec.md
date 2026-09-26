## ADDED Requirements

### Requirement: A block start inside a list item is measured from the item
A quote, a callout and a thematic break SHALL open where the line's indentation
past the CONTENT COLUMN of the innermost list item holding it is at most three columns, as
CommonMark measures a block start from its container. Outside every list item the margin SHALL be
column 0. The block SHALL keep the line exactly as written.

The same margin SHALL apply where those three kinds are tested from inside another block: a
quote or a callout ending a list item's own lines, a quote or a thematic break ending a
paragraph's lines, and a quote's run, which SHALL also end at a line indented short of the
margin. A thematic break that could also be a setext underline SHALL NOT end a paragraph at the
margin.

An ATX heading, a setext underline and an HTML block SHALL keep measuring from column 0: a
heading opens a section, which a list item cannot hold, and the HTML block pattern is wider than
the HTML blocks CommonMark opens. A heading of either spelling SHALL close every list item's
margin, as it closes the items.

The indentation measured SHALL be spaces and tabs only.

#### Scenario: A tab-indented quote under an item is a quote
- **WHEN** `- alpha`, a blank line and `⏵> quote child` are parsed
- **THEN** the third line is a quote node, a child of `- alpha`

#### Scenario: A rule at a depth-2 child column is a rule
- **WHEN** `- one`, `  - two`, a blank line and `    ---` are parsed
- **THEN** the last line is an `hr` node, a child of `  - two`

#### Scenario: Four columns past the item's content column is still a paragraph
- **WHEN** `- alpha`, a blank line and six spaces then `> q` are parsed
- **THEN** the last line is a paragraph, a child of `- alpha`

#### Scenario: A setext heading closes the margin
- **WHEN** `- a`, a blank line, `  para`, `  ---` and four spaces then `> q` are parsed
- **THEN** `para` is a setext heading and the last line is a paragraph, its child — measured from
  column 0, where four columns do not open a quote

#### Scenario: An inline tag opening a child paragraph is not an HTML block
- **WHEN** `- a`, a blank line, `⏵<b>Note</b> text` and `⏵- c` are parsed
- **THEN** the third line is a paragraph and `⏵- c` a list item, both children of `- a`

#### Scenario: A heading under an item stays measured from column 0
- **WHEN** `- alpha`, a blank line and `⏵# heading child` are parsed
- **THEN** the last line is a paragraph, a child of `- alpha`
