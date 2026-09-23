## 1. Measure

- [x] 1.1 Reproduce #154's three units through `indent` on `main`.
- [x] 1.2 A differential over `indent` and `outdent` on every node of targeted shapes and the
      corpus, each with a tab, a two-space and a four-space fallback unit, recording verdict,
      re-parsed tree shape and text; the probe under
      `docs/research/prototypes/indent-unit-differential/`.
- [x] 1.3 Check the changed encodings against `commonmark` 0.31.2.
- [x] 1.4 Record it in `docs/research/indent-unit-on-every-line.md`, one row in the index.

## 2. Swap the prefix

- [x] 2.1 In `src/reencode.ts`, add `reprefixLine` / `reprefixSubtree`: swap the node's own
      first-line prefix for `indentText` where the result lands on the delta's column and puts
      no new space in front of a tab, else `shiftLine` (D2, D3).
- [x] 2.2 In `reencodeForDestination`'s no-conversion branch, apply the marker-run
      normalization with `shiftBelowMarker`, then the prefix swap (D4).

## 3. The shapes, by example

- [x] 3.1 In `tests/ops.test.ts`, #154's three units, each asserting the continuation line opens
      with the unit its first line took.
- [x] 3.2 A node with a child and a child continuation, into a tab-indented sibling scope.
- [x] 3.3 The fallback: a continuation line carrying a tab past the prefix lands on its column.
- [x] 3.4 An outdent back out restores the original lines.
- [x] 3.5 Update the `tests/plugin.test.ts` minimal-change case that pinned the spaces, and the
      e2e comment that named `shiftLine` as the source of its descendant's indentation.

## 4. Validate

- [x] 4.1 `npm run build`, `npm test`, `npm run lint`.
- [x] 4.2 The new cases fail on `main` and pass on the branch.
- [ ] 4.3 E2E sweep in CI on the pushed checkpoint.
- [ ] 4.4 Review round.
- [ ] 4.5 Manual check in Obsidian with **Indent using tabs** on: #154's case 1.
- [ ] 4.6 Mark `decoration-follow-ups.md`'s entry closed, keeping its measurements; sync the
      delta spec, archive the change, bump the version.
