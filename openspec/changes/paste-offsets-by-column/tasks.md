# Tasks

## 1. The read-back and the offsets

- [x] 1.1 `readsAsWritten` reads the block with `stripFinalGap` instead of clearing the root's
  trailing gap; verify the blank-line paste and drop in `tests/edit-ops.test.ts` land in spaces
  (negative control: on `main` both write `⏵··1. m`)
- [x] 1.2 `rewriteSubtree` places a child's first line that does not open with its parent's
  indentation by its column offset from the parent (`keepColumnPast`); verify the spelled-apart
  child lands as `      text` (negative control: on `main` it writes `··⏵text` and falls back)
- [x] 1.2a A node's own lines spelled apart from it are carried with the root's prefix, the root's
  and a nested node's alike; verify the root case (`\t  cont1` / `\t\t> q1` after `  para0`) keeps
  `> q1` as text, and the nested case (`- p` / `\t- k` / `  \tx` / `      > q` after `  1. b`)
  converges with `> q` a line of `x` (negative control: keeping own lines in columns writes a
  quote in the first and falls back in the second)
- [x] 1.3 Verify "a line written in another unit from its node is carried as it was" still passes,
  now through the read-back
- [x] 1.4 Run the sweep in `docs/research/prototypes/paste-fallback-misfires/`; verify no run that
  converges on `main` falls back, and no converged run breaks the tree
- [x] 1.5 Run `npm test`, `npm run lint` and `npm run typecheck`

## 2. Validate

- [x] 2.1 `openspec validate paste-offsets-by-column --strict`
