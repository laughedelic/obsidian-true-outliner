## 1. Pin the defect

- [x] 1.1 Add `nextRung` unit cases for a task item's first rung: open, done with children,
      ordered, nested, an empty task, a paragraph starting with `[ ]`, and a plain item as
      control. Negative control: the open, done and empty cases must fail against the
      unmodified ladder, which reports a rung starting after `- `.
- [x] 1.2 Add an e2e case to `64-progressive-select-all` asserting the SETTLED first-press
      selection on `- [ ] buy milk` is `buy milk`, and the second press is the whole line.
      Negative control: against the unmodified ladder the settled anchor is column 0.

## 2. Move the rung

- [x] 2.1 Start a list item's own-content rung at `markerPrefixCh` in `select-all-ladder.ts`,
      and rewrite the comment that chose `contentColumnCh`; verify 1.1 passes.
- [x] 2.2 Correct the comments in `ops.ts` and `caret-policy.ts` that list the ladder among
      the consumers keeping `[ ]` as content.
- [x] 2.3 Run `npx vitest run` and verify every pre-existing case still passes.
- [x] 2.4 Run `npm run test:e2e:narrow -- 64-progressive-select-all` and verify the spec passes.

## 3. Close the change

- [x] 3.1 Run `npm run lint`, `npx tsc --noEmit` and `npm run build:e2e`; verify all clean.
- [x] 3.2 Run `openspec validate select-all-task-content --strict`.
