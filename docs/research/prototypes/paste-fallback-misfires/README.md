# Paste fallback misfires

The probes behind [`../../paste-fallback-misfires.md`](../../paste-fallback-misfires.md).

Both read instrumented copies of `src/` that count the verbatim fallback: in each copy,
`reindentSubtree`'s return is replaced by

```ts
if (readsAsWritten(converged)) return converged;
const g = globalThis as any; g.__fb = (g.__fb ?? 0) + 1;
return reindentSubtreeVerbatim(node, indentText);
```

- `zz-m/` is `main` so instrumented; `zz-f/` is this branch; `zz-g/` is this branch with #270's
  `src/ops.ts` and `src/reencode.ts` changes applied on top.
- `sweep.test.ts.txt` pastes 30 000 random `- p` payloads (pieces `- n`, `1. m`, `> q`, `| a |`,
  `text`, `2. x`, `- k`, fences; indentation of up to five spaces and tabs, or spaces only) at five
  destinations. A payload that parses as more than one root, or holds an unclosed fence, is
  skipped. It counts the runs that reach the fallback and the runs whose `- p` no longer
  re-parses as the tree it had; its `for` line picks the copies compared.
- `exhaustive.test.ts.txt` writes every spelling of three lines under one root (three piece sets,
  five roots, 14 indentations per line) at six list destinations, and counts new fallbacks, trees
  `main` kept and the branch breaks, and the reverse. Its copies count `convertInUnit`'s fallback
  as well as `reindentSubtree`'s.
- `smallest.test.ts.txt` walks two-line payloads under `- p` and lists the shortest that reach the
  fallback on `zz-f/` and change tree there.

Copy a file into `tests/` without its `.txt` suffix and run it with `npx vitest run`; results land in
the scratch path the file names.
