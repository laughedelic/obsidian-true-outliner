## MODIFIED Requirements

### Requirement: One decision procedure places every structural operation's caret
A single pure decision procedure SHALL answer, for every structural operation: given the
operation, the document before and after it, the operation's own structural anchor, and
the pre-operation selection mapped forward — where the caret goes.

This procedure answers the CARET question, and a structural dispatch asks it exactly when it
has a caret to place: when the operand `selection-structural-ops` resolved was a caret or a
character range within one node's own content. A dispatch whose operand was a BLOCK COVER
states a selection instead, taken from that capability's rule, and does not consult this
procedure at all. The boundary is stated here rather than left implicit because a procedure
that answers "where does the caret go" for a dispatch that has no caret is the two-answers-to-
one-question shape this capability exists to remove; and because the alternative — collapsing
a block selection to a caret on every structural key — would silently discard the selection
the user built.

Whether that caret must be RECORDED is a separate question with its own owner, stated
below: it is decided from the transaction, not from this procedure's inputs. The two are
deliberately not answered in one place — this procedure sees a single caret and the single
position it was mapped from, while the recording decision compares whole SELECTIONS, and a
non-empty pre-operation selection makes those two comparisons disagree. Restating the rule
here in weaker terms would reintroduce exactly the two-answers-to-one-question problem this
capability exists to remove. That the recording decision already compares whole selections is
also why a dispatched COVER needs no recording rule of its own.

Every dispatch site SHALL obtain its caret from that procedure and SHALL NOT re-derive
it: the outline keyboard grammar, the command-palette commands, and the edit-enforcement
rewrite path. No operation, and no CodeMirror adapter, SHALL decide a caret of its own.
Adapters convert between the procedure's line/column positions and character offsets, and
supply facts the procedure cannot compute (the pre-operation selection head mapped
forward through the change set); they SHALL NOT add rules.

The procedure SHALL distinguish four cases, and nothing else:

- **Derived** (indent, outdent): the pre-operation position mapped forward, used only when
  it is caret-addressable, otherwise the subject rule below.
- **Subject** (move up/down): the operation's subject node, at its content start. Also the
  fallback for a derived dispatch whose mapped position is not addressable.
- **Exact** (split, merge, structural paste): the position the operation itself computed —
  a join point, a split point, the end of an inserted run — which only the operation
  knows.
- **Deletion**: the convention stated below.

This procedure SHALL NOT decide which positions are addressable; that is
`content-space-caret`'s question, and this procedure consumes its answer.

#### Scenario: Both entry points give the same caret
- **WHEN** the same operation is invoked from its key binding and from the command
  palette, on the same document with the same caret
- **THEN** the resulting caret is identical, because both read it from the same procedure

#### Scenario: The enforcement rewrite path uses the same procedure
- **WHEN** a user edit is rewritten into a structural deletion, merge or paste
- **THEN** the rewritten transaction's caret comes from the same procedure that serves the
  keyboard grammar, not from a rule local to the enforcement layer

#### Scenario: Adding a rule has one place to add it
- **WHEN** a new structural operation is introduced
- **THEN** it states which of the four cases it belongs to and gains a caret with no new
  placement logic at its dispatch site

#### Scenario: A block-cover dispatch places no caret
- **WHEN** a structural operation runs over a block cover
- **THEN** the dispatch states the cover of the moved subtrees and this procedure is not
  consulted — no caret is computed and none is dispatched
