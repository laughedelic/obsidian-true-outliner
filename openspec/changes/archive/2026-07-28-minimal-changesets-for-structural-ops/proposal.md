## Why

Structural operations dispatch **whole-region line replacements**: indenting one list
item rewrites every line of its subtree, merging two paragraphs rewrites the whole span.
The resulting document is correct, but the change set is far wider than the actual edit,
and CodeMirror derives cursor positions by mapping through change sets. When a position
falls inside a replaced range, mapping collapses it to the end of the whole replacement.

Two live consequences, both confirmed in a real vault:

- **Repeated undo/redo moves the cursor to the end of the rewritten region.**
  `fix-redo-cursor-after-structural-ops` fixed the first redo by recording the
  operation's cursor in history, but that channel provably cannot reach a second undo
  (docs/research/04 Q21) — it left the gap documented, for this change to close properly.
- **Tab moves the cursor to the start of the node** instead of keeping the user's place
  in the text, because the operation has to state an explicit cursor — there is no
  meaningful position to map to inside a wholesale replacement.

Both dissolve if the change set describes only what actually changed. With minimal
changes the mapped position IS the semantically correct one, in both directions, at any
undo depth — no history bookkeeping needed.

## What Changes

- **Structural operations emit minimal, character-level change sets.** Line-range edits
  are narrowed before dispatch: unchanged leading and trailing lines are excluded, and
  within a changed line the common prefix and suffix are trimmed. Verified standalone
  for the three representative shapes:

  | op | today | minimal |
  |---|---|---|
  | merge two paragraphs | replace `[0,25)` | `delete [11,13)` |
  | indent a node with a child | replace `[0,37)` | `insert "\t" @8`, `insert "\t" @16` |
  | outdent | replace whole region | `delete [8,9)`, `delete [17,18)` |

  Per-line trimming is required, not just a whole-region trim: a single prefix/suffix
  trim is minimal enough for a merge but not for indent, which changes leading
  whitespace on several lines at once.
- **Indent and outdent stop setting an explicit cursor**, letting the natural mapping
  preserve the user's column. Operations whose cursor is genuinely semantic — a merge's
  join point, a split point — keep setting it.
- **The cursor re-assertion mechanism is removed**, along with its `userEvent` and its
  plugin-own classification entry. It exists only to work around the mapping being
  wrong; once it is right, the mechanism is dead weight.
- **The known-limitation tests are replaced by correctness tests** — cursor correct at
  every undo/redo depth, rather than pinned-wrong at depth two.
- **The resulting document must be byte-identical** to what the wide change sets
  produce. That is the property test, over generated trees.

## Capabilities

### New Capabilities

- `minimal-change-dispatch`: how a structural operation's line-range edits become the
  narrowest character-level change set that produces the same document, and the cursor
  guarantees that follow from it.

### Modified Capabilities

- `structural-history-integration`: the known limitation (repeated undo/redo cycles) is
  removed, and the cursor re-assertion requirements are retired — correctness now comes
  from the change sets themselves rather than from recording cursors into history.
- `transaction-classification`: the cursor re-assertion `userEvent` is removed from the
  plugin-own set.
- `outline-keyboard-grammar`: indent and outdent no longer specify an explicit resulting
  cursor; the cursor keeps its position within the node's content.

## Impact

- **Code**: `src/plugin/dispatch.ts` (`editsToChanges` — the narrowing), `src/ops.ts` /
  `src/plugin/grammar.ts` (indent/outdent cursor), `src/plugin/history-cursor.ts`
  (removed), `src/classify.ts` (userEvent removed), `src/plugin/main.ts`
  (extension unregistered).
- **Blast radius**: `editsToChanges` is shared by the keyboard grammar, the enforcement
  rewrites, and the palette commands. Documents are unchanged, but *what other
  CodeMirror extensions observe as changed* is not — decorations, Obsidian's own
  diffing, and any other plugin see narrower ranges. This needs a real-vault pass on a
  current Obsidian, not just the harness.
- **Risk to manage**: the enforcement layer computes facts from change spans
  (`changedLineSpans`, `deletesLineBoundary`). Those are derived from *incoming*
  transactions, not from our own dispatches, so they should be unaffected — worth
  confirming explicitly rather than assuming.
- **Prerequisite**: the e2e harness should be running an Obsidian bundling
  `@codemirror/commands` ≥ 6.10.2, or the redo scenarios cannot fail for the right
  reason (Q21). The harness now prefers `latest-beta` when credentials or cache allow.
