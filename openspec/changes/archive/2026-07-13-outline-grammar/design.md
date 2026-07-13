## Context

editor-core proved the dispatch path through the public `Editor` API. The grammar needs
keypress-level interception (Tab must beat Obsidian's default indent inside lists), which
is exactly what `registerEditorExtension` + `Prec.highest` keymaps exist for — the
proven pattern from obsidian-outliner/zoom, here backed by a real tree model. The split
operation belongs in the mapping core (it's a tree op with encoding consequences), not in
keymap glue.

## Goals / Non-Goals

**Goals:**

- Outline mode feels like Workflowy/Logseq for the core five bindings; stock editor
  everywhere else, byte-for-byte.
- `splitNode` with the full property-test discipline.
- One CM6 transaction per keystroke op; `userEvent`-annotated; single undo step.

**Non-Goals:**

- No enforcement filter, node selection, Backspace/Delete merging, or fold/zoom yet.
- No configurable keymap (settings for rebinding come with the broader keymap layer).

## Decisions

### D1. Mode check per keypress via `editorInfoField`, no compartments

Each binding resolves the view's file through the public `editorInfoField` state field
and asks the mode registry; off-mode it returns `false` so CM6 falls through to stock
behavior. This avoids compartment-reconfiguration plumbing entirely (no state to sync on
toggle) at the cost of a set lookup per keypress — negligible, and the toggle takes
effect instantly in open editors.

### D2. Grammar dispatches through CM6, not `Editor`

Keymap handlers get the `EditorView`; ops convert line edits to offset `ChangeSpec`s via
`state.doc.line()` and dispatch once with `userEvent: 'input.structure'` (or
`'delete.structure'`/`'move.structure'`), selection from `OpOutput.cursor`. This is the
transaction shape the future enforcement filter will see, so the grammar becomes its
first integration test. The palette commands keep their `Editor.transaction` path — two
thin adapters over the same core.

### D3. Split semantics (mapping-core op)

`splitNode(doc, nodeId, {line, ch})` — position relative to the document:

- Only structural kinds split (paragraph, list item); headings and atoms reject
  (`cannot-split`): splitting a heading is section surgery, not node grammar (Enter on a
  heading creates an empty *paragraph child* instead — grammar-level rule, not an op).
- The node's text divides at the cursor; text before stays, text after (possibly empty)
  becomes a NEW SIBLING of the same kind immediately after, children stay with the
  ORIGINAL node (Workflowy semantics: children follow the upper half's identity...
  actually children follow the *lower* half in Workflowy; we keep children on the
  original/upper node in v1 — simpler encoding, revisit with real use).
- List item: new item gets the same marker style at the same indent (ordered runs
  renumber). Paragraph: blank-line separation inserted per boundary rules.
- Cursor lands at the new sibling's content start.
- Same guarantees: closure, minimal edits, typed rejections; property tests extend the
  existing suites (split∘undo, split-then-reparse, generated positions).

### D4. Shift-Enter = continuation line, encoded per node kind

Inside a list item: newline + indent to the item's content column. Inside a paragraph:
plain newline (markdown continuation line). In both cases the result re-parses as the
SAME single node (multiline) — asserted by a property test in the library terms (text
surgery is done by the grammar, but the invariant is checked via parse).

### D5. Keymap registration shape

One `Prec.highest(keymap.of([...]))` extension array returned by a factory that takes
the plugin (for the registry) — registered once in `onload` via
`registerEditorExtension`. Pure handler logic (`grammarTransaction(state-text, cursor,
binding, registry-check)`) lives in a testable module; the CM6 wrapper is thin.

## Risks / Trade-offs

- [Tab capture surprises users inside tables/code atoms] → handlers no-op (return false)
  when the cursor is on an atom's interior lines except for whole-atom indent on its
  first line; table cell Tab keeps stock behavior.
- [Enter-splits-node surprises on headings] → heading Enter creates an empty paragraph
  child below the heading line (documented; revisit with feedback).
- [Split children-stay-up semantics may feel wrong to Workflowy users] → isolated in the
  op; flipping to children-follow-lower is a contained change; log for dev-vault
  verification.
- [CM6 type versions drift from Obsidian's bundled CM6] → types-only dev deps, externals
  at build; runtime always uses Obsidian's instances.

## Open Questions

- Should Enter at the very start of a node create an empty sibling ABOVE (Logseq
  behavior) instead of splitting with empty upper half? v1: split semantics uniformly;
  revisit in dev-vault verification.
