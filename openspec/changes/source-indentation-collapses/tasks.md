## 1. Measure before designing

- [x] 1.1 Measure, against a real instance, where each shape the report names actually renders:
      the line's own box, and where its text begins, for a paragraph, fence, table, quote and
      callout written blank-separated under a list item, in a space-indented file and a
      tab-indented one, plus a three-space paragraph under a heading as the control.
- [x] 1.2 Dump the DOM of those lines — every element holding part of the leading run, its
      computed width and where that width is stated — since the fix's shape depends on it.
- [x] 1.3 Write both into `docs/research/source-indentation-width.md`, with one row in
      `docs/research/index.md`.

## 2. The fact: what a line's own indentation IS

- [x] 2.1 `indentPrefixCh(line, columns)` in `src/parse.ts`: the character index that splits a
      line's own structural indentation from what follows, taking a character only if it fits
      whole.
- [x] 2.2 `LineDecorationFact.indentCh` in `src/plugin/decorate.ts`, measured against the node's
      FIRST line and capped there; 0 for a list item and for a line that leads with nothing.
- [x] 2.3 Fill the field in `src/plugin/footer-model.ts`'s two synthetic facts.
- [x] 2.4 Tests in `tests/decorate.test.ts`: the run covered for spaces and for a tab, 0 on every
      list-item line, the surplus kept on a deeper line inside a fence, a shallower line giving up
      its whole run, a straddling tab left whole, and a property over generated markdown that the
      index never points past the line's own whitespace. Negative control: each fails against
      `indentCh: 0`, and the cap tests fail against an uncapped run.

## 3. The rendering: collapse it

- [x] 3.1 `computeSourceIndent` and its own view plugin in `src/plugin/decorations.ts`, marking
      exactly those characters on every non-list line, registered beside the other mark plugins.
- [x] 3.2 `styles/70-source-indent.css`: the mark at no width, and the span Obsidian wrapped it
      in zeroed with it — `width`, `min-width`, `padding` and `margin`, since the run is stated
      as padding on a `border-box` element (design D2).
- [x] 3.3 Exclude a fence's INTERIOR lines from the wrapper rule, its own first and last lines
      excepted (design D3).
- [x] 3.4 Amend `10-editor.css`'s `text-indent: 0` comment, which stated the old behaviour of the
      leading spaces in place.

## 4. Prove it in the editor

- [x] 4.1 `e2e/specs/56-source-indent.e2e.ts`: every kind under one item on the child column, a
      fence's interior indentation kept, a tab-indented child on the same column as a
      space-indented one, the run itself collapsed, a list item's own indentation untouched, and
      nothing changed with outline mode off. Negative control: every column assertion fails
      against the layer disabled — measured before the fix at 72.17px and 82px where the column
      is 46px.
- [x] 4.2 Re-run the `decorations` group and re-record `53-decoration-dom-baseline`'s
      `space-indented-paragraph` baseline, desktop and mobile: the new mark is an intended
      addition to the plugin-owned DOM contract.
- [x] 4.3 `npm test`, `npm run lint`, `npm run build`, `npm run build:e2e`.

## 5. Validate

- [x] 5.1 `openspec validate source-indentation-collapses --strict`.
