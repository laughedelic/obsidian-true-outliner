## ADDED Requirements

### Requirement: A payload crossing encoding regimes re-encodes as a whole subtree
When a subtree payload is inserted into a destination whose encoding regime differs from its
own — a heading-rooted payload into a list scope, or a list-rooted payload into a heading
scope — the payload SHALL be re-encoded as a UNIT: the root's target encoding determines the
regime, and every descendant SHALL be re-encoded relative to that root, preserving the payload's
own internal relative nesting exactly. Descendants SHALL NOT retain their source regime while
the root changes.

The rule SHALL live at the single shared re-encoding call site, not in a parallel branch beside
it.

#### Scenario: A heading section pasted into a list re-encodes throughout
- **WHEN** a heading with paragraph and nested-list descendants is pasted inside a list scope
- **THEN** the whole subtree lands under one consistent encoding, with its internal relative
  nesting unchanged — no descendant keeps an encoding that contradicts its new root

#### Scenario: A list subtree pasted into a heading section re-encodes throughout
- **WHEN** a list item with nested children is pasted into a heading's section
- **THEN** the same rule applies in the other direction, with internal relative nesting
  preserved

#### Scenario: A same-regime paste is unaffected
- **WHEN** a payload is pasted into a destination of the same encoding regime
- **THEN** the existing re-indentation behavior applies unchanged
