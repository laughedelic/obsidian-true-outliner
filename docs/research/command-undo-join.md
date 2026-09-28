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
`selectionsAfter`.

Two transactions end that window. A selection-only transaction fills the slot: `addSelection`
records the start selection, even an unchanged one, when `selectionsAfter` is empty. An
`isolateHistory` annotation of `before` or `full` resets `prevTime`, so the next change fails the
`newGroupDelay` test, and records nothing on the previous event.

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
| ⏎, then "Move node up" by command id | 87 ms | `- one` / `- ` / `- foo` | `- one` / `- foo` / `- ` | no |
| ⏎, then the move-up hotkey | 87 ms | `- one` / `- ` / `- foo` | `- one` / `- foo` / `- ` | no |
| ⏎ and the move-up hotkey in one WebDriver action | 61 ms | `- one` / `- ` / `- foo` | `- one` / `- foo` / `- ` | no |
| `x` typed, then "Move node up" by command id | 70 ms | `- foox` / `- one` | `- one` / `- foox` | no |
| `x` typed, then the move-up hotkey | 70 ms | `- foox` / `- one` | `- one` / `- foox` | no |
| `x` and the move-up hotkey in one WebDriver action | 51 ms | `- foox` / `- one` | `- one` / `- foox` | no |

`·` is a space on a line of only spaces.

Readings:

- **The indent joins after ⇧⏎; no measured move or typing sequence joins.** Why each of those
  stays apart was not established by measurement. A bare CM6 model driven by our planners
  suggests two different reasons: after ⇧⏎ and after typing the move's narrowed change set
  (`aligned-change-set-narrowing`) is not adjacent to the key's change, and after ⏎ the key's
  own caret is recorded by `history-caret` before a separate-task command arrives. The same
  model predicts a join for typing followed by an adjacent command, such as `x` at the end of
  `- foo` then "Move node down" over `- bar`. Not measured.
- **Separate WebDriver calls land well inside the window here,** but nothing holds them there
  on a slower runner. Dispatching the keydown and running the command in one page task holds
  them there by construction: CodeMirror runs a keymap binding on a synthetic `keydown`. The
  same task also runs before any microtask the key queues, so for a key whose caret
  `history-caret` records it shows a join that separate gestures would not. ⇧⏎'s caret is not
  recorded, so the case chosen is not affected.

## With the fix

`runOp` dispatches an `isolateHistory` `before` annotation on its own before the command's
change. It carries no selection, so no selection listener runs and nothing is recorded on the
key's event. The e2e case `20-structural-commands` "a command run straight after a structural
key is its own undo step" fails on `main`: one undo gives `- one` / `- foo`. On the fix it
passes, desktop and mobile emulation: one undo gives `- one` / `- foo` / `··` with the caret at
line 2, column 2, and a second undo gives `- one` / `- foo`.

A selection-only re-assertion fixes the same case, measured on this branch before the
annotation replaced it. It also writes the current selection onto the previous event, which
changes where that event's redo puts the caret when the event was an edit whose caret mapping
cannot reproduce.
