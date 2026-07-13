## Why

editor-core deliberately shipped the structural ops as palette commands; an outliner lives
or dies by its keyboard feel. This change makes outline mode feel native: Tab/Shift+Tab
indent and outdent, Alt+Up/Down move nodes, and Enter/Shift+Enter follow node grammar
(new sibling vs. line within the node) — all as CodeMirror extensions inside the standard
markdown view (the architecture's core bet, registerEditorExtension, 100% public API).
It also adds the one mapping-core operation the grammar needs: node split.

## What Changes

- **Node split operation** in the mapping core: splitting a node at a cursor position
  yields two siblings of the same kind (list item → two items with markers; paragraph →
  two separated paragraphs), with the same closure/minimal-edit guarantees and property
  tests as the existing ops. Split of atoms is rejected (typed) — atoms are opaque.
- **CM6 keyboard grammar** registered via `registerEditorExtension`, active only when the
  view's file has outline mode on (checked per keypress via the public `editorInfoField`;
  no reconfiguration machinery). High-precedence bindings:
  - `Tab` / `Shift-Tab` → indent / outdent node at cursor
  - `Alt-ArrowUp` / `Alt-ArrowDown` → move node up / down
  - `Enter` → split the node at the cursor (new sibling below; at end-of-node this is
    "create empty sibling")
  - `Shift-Enter` → newline *within* the node (continuation line at the node's content
    column — multiline nodes)
  - Outside outline mode every binding returns false and the editor behaves exactly as
    stock Obsidian.
- Dispatch path: ops run against the CM6 state directly (parse buffer → op → minimal
  edits → one transaction with a `userEvent` annotation → one undo step; selection placed
  from `OpOutput.cursor`). Rejections keep the transient Notice cue from editor-core.
- Note on hotkey policy: these are CM6 editor behavior bindings scoped to outline mode
  (the mechanism obsidian-outliner et al. use and reviewers accept), not `addCommand`
  default hotkeys, which remain unset per guidelines.

Out of scope (subsequent changes): transactionFilter enforcement (selection/typing
invariants, node selection model), Backspace/Delete boundary grammar, fold/zoom,
decorations.

## Capabilities

### New Capabilities

- `outline-keyboard-grammar`: the outline-mode key bindings — scope (mode-gated,
  per-keypress check, stock behavior otherwise), each binding's node semantics, single
  transaction/undo step, cursor placement, and rejection behavior.

### Modified Capabilities

- `structural-operations`: add the node split operation (same Result/typed-rejection
  contract, closure and minimal-edit properties; atoms reject).
- `outline-mode`: mode now gates the keyboard grammar in addition to palette commands
  (the "commands inactive outside outline mode" guarantee widens to "editor behavior is
  stock outside outline mode").

## Impact

- Mapping core: new `splitNode` op in `src/ops.ts` + property/unit tests (existing specs
  gain a delta requirement; no behavior of existing ops changes).
- Plugin: new `src/plugin/grammar.ts` CM6 extension; `main.ts` registers it;
  `@codemirror/state`, `@codemirror/view` as dev deps (types only — externals at build).
- editor-core's palette commands remain (accessibility / discoverability path).
- Manual dev-vault verification extends the editor-core protocol; same human-in-the-loop
  constraint.
