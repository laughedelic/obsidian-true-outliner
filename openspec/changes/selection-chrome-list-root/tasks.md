## 1. Pin the defect

- [x] 1.1 Add an e2e case to `63-selection-visual-treatment` rooting a cover at a nested
      bullet and asserting its edge sits at the content origin (one level out from depth 1),
      a deeper root steps one level further in, and a top-level bullet reaches one unit out.
      Negative control: against the unmodified target every list root resolves one unit past
      the origin, so the depth-1 and depth-2 assertions fail.
- [x] 1.2 Add a pure-list mixed-depth cover case asserting the two roots take different
      columns. Negative control: the unmodified target gives both the same column.

## 2. Fix the target

- [x] 2.1 Replace the list-item branch of the root target in `decorations.ts` with the uniform
      `(depth − 1) × unit`, and rewrite the two comments that stated the retired premise;
      verify 1.1 and 1.2 pass with `npm run test:e2e:narrow -- 63-selection-visual-treatment`.
- [x] 2.2 Run the whole spec file and verify every pre-existing case still passes.

## 3. Close the change

- [x] 3.1 Run `npm run lint`, `npx tsc --noEmit`, `npm run build:e2e` and `npx vitest run`;
      verify all clean.
- [x] 3.2 Run `openspec validate selection-chrome-list-root --strict`.
