# Verbatim re-indent columns

The sweeps behind [`../../verbatim-reindent-columns.md`](../../verbatim-reindent-columns.md).

Each sweep pastes and drops a `- p` block whose paragraph after a blank line sends it to the
verbatim re-indent, with `- n` / `1. m` below it spelled every way up to four whitespace
characters, under six root prefixes and at six destinations. It counts a case as failing when
the moved block no longer parses as the tree it had. `sweep-with-tails.test.ts.txt` adds a fenced
block, a quote or a block id under `1. m`.

`A` is `main`, copied to `zz-src-main/`; `B` is the working tree. From the repository root:

```bash
mkdir zz-src-main && git archive main src | tar -x -C zz-src-main --strip-components=1
cp docs/research/prototypes/verbatim-reindent-columns/sweep.test.ts.txt tests/zz-sweep.test.ts
SWEEP_OUT=sweep.out npx vitest run tests/zz-sweep.test.ts && head -1 sweep.out
```

`aFail` and `bFail` count failures under `main` and the working tree, `regress` the cases `main`
keeps and the working tree breaks.
