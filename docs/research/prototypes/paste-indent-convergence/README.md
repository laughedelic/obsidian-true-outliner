# Paste indent-unit differential

`paste-sweep.test.ts.txt` is the probe behind the figures in
[`../../paste-indent-convergence.md`](../../paste-indent-convergence.md). Copy it to
`tests/zz-paste-sweep.test.ts`, run it once on `main` and once on the branch, and compare:

```bash
OUT=/tmp/paste-main.json npx vitest run tests/zz-paste-sweep.test.ts
OUT=/tmp/paste-fix.json  npx vitest run tests/zz-paste-sweep.test.ts
SHOW=1 node docs/research/prototypes/paste-indent-convergence/compare.mjs /tmp/paste-main.json /tmp/paste-fix.json
```

Each row is one combination with the rejection or the resulting text and the tree shape its
re-parse reads. A `self` row is a copy of a node's own subtree pasted back after it, a `move`
row is a node moved to be the first child of a list item outside it, and a `matrix` row is one
tree in one spelling pasted into one destination.
