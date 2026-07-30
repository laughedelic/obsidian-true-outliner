## Why

Two problems, one of which was the other's only justification.

**Structural keys run inside Obsidian's nested table-cell editor.** With the caret on a
table's source lines in outline mode, Alt+ArrowUp raised our own "Nothing above to move
past." toast and nothing moved. `makeHandler` gated only on `modes.isOutline(path)` via its
own inline `editorInfoField` lookup; inside a cell that field resolves to the SAME outer
note, so the gate passed and `planKey` was handed the CELL's tiny document. The cell text
`a` parses as one paragraph with no previous sibling, hence the rejection. Only DOM
ancestry separates the two views, which is what `outlinePathOf` carries via
`isNestedEditor` — the motion handlers already used it, `makeHandler` never did.

The report named Tab, Shift+Tab, Alt+Arrow and Enter. `makeSelectAllHandler` has the same
defect and was NOT in the report: measured in a cell reading `- word`, Mod-A selected
`"word"` — our ladder's content rung stripping the user's *literal* `- ` as if it were a
marker — against stock's `"- word"`. This is the third recurrence of the class (motion
handlers, Q27; structural keys; select-all).

**The Alt+Arrow binding should not exist.** The report asked what SHOULD happen for a
structural key in a cell, and flagged the residue: declining leaves Alt+Arrow unable to
move a table while the bound command can. Researching the binding's origin dissolved the
question rather than answering it. `2026-07-13-outline-grammar/design.md` justifies the CM6
keymap specifically — "Tab must beat Obsidian's default indent inside lists". That argument
is real for Tab/Enter/Shift+Enter and does not extend to move: measured on 1.13, Alt+Arrow
is unbound in Obsidian and does nothing, and core's own `editor:swap-line-up`/`-down` ship
with no default hotkey. CodeMirror's `defaultKeymap` does bind Alt+Arrow to
`moveLineUp/Down`, but Obsidian does not install it — so the binding claimed a free key on
a generic-CM6 assumption that was never recorded as a decision. Meanwhile `hotkeys.json`
committed in that same change bound the COMMANDS to Mod+Shift+Arrow: two gestures for one
operation since day one.

## What Changes

- **Every binding in `grammarExtension` gates through `outlinePathOf`.** `makeHandler` and
  `makeSelectAllHandler` lose their inline `editorInfoField`/`isOutline` checks. Declining
  is the right answer for a nested cell: Tab, Enter and Alt+Arrow all have real meaning in
  Obsidian's table editor, and acting on the host node would mean Enter splits the table
  the user is typing into. It also matches the motion handlers and the transaction filter,
  which already decline.
- **Move up/down leave the keymap for a command default hotkey.** `Alt-ArrowUp`/
  `Alt-ArrowDown` are removed from `grammarExtension`; `move-node-up`/`move-node-down`
  ship `Mod+Shift+ArrowUp`/`Mod+Shift+ArrowDown`. That is the dominant convention —
  obsidian-outliner and obsidian-bullet ship exactly these as `addCommand` defaults, Logseq
  binds `mod+shift+up/down` on macOS — and it collides with no Obsidian core command.
  `planKey` KEEPS its move cases so a future configurable-keymap layer can bind them
  without reintroducing a second placement path.
- **The keymap declines in a cell while the hotkey still acts on the host node.** This
  resolves the design question the report raised, toward the behaviour it wanted: the
  command path resolves the host note through the public `Editor` API regardless of focus,
  so moving a table while editing one of its cells works.
- **`obsidianmd/commands/no-default-hotkeys` is disabled for `src/plugin/main.ts` alone**,
  in `eslint.config.js` with the reasoning, because the ruleset ships
  `eslint-comments/no-restricted-disable` and forbids inline disables of its own rules.
- **`test-vault/.obsidian/hotkeys.json` loses its `move-node-up`/`move-node-down`
  entries**, so the e2e suite exercises the shipped default rather than a custom binding
  that would mask a broken one.

## Non-Goals

- **No change to Tab/Shift+Tab/Enter/Shift+Enter registration.** They must beat stock
  Obsidian behaviour at `Prec.highest` and stay in the keymap.
- **No default hotkey for indent/outdent.** Tab/Shift+Tab already cover them in-editor.
  Symmetry is arguable but was not part of the reported problem.
- **No structural guard at the `keymap.of([...])` site.** Wrapping every `run` so a new
  handler cannot opt out by construction is the obvious answer to a class that has now
  recurred three times, but it is a separate refactor with its own risk; the invariant is
  recorded in `outlinePathOf`'s doc comment instead.
- **Not the table-splitting bug.** Moving a sibling paragraph PAST a table splits it —
  filed separately, and verified byte-correct at the ops and dispatch layers, so it points
  at Obsidian's live table widget rather than at this code.

## Impact

User-visible: **Alt+Arrow no longer moves nodes; Mod+Shift+Arrow does, out of the box, and
is now rebindable in Settings → Hotkeys.** Users who had bound the commands themselves keep
their binding — a user hotkey always overrides a plugin default.

Caret placement is unaffected. `planKey` plans move as `{ kind: 'subject' }` and `runOp`
passes `useMappedCursor = false` → `{ kind: 'subject' }`; both reach the same `planCaret`.
This migration is caret-neutral BY CONSTRUCTION, which was not true before
`caret-placement-policy` — that change's own record notes the palette path had drifted. In
the other order this would have been a behaviour change.

Affected specs: `outline-keyboard-grammar` (bindings and the nested-editor gate),
`editor-structural-commands` (the default hotkey and its guideline departure),
`outline-mode` (grammar-bound key list), `e2e-verification` (which gesture is exercised).
