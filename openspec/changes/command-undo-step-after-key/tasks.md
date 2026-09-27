# Tasks

## 1. Reproduce

- [x] 1.1 Record in `docs/research/command-undo-join` which key-then-command sequences join in the app, and why a same-task e2e holds the timing
- [x] 1.2 e2e `20-structural-commands` "a command run straight after a structural key is its own undo step": ⇧⏎ keydown and the indent command in one page task, then undo twice. Negative control: fails on `main`, one undo gives `- one` / `- foo`
- [x] 1.3 Unit case in `tests/minimal-change-history.test.ts` pinning the CodeMirror join a keypress-shaped entry allows. Negative control: without the re-assertion, one undo reverts both

## 2. Fix

- [x] 2.1 `runOp` re-asserts the current selection on the view, `filter: false`, before reading its start state and dispatching
- [x] 2.2 Narrow e2e: `20-structural-commands` passes on desktop and mobile emulation

## 3. Validate

- [x] 3.1 `openspec validate command-undo-step-after-key --strict`
