## ADDED Requirements

### Requirement: A provisional position carries its destination scope's indentation

Where a split opens a provisional position instead of materializing a node — the end-of-node
case whose destination scope's kind has no empty encoding — the line the anchor points at
SHALL carry the indentation that scope requires, by the same indentation rule every other
operation uses to place a node at a destination, and the anchor SHALL point after that
indentation rather than at column 0.

The scope is the one the widened gap already serves: the CHILD scope for a node that has
children, and for a heading; the node's own level otherwise. For a destination at the top
level, or directly under a heading, the required indentation is empty and the operation's
output is byte-identical to a plain blank line. For a destination inside a list item it is
that item's own content indentation, which is what makes text typed there parse as a node in
the intended scope.

Without it, a provisional position whose destination lies inside a list item materializes
outside it: text typed at column 0 after a list item starts a new top-level block, which
places the new node at the wrong depth AND detaches the item's existing children, since they
then follow a top-level sibling instead of the item.

Everything else about a provisional position is unchanged: the keypress SHALL still leave the
node count untouched, the position SHALL still be blank-separated or adjacent exactly as
before, and it SHALL still be removable in full — indentation included — by the
undo-on-abandon rule, leaving no trace in the file.

#### Scenario: A position inside a list item materializes as that item's child
- **WHEN** a list item that has a paragraph child is split at the end of its own text, and a
  character is then typed at the resulting anchor
- **THEN** the typed text becomes the item's new FIRST child, placed before the existing
  paragraph child, and that existing child remains a child of the same item

#### Scenario: A top-level position is byte-identical to before
- **WHEN** a childless top-level paragraph is split at the end of its text
- **THEN** the widened gap's lines carry no indentation at all and the anchor sits at column
  0, exactly as with no destination indentation to apply

#### Scenario: A position beside an indented paragraph stays at its level
- **WHEN** a paragraph that is itself a child of a list item is split at the end of its text,
  and a character is typed at the resulting anchor
- **THEN** the typed text becomes a sibling of that paragraph, at the same depth, still inside
  the list item

#### Scenario: Abandoning removes the indentation too
- **WHEN** a provisional position carrying destination indentation is abandoned
- **THEN** the document is byte-identical to what it was before the keypress, with no
  whitespace-only line left behind

**Covered by**: `tests/split.test.ts` (the indented provisional position for each destination
scope, and the re-parse of the materialized node including its siblings' attachment);
`tests/undo-on-abandon.test.ts` (byte-identical abandonment of an indented position);
`e2e/specs/30-keyboard-grammar.e2e.ts` (the live keypress-then-type sequence on a list item
with a paragraph child).
