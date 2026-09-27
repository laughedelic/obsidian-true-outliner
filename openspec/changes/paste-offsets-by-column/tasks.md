# Tasks

## 1. The read-back and the offsets

- [x] 1.1 `readsAsWritten` reads the block with `stripFinalGap` instead of clearing the root's
  trailing gap; verify the blank-line paste and drop in `tests/edit-ops.test.ts` land in spaces
  (negative control: on `main` both write `⏵··1. m`)
- [x] 1.2 `rewriteOwnLine` keeps the column offset of a line at or past its node's indentation that
  does not open with it; verify the spelled-apart child lands as `      text` (negative control: on
  `main` it writes `··⏵text` and falls back)
- [x] 1.2a Carry a block root's own spelled-apart lines as before; verify `\t  cont1` / `\t\t> q1`
  pasted after `  para0` in `- a` / blank / `  para0` keeps `> q1` as text (negative control:
  keeping the root's lines in columns too writes `    > q1`, a quote)
- [x] 1.3 Verify "a line written in another unit from its node is carried as it was" still passes,
  now through the read-back
- [x] 1.4 Run the sweep in `docs/research/prototypes/paste-fallback-misfires/`; verify no run that
  converges on `main` falls back, and no converged run breaks the tree
- [x] 1.5 Run `npm test`, `npm run lint` and `npm run typecheck`

## 2. Validate

- [x] 2.1 `openspec validate paste-offsets-by-column --strict`
