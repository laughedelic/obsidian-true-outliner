# Tasks

## 1. The fallback moves every line by the root's width

- [x] 1.1 Export `reprefixLine` from `src/reencode.ts`, and write `reindentSubtreeVerbatim`'s
  non-atom lines and block-id line through it, blank lines left alone; verify the #244 paste and
  drop cases in `tests/edit-ops.test.ts` pass (negative control: on `main` both write `  \t1. m`)
- [x] 1.2 Move an atom's first line through `reprefixLine` and its other lines by that line's
  change of prefix; verify the fence-under-`1. m` case passes (negative control: on `main` the
  fence lands two columns short) and the Makefile-tab case keeps `    \techo` (negative control:
  routing content lines through `reprefixLine` writes `  \t  echo`)
- [x] 1.3 Add the mixed-prefix case, a descendant not opening with the root's `\t`; verify it
  passes (negative control: on `main` `- n` stays at column 6 while `- p` moves left)
- [x] 1.4 Run both sweeps in `docs/research/prototypes/verbatim-reindent-columns/`; verify zero
  failures and zero regressions against `main`
- [x] 1.5 Run `npm test`, `npm run lint` and `npm run typecheck`; verify all pass

## 2. Validate

- [x] 2.1 `openspec validate verbatim-reindent-keeps-columns --strict`
