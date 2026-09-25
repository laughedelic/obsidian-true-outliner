## 1. Measure

- [x] 1.1 Reproduce #216's cases through `computeVerdict` and `insertSubtrees` on `main`.
- [x] 1.2 A differential over a copy of every node pasted back after itself, every node moved
      under every list item outside it, and the issue's spelling matrix, over targeted shapes and
      the corpus, each with a tab, a two-space and a four-space fallback unit; the probe under
      `docs/research/prototypes/paste-indent-convergence/`.
- [x] 1.3 Re-run #203's indent differential against the unit inference change.
- [x] 1.4 Record it in `docs/research/paste-indent-convergence.md`, one row in the index.

## 2. Write each level from its depth

- [x] 2.1 In `src/reencode.ts`, `rewriteOwnLine` (D2) and `reprefixAtomLines` (D3).
- [x] 2.2 In `src/ops.ts`, `reindentSubtreeInUnit` in place of `reindentSubtreeVerbatim` (D1–D3),
      with the unit read once in `reencodeBlocksForDestination`.
- [x] 2.3 `reencodeIntoListScope` writes a converted heading's levels in the unit (D6).
- [x] 2.4 `inferIndentUnit` reads the step under a bullet first (D4).
- [x] 2.5 `moveSubtreesTo` passes the unit read before the removal as the fallback (D5).

## 3. The shapes, by example

- [x] 3.1 In `tests/edit-ops.test.ts`, one tree in five spellings into five destinations, one
      set of bytes each. Negative control: the verbatim re-indent, which gives five.
- [x] 3.2 A copy of every list item in five consistent documents comes back byte-identical.
      Negative control: the first indented item's whitespace as the unit, which moves the
      numbered-first document's bullets one column.
- [x] 3.3 A document with no nested item takes the editor's unit; a child under `10.` is padded
      to its content column; a continuation keeps its offset; a fenced block keeps its tabs; a
      converted heading writes its section in tabs. Negative control for each: `main`.
- [x] 3.4 A move keeps the document's unit, and an indent reads the unit under a bullet. Negative
      controls: the unit read after the removal, and the first indented item's whitespace.
- [x] 3.5 In `tests/enforce.test.ts`, the caret-paste path for #216's cases 1 and 3, and the
      tab-vault case that pinned the clipboard's two spaces updated to the tab.
- [x] 3.6 `e2e/specs/31-tab-indented-vault.e2e.ts`: a two-space list pasted into a tab list, and
      a four-space list pasted at the root of a tab document, buffer and caret.

## 4. Validate

- [x] 4.1 `npm run build`, `npm test`, `npm run lint`, `npm run build:e2e`.
- [x] 4.2 The new cases fail on `main` and pass on the branch.
- [ ] 4.3 E2E sweep in CI on the pushed checkpoint.
- [x] 4.4 Review round: a block after a re-laid nested item written at its parent's content
      column (D2), a line outside its node's indentation carried as it was (D2), a spelled
      offset taken from the source line, and a converged block read back and kept as it arrived
      where its tree differs (D7). Each with a test that fails with its fix off, and the
      fuzzer committed beside the probe (`fuzz.ts.txt`).
- [ ] 4.5 Manual check in Obsidian with **Indent using tabs** on and off: #216's cases 1 to 6,
      and a copy pasted back within the note unchanged.
- [ ] 4.6 Sync the delta spec, archive the change, bump the version.
- [ ] 4.7 `openspec validate a-paste-writes-the-document-unit --strict`.
