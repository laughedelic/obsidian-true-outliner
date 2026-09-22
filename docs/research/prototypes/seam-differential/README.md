# Seam differential

`seam-differential.test.ts.txt` is the probe behind the figures in
[`../../seams-across-a-re-indent.md`](../../seams-across-a-re-indent.md). Copy it to
`tests/seam-differential.test.ts`, run it once on `main` and once on the branch, and compare the
two JSON files:

```bash
DIFF_OUT=/tmp/diff-main.json npx vitest run tests/seam-differential.test.ts
DIFF_OUT=/tmp/diff-fix.json  npx vitest run tests/seam-differential.test.ts
```

Each row is one (destination, anchor, position, payload) combination with the verdict, the node
count the insertion added, the node count the payload carried, and the resulting text. A row
whose `delta` is short of its `payloadNodes` is a row that lost a node.

`seam-sweep.test.ts.txt` is the second probe: every bare seam between two sibling roots, built
directly and run through `finalize` rather than reached through `insertSubtrees`. It writes the
pairs that come back a node short:

```bash
SWEEP_OUT=/tmp/sweep.txt npx vitest run tests/seam-sweep.test.ts
```
