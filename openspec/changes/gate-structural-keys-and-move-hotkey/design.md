# Design

## Why the file check could not have worked

Obsidian mounts an actively-edited table cell as its own CM6 `EditorView`, and
`registerEditorExtension` installs this plugin's extension into it. `editorInfoField`
resolves to the SAME outer `MarkdownView` in both. So resolving the file and asking
`isOutline(path)` does not merely fail to exclude the nested cell — it is precisely what
ADMITS it, and admits it MORE confidently the more correct the mode logic is. Only DOM
ancestry (`view.dom.closest('.cm-embed-block')`) distinguishes them.

The failure is quiet. `planKey` receives the cell's tiny document, that document parses
fine, and the rejection it produces is indistinguishable from a legitimate one. The
report's own symptom — "Nothing above to move past." on a table's first line — reads as
correct outline behaviour until you notice a hotkey on the same operation works.

This has now happened three times: motion handlers, structural keys, select-all. Each
author wrote a plausible gate. The strongest available answer is to make the gate
unavoidable at the `keymap.of([...])` site — wrap every `run` so a handler cannot opt out by
construction. That is not done here: it is a refactor of every binding with its own risk,
landed alongside a behaviour change it is not needed for. Instead the invariant is written
into `outlinePathOf`'s doc comment with all three measured symptoms attached, and this
document names the refactor as the answer if it recurs a fourth time.

## Why decline rather than act on the host

The report deliberately left this open, noting that declining leaves Alt+Arrow unable to
move a table while the bound command can.

Declining wins on the keys that are not move. Tab, Shift+Tab and Enter all have real
meaning inside Obsidian's table editor — Enter in particular commits a cell. Acting on the
host would mean Enter splits the table the user is typing into. A key cannot sensibly be
gated one way for move and another for split, and a keymap that behaves differently
depending on which structural key you press is worse than one that is uniformly stock in
a context Obsidian owns. It also matches what motion and the transaction filter already do.

The residue the report identified is real but is not a keymap problem. `runOp` reads
`editor.getValue()` through the public `Editor` API, which resolves to the host note
regardless of focus, so the COMMAND path is immune by construction. Moving a table while
editing one of its cells therefore works — through the command. That is the design answer:
the in-editor keys stay stock in a nested context, the commands reach through it. A test
pins it, because the "reach through" half is easy to break invisibly.

## Why the Alt+Arrow binding goes away

The question "what should Alt+Arrow do in a cell" turned out to depend on a binding that
should not have existed, so it is worth recording why it did.

`2026-07-13-outline-grammar/design.md` justifies the CM6 keymap with one argument: **Tab
must beat Obsidian's default indent inside lists**, which requires `Prec.highest` in the
editor and cannot be done with a command. That argument is sound and unchanged for
Tab/Shift+Tab/Enter/Shift+Enter. It was never made for move — move was added to the same
keymap without a separate rationale, and the same commit's `hotkeys.json` bound the
COMMANDS to Mod+Shift+Arrow, so the project has had two gestures for one operation since
day one without ever choosing between them.

Measured on 1.13, Alt+Arrow is unbound in Obsidian: pressing it leaves the buffer
unchanged, and no command is registered on it. Core's `editor:swap-line-up`/`-down` ("Move
line up/down") exist with `defaultHotkeys: null`. CodeMirror's `defaultKeymap` DOES bind
Alt+Arrow to `moveLineUp/Down`, but Obsidian does not install it — so the binding was
claiming a key on a generic-CM6 assumption that does not hold for this host. Nothing
required it to be a keymap entry, and nothing recorded a decision that it should be.

## Whether shipping a default hotkey is allowed

Recorded because it is the most contestable decision here.

"Avoid setting a default hotkey" appears on Obsidian's **Plugin guidelines** page, whose
own preamble states its contents are recommendations, and it is absent from the
**Submission requirements**. `hotkeys?: Hotkey[]` on `Command` is `@public` and not
deprecated. The official lint rule `obsidianmd/commands/no-default-hotkeys` is
`type: "suggestion"` at severity `warn`, and it only inspects `addCommand` — a CM6 keymap
is invisible to it, so the status quo was passing the check by being less visible, not by
being more conservative. `obsidian-outliner` ships `Mod+Shift+ArrowUp/Down` defaults and is
in the community catalogue.

The guideline's substance is collision avoidance and user control. Both are satisfied:
Mod+Shift+Arrow is bound by no Obsidian core command, and a plugin default is fully
overridable in Settings → Hotkeys, which the previous hardcoded keymap entry was not. The
change therefore INCREASES user control while reducing the gesture count from two to one.

## Why Mod+Shift+Arrow specifically

It is what outliner users already have in their fingers. Logseq's keymap binds
`mod+shift+up`/`down` for move-block-up/down on macOS; `obsidian-outliner` and
`obsidian-bullet` ship the same as command defaults. Plain Alt+Arrow matches essentially
nobody. The test vault had these bound by hand from the start — the user's own muscle
memory, recorded in the repo, agreeing with the convention.

Those vault bindings are REMOVED as part of this change. Leaving them would mean the e2e
suite exercised a custom hotkey and stayed green with a broken default.

## Ordering against caret-placement-policy

This change was written before `caret-placement-policy` landed and rebased onto it. The
rebase was textually clean and semantically was not.

`caret-placement-policy` exists so the keyboard and palette paths "cannot diverge" on caret
placement: both call `planCaret`. For move, `planKey` produces `{ kind: 'subject' }` and
`runOp` passes `useMappedCursor = false`, which is also `{ kind: 'subject' }`. The two
paths are identical, so migrating move from one to the other is caret-neutral BY
CONSTRUCTION. Before that change it would not have been — the palette path had drifted,
which is the defect it fixed. In the other order this would have been a silent behaviour
change riding along with a keybinding change.

The clean rebase also hid three breaks, worth naming because textual conflict detection
missed all of them: a new scenario written against the binding being removed; a new
paragraph describing move placement as a property of the bindings, landing directly under
the sentence saying move is not bound; and a new notice-recorder helper that exists because
a short-lived notice can fall between two WebDriver polls — exactly the race that would
have turned this change's notice-absent assertion into a false pass.
