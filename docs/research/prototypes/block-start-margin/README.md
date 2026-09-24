# Block-start margin

The probes behind [`../../block-start-margin.md`](../../block-start-margin.md), and the prototype
itself.

`implementation.patch.txt` is the change to `src/parse.ts` and `src/ops.ts` against `main` at
`c6b12c5`: `git apply docs/research/prototypes/block-start-margin/implementation.patch.txt`.

**The column probe.** `cases.mjs.txt` generates the 610 documents; `commonmark-reading.mjs.txt`
reads each with `commonmark` 0.31.2 (install it wherever the script runs);
`column-probe.test.ts.txt` reads each with `parse`; `compare.mjs.txt` tabulates the three.

```bash
cp cases.mjs.txt cases.mjs && node -e "import('./cases.mjs').then(m=>require('fs').writeFileSync('cases.json',JSON.stringify(m.default)))"
cp commonmark-reading.mjs.txt commonmark-reading.mjs && node commonmark-reading.mjs > commonmark.json
# from the repository root, once on main and once with the patch applied:
cp docs/research/prototypes/block-start-margin/column-probe.test.ts.txt tests/column-probe.test.ts
CASES=<dir>/cases.json PROBE_OUT=<dir>/main.json npx vitest run tests/column-probe.test.ts
```

**The corpus.** `corpus-kinds.test.ts.txt` writes every corpus and test-vault note's nodes as
kind, first line and child count, to diff between the two runs.

**Through the operations.** `seam-differential-kinds.test.ts.txt` is
`../seam-differential/seam-differential.test.ts.txt` with an `atomsLost` column;
`seam-sweep-margin.test.ts.txt` is that directory's sweep with an oracle that reads a node below
a list item from the item's content column. Both run as their originals do.
