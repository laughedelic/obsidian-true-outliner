## ADDED Requirements

### Requirement: Fallback indent unit for brand-new indentation
When a structural operation must materialize indentation with no existing evidence in
the document to infer a unit from (no destination-sibling list item to copy
whitespace from, and no other indented list item anywhere in the document —
`destinationIndent`'s existing-document-inference steps both come up empty), the
operation SHALL accept an optional caller-supplied fallback indent unit and use it
instead of an unconditional default. When no fallback is supplied, the existing
two-space default SHALL still apply, so this is purely additive: no existing behavior
changes unless a caller opts in. Existing-document inference SHALL still take priority
over the fallback whenever it has evidence to act on — the fallback only ever governs
the true no-evidence case.

#### Scenario: No fallback supplied keeps the existing two-space default
- **WHEN** a node is indented under a list-item parent with no existing indented list
  item anywhere in the document, and no fallback indent unit is supplied
- **THEN** the new indentation is two spaces, exactly as before this requirement existed

#### Scenario: A supplied fallback governs brand-new indentation
- **WHEN** the same indent is performed with a caller-supplied fallback of a tab
  character (or a specific space width)
- **THEN** the new indentation uses that exact unit instead of the two-space default

#### Scenario: Existing document indentation still wins over the fallback
- **WHEN** the document already has an indented list item using tabs elsewhere, and a
  node is indented under a list-item parent with no fallback OR a spaces-based
  fallback supplied
- **THEN** the new indentation still infers tabs from the existing document content —
  the fallback never overrides an already-established indentation style
