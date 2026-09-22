## ADDED Requirements

### Requirement: Boundary separation is judged on the kind the re-parse will read
The boundary normalization every operation runs SHALL choose each seam's separator from the kind
the node's lines PARSE AS where they are written, not from the kind the tree holds for them.

The two differ wherever an operation has moved a node's column. `hr`, `quote`, `callout`, `html`
and an ATX heading open a block only within three columns of the left margin — `HR_RE`,
`QUOTE_RE`, `CALLOUT_RE`, `HTML_OPEN_RE` and `ATX_RE` are all written `^ {0,3}` — and a setext
heading carries that anchor on its UNDERLINE rather than on its first line. `code` and `table`
have no such limit. Normalization runs on the TREE and encoding runs after it, so a node a
re-encode has pushed past that margin is separated as the kind it was and read back as the kind
its new column makes it. Measured, a `quote` needs no separator before a paragraph and the
paragraph it becomes at column 4 does: the two nodes come back as one, and the payload the
operation inserted is a node short.

This rule SHALL NOT widen any separation beyond what the parse requires. It both adds and removes
separators, and for one reason in both directions: the rule that applies is the rule for the node
the document will contain. Where that node claims the line below it and the tree's kind did not,
a separator is added; where the tree's kind claimed a line the written kind does not — an `html`
block's unconditional separator below a node that is no longer an HTML block — the separator is
not written.

What a demoted line becomes SHALL be read off the line rather than assumed to be a paragraph.
`LIST_ITEM_RE` carries no margin, so a rule spelled `- - -` or `* * *` is an `hr` at column 3 and
a LIST ITEM at column 4, where `---` is a paragraph; a list item claims nothing and needs no
separator. Treating every demoted line as a paragraph writes a blank line for a node that is not
there.

#### Scenario: A quote re-indented into a heading scope keeps the node below it
- **WHEN** a payload whose last root is a quote is inserted before a tab-indented paragraph in a
  heading's children, so the quote is written at column 4
- **THEN** a blank line stands between the quote's line and that paragraph, and the result holds
  both payload nodes and the section's own paragraph

#### Scenario: A separator that described a block the document no longer contains is not written
- **WHEN** a payload ending in an HTML block is re-encoded at a list item's child column and the
  next sibling is a list item
- **THEN** no blank line is written between them, and the re-parse reads the same nodes as it
  would with one

#### Scenario: A rule spelled with a marker becomes a list item, not a paragraph
- **WHEN** a payload ending in `- - -` is re-encoded past the margin above an existing node
- **THEN** no blank line is written on either side of the rule, every node survives, and the
  rule's line re-parses as a list item

#### Scenario: A seam inside the margin is unchanged
- **WHEN** the same payload lands in a scope whose content sits at column 0
- **THEN** the quote is still a quote, no separator is added, and the encoding is byte-identical
  to what the rules produced before this requirement
