## Why

`closure.test.ts` compares `result.value.doc` against `parse(encode(result.value.doc))`, but
`finalize` BUILDS `result.value.doc` by re-parsing that same encoding — so the assertion is true
by construction and can never fail. Every operation that emits markdown re-parsing to a different
tree than its own algebra produced is invisible to the suite.

Three pre-existing bugs were sitting in that blind spot (docs/research/04-open-questions.md Q33).
One is fixed (PR #51); the remaining two are stacked on top of this change. The technique that
found all of them is the reusable part: assert what an operation PROMISES, not that it
round-trips. The most load-bearing promise a structural operation makes is the subject's
resulting DEPTH, and nothing asserts it today.

## What Changes

- A new property suite asserts each structural operation's depth contract for a NON-HEADING
  subject: indent moves it one level deeper, outdent one level shallower, move up leaves its
  depth unchanged. Depth is measured on the RESULT tree — the re-parsed one the caller receives —
  which is precisely what closure cannot see.
- Coverage spans both the single-node forms (`indent`, `outdent`, `moveUp`) and the group forms
  (`indentGroups`, `outdentGroups`, `moveGroupsUp`). The group forms are not covered transitively:
  `applyGroups` composes every root's surgery and re-parses ONCE at the end, a path the one-root
  case never reaches, so each covered root carries its own depth assertion.
- Subjects are tracked across the re-parse by the `L<n>` labels `tests/group-oracle.ts` already
  generates. Node ids do not survive `finalize`, and line mapping is exactly what a relocation
  destroys.
- Move down is deliberately excluded. It violates the contract today — a node moving down past a
  paragraph is absorbed into the paragraph's list on the re-parse — measured on the labelled
  generator at 25 violations in 2000 single-node attempts and 82 in 427 accepted group operands.
  Its depth assertion arrives with the fix that makes it hold, stacked on this change, so this
  one lands green rather than red.
- Headings are out of scope: their algebra is a level shift whose tree depth follows the
  surrounding heading context rather than the operation, so `+1 / −1 / 0` is not their contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structural-operations`: adds a requirement stating the subject's resulting depth as an
  observable guarantee of the RESULT tree, for the non-heading forms of indent, outdent and move
  up, in both their single-node and group shapes. The existing algebra requirements say where a
  node lands in the tree the operation builds; this states what the caller actually receives after
  the encoding re-parses, which is the property the closure requirement cannot check.

## Impact

- Tests only: a new file under `tests/`, reusing `tests/group-oracle.ts`. No `src/` change.
- No behavioural change to the plugin; the suite gains coverage of a class of bug it was
  structurally blind to.
- Two follow-up changes stack on this one, each fixing a bug this technique exposes: move down's
  absorption (which also unblocks the deferred move-down assertion) and outdent's ordered-run
  number hijack.
