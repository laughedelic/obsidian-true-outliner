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

`fuzz.ts.txt` is the differential fuzzer from the review round. It generates random documents
and payloads in tabs, one to four spaces and mixed units, with every marker shape, continuation
and lazy lines, and atoms as children. It compares the tree each result re-parses to with the
tree intended by splicing the payload's (or the moved node's) own shape in. Copy it to
`tests/zz-fuzz.ts`, and extract `main`'s sources beside it (`git archive origin/main src | tar
-x -C tests/main`) so its `./main/src/` import resolves, then run:

```bash
MODE=insert INT=1 N=20000 SHOW=3 npx tsx tests/zz-fuzz.ts   # also MODE=move, MODE=indent;
                                                            # NOTABRUN=1 NOHEAD=1 narrow the shapes
```

It prints `regress` (main keeps the intended tree and the branch does not) and `improve` (the
reverse).
