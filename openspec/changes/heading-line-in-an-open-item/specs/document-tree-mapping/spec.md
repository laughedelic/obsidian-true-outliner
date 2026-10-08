# Spec Delta

## MODIFIED Requirements

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

An HTML block SHALL keep measuring from column 0: its pattern is wider than the HTML blocks
CommonMark opens.

A heading line, ATX or a setext underline, at or past the content column of a list item still
open at that line SHALL NOT open a heading, whatever its indentation: it is text that item holds,
a paragraph child where a block starts there and more of the text above it otherwise, exactly as
the same line indented four columns further reads. A heading line short of every open item's
content column SHALL open a heading measured from column 0, and SHALL close every open list item
and its margin.

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

#### Scenario: A setext underline inside an open item is paragraph text
- **WHEN** `- a`, a blank line, `  para`, `  ---` and four spaces then `> q` are parsed
- **THEN** `  para` and `  ---` are one paragraph, a child of `- a`, and the last line is a
  quote, also a child of `- a` — the margin stays open at `- a`'s content column

#### Scenario: A setext heading closes the margin
- **WHEN** `- a`, a blank line, `  para`, an underline at column 0, and four spaces then `> q`
  are parsed, the underline written in turn as `---` and as `=====`
- **THEN** each time `  para` and its underline are a setext heading at the root, the underline
  short of `- a`'s content column, and the last line is a paragraph, the heading's child —
  measured from column 0, where four columns do not open a quote, although `  para` itself sat
  inside `- a`

#### Scenario: An inline tag opening a child paragraph is not an HTML block
- **WHEN** `- a`, a blank line, `⏵<b>Note</b> text` and `⏵- c` are parsed
- **THEN** the third line is a paragraph and `⏵- c` a list item, both children of `- a`

#### Scenario: A heading under an item stays measured from column 0
- **WHEN** `- alpha`, a blank line, one space then `# heading`, a blank line and `more` are
  parsed
- **THEN** ` # heading` is a root heading and `more` its child: one column is short of
  `- alpha`'s content column, so no item holds the line

#### Scenario: A heading under an item is a paragraph child at any indentation
- **WHEN** `- alpha`, a blank line, the heading line, a blank line and `more` are parsed, the
  heading line written in turn as `⏵# heading child`, as two spaces then `## H`, and as two
  spaces then `Title` over two spaces then `=====`
- **THEN** each time the heading line is a paragraph child of `- alpha`, and `more` is a
  root paragraph, not a child of any heading

#### Scenario: An item's paragraph child keeps the item open for a heading line
- **WHEN** `- item`, a blank line, `  para`, a blank line, `  ## H`, a blank line and `more`
  are parsed
- **THEN** `  para` and `  ## H` are both paragraph children of `- item`, and `more` is a root
  paragraph

#### Scenario: A heading line after the list is closed is a section heading
- **WHEN** `- item`, a blank line, `para`, a blank line, `  ## H`, a blank line and `more` are
  parsed, and again with `---` in place of `para`
- **THEN** `- item` holds nothing, `  ## H` is a root heading, and `more` is its child: a
  column-0 block closed the list before the heading line

#### Scenario: A heading line is held by the outer item it reaches
- **WHEN** `- a`, `  - b`, a blank line and `  ## H` are parsed
- **THEN** `  ## H` is a paragraph child of `- a`: short of `  - b`'s content column, at
  `- a`'s
