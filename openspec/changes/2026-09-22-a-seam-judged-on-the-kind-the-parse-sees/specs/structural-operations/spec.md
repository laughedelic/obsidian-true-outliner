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

This rule SHALL NOT widen any separation beyond what the parse requires. The demoted kind is
`paragraph`, which claims more than any other kind, so the same reading that adds a separator
where the re-parse would merge removes one wherever the rule that asked for it described a block
the document no longer contains — an `html` block's unconditional separator below a node that is
an HTML block no longer.

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

#### Scenario: A seam inside the margin is unchanged
- **WHEN** the same payload lands in a scope whose content sits at column 0
- **THEN** the quote is still a quote, no separator is added, and the encoding is byte-identical
  to what the rules produced before this requirement
