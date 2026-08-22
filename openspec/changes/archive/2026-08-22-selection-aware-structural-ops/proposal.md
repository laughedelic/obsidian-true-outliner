## Why

A block selection is not an operand. With a cover spanning several sibling subtrees, Tab
indents exactly one node — the one under the selection's HEAD — and leaves the rest where
they were. Shift+Tab and the move commands do the same. Filed from real-vault use on
2026-07-24 (`docs/research/13-selection-follow-ups.md`, Track 2) with the user's own
framing that it needs real design rather than a quick patch, and left open ever since.

Both entry points ignore the selection by construction, for different reasons:

- `keymap.ts`'s `makeHandler` plans every key except Enter and Shift+Enter from
  `selection.main.head`. That is deliberate — the comment there records why, and the
  gap-line fallback in `caret-policy.ts` exists because a cover's head sits on the trailing
  gap the cover owns — but it means the selection contributes nothing but a position.
- `main.ts`'s `runOp` resolves its target with `nodeAtLine(doc, editor.getCursor().line)`,
  which never sees the selection at all.

The selection machinery to fix it is already shipped and settled. `selection-as-subtree-set`
made an escalated selection a forest of whole subtrees; `node-selection-extension` made
Shift+Arrow build one node per press; `enforce.ts` already turns a cover into per-parent
groups (`coverGroupsOf` → `groupRootsByParent`) and hands them to `deleteSubtreeGroups`.
Deletion over a multi-root cover works today. Indent, outdent and move are the operations
that never caught up — which is also why the gap reads as a bug rather than a missing
feature: selecting three items and pressing Tab visibly moves one of them.

## What Changes

- **A structural operation invoked with a block selection acts on every covered subtree**,
  not on the node at the head. The operand is the selection's covered roots, grouped by
  parent — the same shape multi-root deletion already consumes.
- **A group operation preserves the relative order of its covered roots**, at every cover
  shape. Subject to that, **the group algebra is the sequential composition of the existing
  single-node algebra**: the resulting tree is what applying the single-node operation to each
  covered root in turn produces (document order for indent, outdent and move up; reverse
  document order for move down). No new per-kind rules are introduced — heading level-shift and
  non-heading reparenting keep their existing meanings, and a mixed-kind sibling run gets each
  root's own rule. Where the two conflict — a composition moves one root at a time, and an
  intermediate tree that markdown cannot encode gets reshaped under the remaining steps — the
  ORDER rule governs. Measured: every such conflict has the composition reversing the run and
  the whole-run result keeping it, 49 of 49.
- **Rejection is atomic.** If any step in that composition rejects, the whole operation
  rejects with that typed reason, the document is unchanged, and one cue appears. Nothing
  is partially applied.
- **Move up and move down additionally require a single sibling run**, rejecting a cover whose
  roots sit under different parents with `cannot-reorder-across-scopes`. Measured during
  planning: a multi-scope reorder moves each group within its own scope and scatters the
  selection rather than moving it, in every accepted case. Indent and outdent carry no such
  restriction — they were measured contiguity-safe at any cover shape.
- **The selection survives the operation.** Where the pre-operation selection was a block
  cover, the dispatch states the cover of the moved subtrees in the result tree, so a run
  of Tab presses keeps acting on the same nodes. Where it was an ordinary caret or a
  within-node character range, the caret rules are exactly what they are today.
- **A single range only.** Multi-cursor keeps declining: the keymap already returns `false`
  on several ranges, and the palette commands gain the matching gate so both entry points
  answer alike.
- **Both entry points, one rule.** The keyboard path (Tab/Shift+Tab) and the command path
  (indent/outdent/move up/move down, including their default Mod+Shift+Arrow hotkeys)
  resolve the same operand and produce the same after-state.

## Capabilities

### New Capabilities

- `selection-structural-ops`: what a structural operation's OPERAND is when the selection
  is non-empty, and what the selection is afterward. One rule, referenced by both entry
  points, in the same shape `caret-placement-policy` already uses for the caret question —
  the alternative is the same rule written twice in two capabilities that can drift.

