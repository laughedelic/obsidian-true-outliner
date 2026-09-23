## ADDED Requirements

### Requirement: A moved node is written in one indentation
When indent or outdent re-encodes a node for its destination without converting its kind, every
line the node owns — its continuation lines and its whole subtree — SHALL be written with the
destination's indentation characters in place of the node's own first-line indentation, wherever
that line opens with it. The first line takes the destination's indentation string, and the lines
below it SHALL NOT be re-spelled in a different unit.

A width delta alone does not say which characters to write: it is spelled in spaces, so a node
indented with a tab came back with a tab on its first line and spaces on every other line, at the
right columns and in two indentations.

The substitution SHALL NOT move any line to a different column than a shift by the width delta
would. Where the destination prefix followed by the rest of a line's indentation does not reach
that column — a tab after the prefix re-expands from where the new prefix ends — or where it would
put a space in front of a tab the line did not already have one in front of, the line SHALL be
shifted by the width delta instead.

#### Scenario: A tab unit reaches the continuation line
- **WHEN** `- foo` / `  bar` is indented under `- top` with a tab as the destination's
  indentation
- **THEN** the result is `\t- foo` / `\t  bar`, and the continuation line's column is the item's
  content column

#### Scenario: A space unit is unchanged
- **WHEN** the same node is indented with two or four spaces as the destination's indentation
- **THEN** the continuation line opens with the same spaces, exactly as a shift by the width would
  write it

#### Scenario: The subtree takes the same characters
- **WHEN** a node with a continuation line and a child with its own continuation line is indented
  into a scope whose siblings are indented with a tab
- **THEN** every one of those lines opens with the tab, followed by what the source wrote after
  the node's own indentation

#### Scenario: A line that the swap would move falls back to the width
- **WHEN** a node whose continuation line is indented with a tab is indented by two spaces
- **THEN** the continuation line is written `\t  bar`, at the column the width delta asks for,
  rather than `  \tbar`, whose tab re-expands two columns short

#### Scenario: An outdent restores the node
- **WHEN** a node indented with a tab is outdented back to the column it came from
- **THEN** every line it owns is restored byte-identically
