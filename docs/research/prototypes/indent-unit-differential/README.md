# Indent-unit differential

`indent-sweep.test.ts.txt` is the probe behind the figures in
[`../../indent-unit-on-every-line.md`](../../indent-unit-on-every-line.md). Copy it to
`tests/zz-indent-sweep.test.ts`, run it once on `main` and once on the branch, and compare:

```bash
OUT=/tmp/indent-main.json npx vitest run tests/zz-indent-sweep.test.ts
OUT=/tmp/indent-fix.json  npx vitest run tests/zz-indent-sweep.test.ts
SHOW=1 node docs/research/prototypes/indent-unit-differential/compare.mjs /tmp/indent-main.json /tmp/indent-fix.json
```

Each row is one (document, node, operation, fallback unit) combination with the rejection or the
resulting text and the tree shape its re-parse reads.
