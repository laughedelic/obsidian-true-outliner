## 1. The rule

- [x] 1.1 Add `destinationListStyle` to `src/rules.ts`, beside `encodingKindAtDestination` and
      `destinationHeadingLevel`, reading its donor the same way — nearest preceding list-item
      sibling, else nearest following, else the default (D1).
- [x] 1.2 Export `DEFAULT_LIST_STYLE` from the same file and have `itemStyleFrom` (`src/ops.ts`)
      use it, so the `-` fallback is written once (D1).
- [x] 1.3 Give `headingAsListItem` a `style` parameter defaulting to `DEFAULT_LIST_STYLE`, and
      write its marker from that style rather than from a literal `-`.
- [x] 1.4 The same for `reencodeForDestination`'s paragraph-to-list-item arm. Its content column
      is the marker's width plus one, so the continuation padding and the child delta are
      computed from the marker rather than from a hardcoded 2 (D2).
- [x] 1.5 Thread the style from `reencodeBlocksForDestination` through `reencodeIntoListScope`,
      passing it at the payload's top level and dropping it in the recursion (D3).
- [x] 1.6 Pass it at the three conversion sites OUTSIDE the insert path too — indent's arrival,
      outdent's arrival, and outdent's adopted siblings. Each already built the sibling slices
      for `encodingKindAtDestination`; lift each into a named context and hand it to both rules,
      so the two can never read different surroundings (D5).

## 2. What it does, by example

- [x] 2.1 A heading joining a `*` run is written `*`, and the scope still renders as one list.
- [x] 2.2 The same for `+`.
- [x] 2.3 An ordered run donates its delimiter with its type: into `1)` / `2)`, the arrival is
      `2)`.
- [x] 2.4 A heading joining `8.` / `9.` / `10.` becomes `10.`, pushes `10. ten` to `11.`, and its
      own child sits at the content column the wider marker gives it.
- [x] 2.5 A PARAGRAPH payload converts the same way — the commoner of the two payloads, and the
      other site that hardcoded `-`.
- [x] 2.6 A following sibling donates where there is no preceding one.
- [x] 2.7 The payload's own nested rows keep the default marker (D3).
- [x] 2.8 An arriving list item still keeps its own marker (D4).
- [x] 2.9 A task donor donates its marker and not its checkbox.
- [x] 2.10 A destination with no list to copy leaves the default.
- [x] 2.11 An INDENT converting a paragraph into a `*` run writes `*`, and into an ordered run
      takes the next number.
- [x] 2.12 An OUTDENT arrival does the same in both regimes.

## 3. The layer below

- [x] 3.1 Update `a-split-run-keeps-its-own-numbers`'s heading case: the payload now JOINS the
      run rather than dividing it, so the case asserts `10. ## H` / `11. ten` and says why that
      is renumbering working rather than the defect that layer fixed.
- [x] 3.2 Narrow that layer's paste property to payloads that cannot join a run, and state the
      reason in its doc comment. Re-measure its floors to confirm the reach is unchanged. Its
      suite name says the narrowed premise rather than the old one, which headings and
      paragraphs now satisfy while legitimately rewriting markers.

## 4. Measurement and validation

- [x] 4.1 Render the fragmented and unfragmented frames with `commonmark` and record the list
      counts.
- [x] 4.2 Write `docs/research/destination-list-style.md` and its one index row.
- [x] 4.3 `npm test`, `npm run build`, `npm run build:e2e`, `npm run lint`, `openspec validate`.
- [x] 4.4 The e2e sweep, which the pushed checkpoint runs in CI: green on `1ce19c9`, desktop and
      mobile.
- [ ] 4.5 Manual testing in Obsidian, including what Obsidian's own renderer does with the
      divided `*` frame — the figures above are `commonmark`'s.