### Modified Capabilities

- `structural-operations`: indent, outdent, move up and move down gain a group form over a
  forest of covered roots, with the sequential-composition semantics and atomic rejection
  above; an operation's result additionally states the SUBJECT SPAN its subjects occupy in
  the result, so a cover can be recomputed without node identity surviving the re-parse.
- `editor-structural-commands`: each command resolves its target from the selection rather
  than from the cursor line alone, dispatches the resulting cover, and declines under
  multiple ranges.
- `outline-keyboard-grammar`: Tab and Shift+Tab act on the selection's covered roots, and
  the requirement that they target "the node at the cursor line" is amended accordingly.
- `caret-placement-policy`: states its own boundary — the procedure places a caret for a
  dispatch whose operand was a caret or a within-node range, and a block-cover dispatch's
  after-state comes from the cover rule instead. Without this the two capabilities give two
  answers to one question, which is exactly what this one exists to prevent.

## Impact

- `src/ops.ts`: group forms of `indent`/`outdent`/`moveUp`/`moveDown`, and the subject span
  on `OpOutput`. `deleteSubtreeGroups` is the structural precedent to follow.
- `src/enforce.ts`: `coverGroupsOf` is currently private; the operand resolution needs it,
  and one implementation is the point — `groupRootsByParent` is already exported for
  exactly this reason.
- `src/plugin/grammar.ts`: `planKey` gains a cover branch for indent/outdent/move, beside
  the `planOverSelection` branch Enter and Shift+Enter already take.
- `src/plugin/keymap.ts`: `makeHandler`'s `actsOnSelection` set widens past split/continue.
- `src/plugin/main.ts`: `runOp` reads `editor.listSelections()` instead of `getCursor()`.
- `src/caret-policy.ts`: unchanged in its rules; the dispatch sites decide which question
  to ask it.
- Tests: `tests/ops.test.ts`, `tests/closure.test.ts` (the sequential-composition property),
  `tests/grammar.test.ts`, `tests/caret-placement.test.ts`, and
  `e2e/specs/20-structural-commands.e2e.ts` / `30-keyboard-grammar.e2e.ts`.
- `docs/research/13-selection-follow-ups.md`: the Track 2 entry this change closes.

A pre-existing bug in `indent` was found while measuring the operand rules and is fixed
separately in PR #51: `destinationIndent` ignored the destination parent's marker width, so an
indent under an ordered item reported success while changing nothing structurally. This change
rebases on that fix rather than carrying it.

## Out of scope

- **Multi-cursor structural edits.** Several ranges each producing their own structural
  edit in one transaction is its own problem (the edits interact in the document), and the
  current decline is a designed behavior, not an oversight.
- **Enter and Backspace over a selection.** Already handled — the grammar's
  `planOverSelection` and `node-edit-enforcement`'s boundary-crossing deletion rule.
- **Modal block-selection state and Cmd-click cherry-picking**, still parked in Track 2.
- **The single-node algebra itself**, including the two-regime heading/list question, which
  is settled and reused verbatim here.
- **Moving a node into its parent's SIBLING** — out of one scope into the next at the same
  depth, rather than rejecting when a node runs out of siblings. Raised during review of this
  change. It redefines what a MOVE means for a single node (the reorders are currently a
  permutation within one sibling list), is reachable with a bare caret and no selection at all,
  and needs its own destination, encoding and renumbering rules. Best designed after this change
  lands, so it inherits the group operand rather than building a second one. See design.md —
  Open Questions.
- **`insertSiblingHeading`, `splitNode`, `unwrapListItem`, `mergeNodes`**: not commands, and
  not reachable with a block selection as their operand.

## Sequencing

Independent of `paste-heading-section-reencoding`, the other change in flight. It depends
only on capabilities already shipped (`selection-as-subtree-set`, `node-selection-extension`,
`caret-placement-policy`, `minimal-change-dispatch`).
