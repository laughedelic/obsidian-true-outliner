## 1. State what a node's lines parse as

- [x] 1.1 In `src/parse.ts`, add `OPENING_MARGIN` beside the anchors that carry it, with the list
      of regexes it is read from (D2).
- [x] 1.2 Add `kindAsWritten`, demoting `hr`, `quote`, `callout`, `html` and `heading` where the
      line that opens them sits past the margin, and returning every other kind unchanged. Read a
      setext heading's underline rather than its first line (D3).
- [x] 1.4 Read the demoted kind off the line rather than assuming a paragraph: a rule spelled
      `- - -` or `* * *` opens a list item past the margin, where `---` opens nothing (D4).
- [x] 1.3 Write its doc comment as the reason a caller needs it: the tree's kind and the parse's
      kind disagree exactly where a re-indent has happened (D1).

## 2. Separate the seam on that kind

- [x] 2.1 In `needsBlankBetween` (src/ops.ts), take both sides' kinds from `kindAsWritten` and
      leave every rule as it stands.
- [x] 2.2 In `normalizeBoundaries`, ask `swallowedAsContinuation` about the first child's written
      kind for the same reason — which is what keeps a `- - -` first child, a list item where it
      lands, from taking the separator its `hr` kind would ask for.
- [x] 2.3 State the order the two steps run in at the top of `needsBlankBetween`, since that
      order is what the fix is about.

## 3. The shapes, by example

- [x] 3.1 In `tests/edit-ops.test.ts`, `kindAsWritten` at both sides of the margin for every kind,
      including the setext underline and the two kinds that have no margin.
- [x] 3.2 The issue's case 2: a `- item` / `> quote` payload landing before a tab-indented
      paragraph in a heading scope keeps all three nodes, and the encoding is stated in full.
- [x] 3.3 The same destination across every margin-anchored atom — `---`, `***`, `> quote`,
      `> [!note] titled`, `<div>` — asserting the payload's own node count arrives.
- [x] 3.4 The control that says the demotion is what adds the separator, not the kind pair: the
      same payload into the same scope at column 0 stays flush and keeps the quote a quote.
- [x] 3.5 A payload ending in `- - -` into the same scope: no separator on either side, every
      node present, the rule's line a list item (D4).
- [x] 3.6 The same seam with the payload landing AFTER the anchor, which is where half the rows
      `main` loses are.

## 4. Measurement

- [x] 4.1 Differential against `main` over 696 (destination, anchor, position, payload)
      combinations: rows losing a payload node, verdict changes, and encodings differing. The
      payload set covers both rule spellings, since they part company past the margin.
- [x] 4.2 Check the removed separator against `commonmark` 0.31.2, both encodings.
- [x] 4.3 Measure what `commonmark` reads at a list item's child column, which is the measurement
      #158 asks for and does not have, and record it as the kind loss's frame.
- [x] 4.4 Record all of it in `docs/research/seams-across-a-re-indent.md` with the probe under
      `docs/research/prototypes/seam-differential/`, one row in the research index.

## 5. Validate

- [x] 5.1 `npm run build`, `npm test`, `npm run lint`.
- [x] 5.2 The new cases fail on `main` and pass on the branch.
- [x] 5.3 E2E sweep in CI on the pushed checkpoint.
- [x] 5.4 Review round: `kindAsWritten` against `parse` over every rule spelling and whitespace
      shape, and the change's own prose against the code.
- [ ] 5.5 Sync the delta spec, archive the change, bump the version.
