# A command's undo step and the edit before it

Measured for #250 on `main` at `04879ad`, Obsidian 1.13.7 (installer 1.5.8), Linux, desktop
narrow mode in a cloud session. The probe is
[`prototypes/command-undo-join/probe.e2e.ts.txt`](prototypes/command-undo-join/probe.e2e.ts.txt).

## The mechanism

`@codemirror/commands`' `HistoryState.addChanges` joins a new change into the previous history
event when all of these hold:

- the NEW transaction has no `userEvent`, or one matching `input.type` or `delete`. The previous
  event's own `userEvent` is not consulted;
- the previous event has no `selectionsAfter`;
- the two land within `newGroupDelay` (500 ms);
- the two change sets are adjacent.

A structural command dispatches through `Editor.transaction` with no `userEvent`. A keypress of
ours dispatches its caret in the same transaction as its change, which leaves its event with no
`selectionsAfter`. A selection-only transaction afterwards is what fills that slot:
`addSelection` records the start selection, even an unchanged one, when `selectionsAfter` is
empty.

## Which sequences join

Each run starts from `- one` / `- foo`, caret at the end of `- foo`, runs the steps, then presses
undo once. "Gap" is the wall time the steps took, measured from the test process.

| Steps | Gap | After the steps | After one undo | Joined |
| --- | --- | --- | --- | --- |
| ⇧⏎, then "Indent node" by command id | 95 ms | `- one` / `  - foo` / `····` | `- one` / `- foo` | yes |
| ⇧⏎ keydown dispatched and "Indent node" run in one page task | 63 ms | `- one` / `  - foo` / `····` | `- one` / `- foo` | yes |
| ⇧⏎, then "Move node up" by command id | 72 ms | `- foo` / `··` / `- one` | `- one` / `- foo` / `··` | no |
| ⇧⏎, then the move-up hotkey | 88 ms | `- foo` / `··` / `- one` | `- one` / `- foo` / `··` | no |
| ⇧⏎ and the move-up hotkey in one WebDriver action | 102 ms | `- foo` / `··` / `- one` | `- one` / `- foo` / `··` | no |
| `x` typed, then "Move node up" by command id | 70 ms | `- foox` / `- one` | `- one` / `- foox` | no |
| `x` typed, then the move-up hotkey | 70 ms | `- foox` / `- one` | `- one` / `- foox` | no |
| `x` and the move-up hotkey in one WebDriver action | 51 ms | `- foox` / `- one` | `- one` / `- foox` | no |

`·` is a space on a line of only spaces.

Readings:

- **The indent joins and the move does not.** The move's narrowed change set
  (`aligned-change-set-narrowing`) touches no position adjacent to the place ⇧⏎ opened, so
  adjacency fails even inside the window.
- **Typing does not join in the app,** by either entry point, although a bare CM6 state with
  the same transactions does join. Something in Obsidian's input path dispatches a selection
  after the typed change. Which transaction does it was not isolated.
- **Separate WebDriver calls land well inside the window here,** but nothing holds them there
  on a slower runner. Dispatching the keydown and running the command in one page task holds
  them there by construction: CodeMirror runs a keymap binding on a synthetic `keydown`.

## With the fix

`runOp` re-asserts the current selection before its dispatch, so the key's event gets its
`selectionsAfter`. The e2e case `20-structural-commands` "a command run straight after a
structural key is its own undo step" fails on `main`: one undo gives `- one` / `- foo`. On the
fix it passes, desktop and mobile emulation: one undo gives `- one` / `- foo` / `··` with the
caret at line 2, column 2, and a second undo gives `- one` / `- foo`.
