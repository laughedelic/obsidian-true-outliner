# Tasks

## 1. Parse a heading line inside an open item as text the item holds

- [ ] 1.1 In `segment` (`src/parse.ts`), open an ATX heading only where no list item is open at the line after popping the ones it is short of; verify with a parse test of the spec's "A heading under an item is a paragraph child at any indentation" (ATX and tab rows) and "A heading line is held by the outer item it reaches". Negative control: restoring the unconditional `ATX_RE.exec(line)` reads `  ## H` as a root heading that takes `more`.
- [ ] 1.2 In the paragraph loop, stop at an ATX line and take a setext underline (including the `---` the interruption test stopped at) only where the line is short of the outermost open item's content column; verify with parse tests of "A setext underline inside an open item is paragraph text", the setext row of the first scenario, and a paragraph followed by `  ## H` with no blank line reading as one two-line paragraph child. Negative control: dropping the column check from the underline turns `  para` / `  ---` back into a root setext heading.
- [ ] 1.3 Pin the decision's scope with parse tests of "An item's paragraph child keeps the item open for a heading line" and "A heading line after the list is closed is a section heading" (both the `para` and the `---` spellings); negative control for the first: keying on the node directly above (a heading line after a paragraph closes the list) reads `  ## H` as a root heading.
- [ ] 1.4 In `tests/roundtrip.test.ts`, move "#136: a heading under an item stays measured from column 0" to the one-space shape its scenario now names (a heading line short of `- a`'s content column, still a root heading), and "a setext heading closes the margin, as an ATX heading does" to `- a` / blank / `  para` / an underline at column 0 / `    > q`, once with `---` and once with `=====`; add the tab and two-space shapes as the paragraph-child test; verify `npx vitest run tests/roundtrip.test.ts` passes. Negative controls: treating any indented heading line as held by the item reads ` # heading` as a child; removing the stack clearing after the paragraph loop (the `---` the interruption test stopped at) reads the `---` row's last line as a quote, and removing it from the loop's underline branch does the same to the `=====` row.

## 2. Judge seams by the parse's new reading

- [ ] 2.1 Make `promote` report a heading line as a heading only at margin 0, and `demote` report a heading written at a margin above 0 as a paragraph, or a list item where the line carries a marker, as `structural-operations`' "Boundary separation is judged on the kind the re-parse will read" now states; extend the `kindAsWritten` tests in `tests/edit-ops.test.ts` with `at('heading', '  ## H', 2)` and `at('paragraph', '  ## H', 2)` reading `paragraph` and `at('heading', '  - ## H', 2)` reading `list-item`, and retitle the test that says a heading is measured from column 0 ("kindAsWritten measures a quote, a callout and a rule from the margin, and a heading or an HTML block from column 0") to say an HTML block is, and a heading is judged a heading only outside every list item. Negative control: reverting `promote` reads `heading` for the paragraph.
- [ ] 2.2 Rewrite the three seam tests in `tests/edit-ops.test.ts` that build a heading at an item's content column: the `seam()` rows for `  ## H` and `  Title` / `  =====` now come back as paragraph children; "deleting the node between a list item and a heading at its content column keeps the heading" moves to `- item` / `  - other` / blank / `  ## H`, deleting `  - other` and keeping the blank line that stops `- item`'s own-lines loop; "a line the continuation loop reads as a table header keeps its node" reads the pair as a table child under the item. Verify each fails with 1.1 reverted.
- [ ] 2.3 Run `npx vitest run` and verify the whole unit suite passes, the round-trip and seam properties included.

## 3. The drawn case and the real app

- [ ] 3.1 Remove `known-failing: #136` and the `actual` column from `e2e-tests/cases/document-tree-mapping/a-heading-line-in-an-open-item-is-its-child.case`; verify `npm run case` passes on desktop and with `--mobile`. Negative control: with 1.1 reverted the case fails, drawing the heading line left at column 2.
- [ ] 3.2 With `driving-obsidian`, open the case's document in outline mode and look at the heading-styled paragraph child under `- other`: its marker and guide sit at the item's child depth, as a four-space `    ## H` does on `main`. Record what was seen in the PR.
- [ ] 3.3 Run the e2e group covering `document-tree-mapping` in narrow mode and verify it passes (`npm run test:e2e:narrow -- <spec>` for each spec that names the capability).

## 4. Validate

- [ ] 4.1 Run `npm run lint` and `npm run typecheck`, and verify both pass.
- [ ] 4.2 Run `openspec validate heading-line-in-an-open-item --strict` and verify it passes.
