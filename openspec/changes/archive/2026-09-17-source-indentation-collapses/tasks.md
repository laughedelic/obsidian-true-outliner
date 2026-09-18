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
- [x] 4.2 Re-run the `decorations` group, and every other group that positions chrome —
      `outline-mode`, `backlinks`, `folding`, `selection`. `53-decoration-dom-baseline`'s
      recorded baselines stay as they are: no line the fixtures hold takes the mark (task 5.1).
- [x] 4.3 `npm test`, `npm run lint`, `npm run build`, `npm run build:e2e`.

## 5. Close the review's findings

- [x] 5.1 Scope the fact to a node with a LIST-ITEM ANCESTOR (design D1). Found by review: the
      first version collapsed a depth-0 run too, flattening all five lines of the
      `space-indented-paragraph` fixture onto one column — the four-space line among them, whose
      run is the only thing saying it is an indented code block. Its recorded DOM baseline is the
      negative control, and reverts to `main`'s with the scope in place.
- [x] 5.2 Key the wrapper rule on the mark's own coverage rather than on the kind of line
      (design D3). Found by review: the fence-interior exclusion left every OTHER line whose run
      outruns its node unprotected. Negative control, measured: with the old rule,
      `      second deeper` under `  first line` renders at 46px, the same column as the line
      above it, all four surplus spaces gone.
- [x] 5.3 Cover the gaps the review named: a callout child, Obsidian's indentation guides turned
      off, a non-fence line indented deeper than its node, a child of a heading left alone, and
      the two scoping cases in `tests/decorate.test.ts`.
- [x] 5.4 Record the caret consequence — positions inside a collapsed run share one x — in
      `docs/research/decoration-follow-ups.md` and in the delta spec, since closing it is
      `content-space-caret`'s boundary rule rather than this layer's.

## 6. Validate

- [x] 6.1 `openspec validate source-indentation-collapses --strict`.

## 7. Close the manual pass's findings

- [x] 7.1 Restore the internal padding Obsidian gives a top-level fence and withholds from one
      written inside a list (`--size-4-4`), which the source indentation used to stand in for.
- [x] 7.2 Suppress Obsidian's own indentation aid on every line outline mode decorates, not only
      on a list line — it hangs off a span this layer leaves no width in, so its segments started
      inside the text they were meant to sit left of.
- [x] 7.3 Hide the node's OWN indentation only, and state no width for what a line carries past it
      (design D3). Closes the two shapes a stated width got wrong — a fence's own space advance,
      and a tab, which the earlier version skipped outright.
- [x] 7.4 Undisplay the characters rather than replacing them (design D2), so the caret at the
      boundary is not drawn against CM6's own `cm-widgetBuffer`; replace instead on a line that is
      indentation alone, where an undisplayed mark leaves the caret nowhere to stand.
- [x] 7.5 Floor the caret's motion and placement at the hidden indentation (design D5), in the
      predicate, both resolvers and the planner together, with `own-indent.ts` as the one
      definition both layers read.
- [x] 7.6 Rewrite `e2e/specs/56-source-indent.e2e.ts` for the final mechanism: 15 cases, the caret
      walk and the run's absence among them.
- [x] 7.7 File what the pass found that is not this layer's: #136, #137, #138 (parse and renderer
      disagreements) and #140 (Obsidian's own quantised caret steps in a top-level run).
