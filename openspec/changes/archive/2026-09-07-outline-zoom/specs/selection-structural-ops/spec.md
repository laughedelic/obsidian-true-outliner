## ADDED Requirements

### Requirement: An operand that would leave the zoom scope is refused
While a zoom scope is active (`outline-zoom`), a structural operation SHALL be refused — with no
document change and no selection change — when its result would place any node outside the zoom
root's whole subtree.

The check SHALL be made over the RESOLVED OPERAND, not over a single node: an operation SHALL be
refused when ANY covered root of the operand is the zoom root itself, and an outdent SHALL be
refused when any covered root is a direct child of the zoom root. A multi-root operand whose
first root is safe and whose last root would escape SHALL be refused as a whole; the operation
SHALL NOT be applied to the roots that happen to be safe.

The check SHALL live at the single site where the operand and the after-state are resolved, so
the keyboard and the command-palette entry points cannot disagree about it, exactly as they
cannot disagree about the operand itself.

The refusal SHALL carry a typed rejection reason of its own, distinct from the reasons the
operations already produce for their own algebra, and SHALL surface through the existing
rejection-feedback path. An operation the algebra rejects for its own reason SHALL keep that
reason rather than acquiring this one.

An operand lying wholly inside the zoom root's subtree SHALL be unaffected: indent, outdent
between the scope's own levels, move up and move down all behave exactly as they do with no zoom.

#### Scenario: Outdenting a direct child of the zoom root is refused
- **WHEN** the selection covers a direct child of the zoom root and outdent is invoked
- **THEN** the document is unchanged and the cue names the zoomed view as the reason

#### Scenario: A multi-root operand is refused as a whole
- **WHEN** the selection covers three sibling subtrees that are direct children of the zoom root
  and outdent is invoked
- **THEN** none of the three moves — the operation is refused rather than applied to a subset

#### Scenario: An operation on the zoom root itself is refused
- **WHEN** the operand resolves to the zoom root and any of indent, outdent, move up or move down
  is invoked
- **THEN** the document is unchanged and the cue is shown

#### Scenario: Both entry points agree
- **WHEN** the same operation is invoked at the same selection from its keyboard binding and from
  the command palette
- **THEN** both are refused with the same reason, or both apply

#### Scenario: An operand inside the scope is untouched
- **WHEN** the selection covers subtrees strictly inside the zoom root's subtree and any
  structural operation is invoked
- **THEN** it applies exactly as it does with no zoom, including its after-state selection

#### Scenario: An algebra rejection keeps its own reason while zoomed
- **WHEN** an operation inside the scope is rejected by its own algebra — for instance an indent
  with no previous sibling
- **THEN** the cue is that operation's own message, not the zoom-scope one
