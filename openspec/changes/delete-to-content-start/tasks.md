## 1. Pin the defect

- [x] 1.1 Add `planDeleteToContentStart` unit cases: past the marker on a bullet, a nested
      item and an ordered item; a task item; a continuation line; at and inside the content
      start; a paragraph, a heading, an atom and a gap line. Negative control: none exist
      against the unmodified tree, so the file fails to compile without the planner.
- [x] 1.2 Add e2e cases D1–D6 to `65-content-space-caret` driving the command: D1 asserts the
      node survives with the rewrite counter unmoved, D5 asserts the merge with the counter
      moved, D6 asserts a paragraph stays stock. Negative control: with the command falling
      back unconditionally, D1's buffer reads `- gamma` and the counter reads 1.

## 2. Bind the rule

- [x] 2.1 Add the planner to `caret-policy.ts`; verify 1.1 passes.
- [x] 2.2 Add `deleteToContentStart` to `keymap.ts` with the `mac`-only binding, and the
      `delete-to-content-start` command to `main.ts`; verify 1.2 passes with
      `npm run test:e2e:narrow -- 65-content-space-caret "delete to content start"`.
- [x] 2.3 Run the whole `65-content-space-caret` spec and verify Home/End cases still pass.

## 3. Close the change

- [x] 3.1 Run `npx vitest run`, `npm run lint`, `npx tsc --noEmit` and `npm run build:e2e`;
      verify all clean.
- [x] 3.2 Run `openspec validate delete-to-content-start --strict`.
